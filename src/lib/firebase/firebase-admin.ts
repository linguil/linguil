import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import 'server-only';
let adminInitializationPromise: Promise<void> | undefined = undefined;

// Initializes the Firebase Admin SDK if not already running.
const initializeFirebaseAdmin = (): Promise<void> => {
    if (!adminInitializationPromise) {
        adminInitializationPromise = new Promise((resolve) => {
            if (getApps().length > 0) {
                resolve();
            } else {
                // Uses Application Default Credentials in the Google Cloud environment.
                initializeApp();
                resolve();
            }
        });
    }
    return adminInitializationPromise;
};

// Gets the Firebase Admin Firestore service.
export const getAdminDb = async (): Promise<Firestore> => {
    await initializeFirebaseAdmin();
    const db = getFirestore();
    return db;
};