
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
          relationship: 'Lead',
          afc_step: data.afc_step ?? 0,
          hasEngaged: data.hasEngaged ?? false,
          onFollowList: data.onFollowList ?? false,
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


export async function importContactsAction(formData: { jsonData: string; relationship: string; isNew: boolean }) {
  const { jsonData, relationship, isNew } = formData;
  
  if (!jsonData) {
    return { success: false, error: 'No JSON data provided.' };
  }

  try {
    // We assume the import function is deployed in the same region and project.
    // Replace with your actual region and project ID if different.
    const region = process.env.LOCATION || 'us-central1';
    const projectId = process.env.GCLOUD_PROJECT;
    const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/importContactsJson`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonData,
        relationship,
        isNew,
      }),
    });
    
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to process import.');
    }

    return { success: true, ...result };
  } catch (error) {
    console.error('Error in importContactsAction:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

    