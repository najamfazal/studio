
'use server';

import {app, db} from '@/lib/firebase';
import {collection, getDocs, writeBatch, query, where} from 'firebase/firestore';
import { getFunctions, httpsCallable} from 'firebase/functions';


export async function importContactsAction(formData: { jsonData: string; isNew: boolean; dryRun?: boolean }) {
  const { jsonData, isNew, dryRun = false } = formData;
  
  if (!jsonData) {
    return { success: false, error: 'No JSON data provided.' };
  }

  try {
    const functions = getFunctions(app);
    const importContactsJson = httpsCallable(functions, 'importContactsJson');

    const result = await importContactsJson({
        jsonData,
        isNew,
        dryRun,
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
        const functions = getFunctions(app);
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

export async function generateCourseRevenueReportAction() {
  try {
    const functions = getFunctions(app);
    const generateReport = httpsCallable(functions, 'generateCourseRevenueReport');
    await generateReport();
    return { success: true };
  } catch (error) {
    console.error('Error triggering course revenue report generation:', error);
    const httpsError = error as any;
    const errorMessage = httpsError.message || 'An unknown error occurred.';
    return { success: false, error: errorMessage };
  }
}

export async function reindexLeadsAction() {
    try {
        const functions = getFunctions(app);
        const reindexLeads = httpsCallable(functions, 'reindexLeads');
        const result = await reindexLeads();
        return { success: true, ...(result.data as any) };
    } catch (error) {
        console.error('Error re-indexing leads:', error);
        const httpsError = error as any;
        const errorMessage = httpsError.message || 'An unknown error occurred during re-indexing.';
        return { success: false, error: errorMessage };
    }
}


// export async function generateLogAnalysisReportAction() {
//   try {
//     const functions = getFunctions(app);
//     const generateReport = httpsCallable(functions, 'generateLogAnalysisReport');
//     await generateReport();
//     return { success: true };
//   } catch (error) {
//     console.error('Error triggering log analysis report generation:', error);
//     const httpsError = error as any;
//     const errorMessage = httpsError.message || 'An unknown error occurred.';
//     return { success: false, error: errorMessage };
//   }
// }

export async function bulkDeleteLeadsAction(leadIds: string[]) {
    if (!leadIds || leadIds.length === 0) {
        return { success: false, error: "No lead IDs provided for deletion." };
    }

    try {
        const functions = getFunctions(app);
        const bulkDelete = httpsCallable(functions, 'bulkDeleteLeads');
        const result = await bulkDelete({ leadIds });
        return { success: true, ...(result.data as any) };
    } catch (error) {
        console.error('Error during bulk delete action:', error);
        const httpsError = error as any;
        const errorMessage = httpsError.message || 'An unknown error occurred during bulk deletion.';
        return { success: false, error: errorMessage };
    }
}
    
export async function reindexLeadsToAlgoliaAction() {
    try {
        const functions = getFunctions(app);
        const reindexAlgolia = httpsCallable(functions, 'reindexLeadsToAlgolia');
        const result = await reindexAlgolia();
        return { success: true, ...(result.data as any) };
    } catch (error) {
        console.error('Error re-indexing to Algolia:', error);
        const httpsError = error as any;
        const errorMessage = httpsError.message || 'An unknown error occurred during Algolia re-indexing.';
        return { success: false, error: errorMessage };
    }
}


    

```