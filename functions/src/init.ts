import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK.
initializeApp();

// Export initialized services for use in other modules.
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });