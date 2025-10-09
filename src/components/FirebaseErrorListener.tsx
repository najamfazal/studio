'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/lib/error-emitter';
import { FirestorePermissionError } from '@/lib/errors';

export function FirebaseErrorListener() {
  useEffect(() => {
    const handler = (error: FirestorePermissionError) => {
        const errorMessage = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${JSON.stringify({
            auth: "/* Add user auth context here if available */",
            method: error.context.operation,
            path: `/databases/(default)/documents/${error.context.path}`,
            request: {
                resource: {
                    data: error.context.requestResourceData || null
                }
            }
        }, null, 2)}`;
      
      // Throwing the error here will cause it to be picked up by Next.js's dev overlay
      throw new Error(errorMessage);
    };

    errorEmitter.on('permission-error', handler);

    return () => {
      errorEmitter.off('permission-error', handler);
    };
  }, []);

  return null;
}
