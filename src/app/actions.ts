
'use server';

import {enrichLeadProfile} from '@/ai/flows/enrich-lead-profile';
import {db} from '@/lib/firebase';
import {collection, getDocs, writeBatch, query, where} from 'firebase/firestore';

export async function enrichLeadAction(lead: {name: string; email: string; phone: string}) {
  try {
    const enrichedData = await enrichLeadProfile({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    });
    return {
      success: true,
      additionalInformation: enrichedData.additionalInformation,
    };
  } catch (error) {
    console.error('Error enriching lead:', error);
    return {
      success: false,
      error: 'Failed to enrich lead information. Please try again.',
    };
  }
}

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
    // We get the functions instance on the server and call it.
    // This requires server-side Firebase Admin SDK to be initialized.
    // For this environment, we'll assume a simplified direct-to-URL call
    // is still preferred to avoid complex Admin SDK setup in the Next.js server environment.
    const region = process.env.LOCATION || 'us-central1';
    const projectId = process.env.GCLOUD_PROJECT;
    
    if (!projectId) {
      throw new Error("GCLOUD_PROJECT environment variable not set. Cannot determine function URL.");
    }
    
    // The endpoint for a callable function is different from a standard HTTP trigger.
    const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/importContactsJson`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // The body of a callable function request needs a 'data' wrapper.
      body: JSON.stringify({
        data: {
          jsonData,
          isNew,
        }
      }),
    });
    
    const result = await response.json();

    if (!response.ok) {
       // Callable functions wrap errors in result.error
      throw new Error(result.error?.message || 'Failed to process import.');
    }

    // Successful callable functions wrap their response in result.data
    return { success: true, ...result.data };
  } catch (error) {
    console.error('Error in importContactsAction:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}
