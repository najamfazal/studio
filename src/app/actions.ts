
'use server';

import {db} from '@/lib/firebase';
import {collection, getDocs, writeBatch, query, where} from 'firebase/firestore';
import { getFunctions, httpsCallable} from 'firebase/functions';


export async function migrateLeadsToContactsAction() {
  try {
    // We get all docs because checking for existence of a field is not straightforward
    // across all Firestore SDK versions and environments in a simple query.
    // This is safer and for a one-time migration on a personal CRM, performance is acceptable.
    const contactsCollection = collection(db, 'leads');
    const snapshot = await getDocs(contactsCollection);

    const batch = writeBatch(db);
    let migratedCount = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      // Check if the document needs migration by looking for the absence of 'status' field,
      // which is a key part of the new data model.
      if (!data.status) {
        
        let phoneData = data.phones || [];
        // If there's an old 'phone' field and no 'phones' array, migrate it.
        if (data.phone && !data.phones) {
            phoneData = [{ number: data.phone, type: 'both' }];
        }

        batch.update(doc.ref, {
          status: 'Active',
          afc_step: 0,
          hasEngaged: false,
          onFollowList: false,
          traits: data.traits || [],
          insights: data.insights || [],
          commitmentSnapshot: data.commitmentSnapshot || {},
          phones: phoneData,
          createdAt: data.createdAt || new Date().toISOString(),
          interactions: data.interactions || [],
        });
        migratedCount++;
      }
    });

    if (migratedCount > 0) {
      await batch.commit();
      return {
        success: true,
        message: `Successfully migrated ${migratedCount} documents.`,
      };
    }

    return { success: true, message: 'No documents needed migration.' };
  } catch (error) {
    console.error('Error during data migration:', error);
    if (error instanceof Error) {
       return { success: false, error: `Migration failed: ${error.message}` };
    }
    return { success: false, error: 'An unknown error occurred during migration.' };
  }
}


export async function importContactsAction(formData: { jsonData: string; isNew: boolean }) {
  const { jsonData, isNew } = formData;
  
  if (!jsonData) {
    return { success: false, error: 'No JSON data provided.' };
  }

  try {
    const functions = getFunctions();
    const importContactsJson = httpsCallable(functions, 'importContactsJson');

    const result = await importContactsJson({
        jsonData,
        isNew,
    });
    
    // The `result.data` from a callable function contains the object returned by the Python function.
    return { success: true, ...(result.data as any) };

  } catch (error) {
    console.error('Error in importContactsAction:', error);
    // Callable functions can throw HttpsError which has more details
    const httpsError = error as any;
    const errorMessage = httpsError.message || 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

export async function mergeLeadsAction(data: { primaryLeadId: string; secondaryLeadId: string; }) {
    if (!data.primaryLeadId || !data.secondaryLeadId) {
        return { success: false, error: "Primary and secondary lead IDs are required." };
    }

    try {
        const functions = getFunctions();
        const mergeLeads = httpsCallable(functions, 'mergeLeads');

        const result = await mergeLeads(data);
        
        return { success: true, ...(result.data as any) };
    } catch (error) {
        console.error('Error merging leads:', error);
        const httpsError = error as any;
        const errorMessage = httpsError.message || 'An unknown error occurred while merging.';
        return { success: false, error: errorMessage };
    }
}
    
