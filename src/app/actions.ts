
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

    

    

