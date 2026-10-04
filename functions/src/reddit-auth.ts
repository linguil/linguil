import { getAuth, type UserRecord } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { db } from "./init";

// Initialize Firebase Admin SDK if it hasn't been already.
if (getApps().length === 0) {
  initializeApp();
}

const auth = getAuth();

// Define secrets used in this function.
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

// Handles user authentication via Reddit.
// Checks for an existing user with the provided redditId.
// If found, returns a custom token; otherwise, creates a new user and returns a token.
export const redditAuth = onRequest(
  { region: "us-central1", secrets: [stripeSecretKey], memory: "256MiB", cors: true },
  async (req, res) => {
    // Ensure the request is a POST request.
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { redditId, username, snoovatarUrl } = req.body;

    // Validate that the required parameters, redditId and username, were provided.
    if (!redditId || !username) {
      logger.warn("Reddit auth call missing required parameters.", { body: req.body });
      res.status(400).send({ error: "Missing required parameters: redditId and username are required." });
      return;
    }

    logger.info(`Initiating Reddit auth for redditId: ${redditId}, username: ${username}`);

    let userRecord: UserRecord;
    let isNewUser = false;

    try {
      // Fetch the user by UID (redditId).
      userRecord = await auth.getUser(redditId);
      logger.info(`Existing user found for redditId: ${redditId}`);

    } catch (error: any) {
      // If the user is not found, create a new one.
      if (error.code === "auth/user-not-found") {
        logger.info(`No existing user for redditId ${redditId}. Creating a new user.`);
        isNewUser = true;

        // Create a synthetic email to satisfy Firebase user requirements.
        const email = `${username.replace(/[^a-zA-Z0-9]/g, "")}.${redditId}@linguil.app`;

        try {
          // Create the new user in Firebase Authentication.
          userRecord = await auth.createUser({
            uid: redditId,
            email: email,
            displayName: username,
            photoURL: snoovatarUrl || undefined,
          });
          logger.info(`Successfully created new user with UID: ${userRecord.uid}`);
          
          // The onUserCreate trigger handles creating user documents.
          // Add the redditId to the public profile.
          const userPublicDocRef = db.collection("users_public").doc(userRecord.uid);
          
          // The onUserCreate trigger may not complete instantly.
          // Poll for a few seconds until the document exists.
          let attempts = 0;
          const maxAttempts = 5;
          const delay = 1000;

          while (attempts < maxAttempts) {
            const doc = await userPublicDocRef.get();
            if (doc.exists) {
              await userPublicDocRef.update({ redditId: redditId });
              logger.info(`Updated public profile for ${userRecord.uid} with redditId.`);
              break;
            }
            attempts++;
            if (attempts >= maxAttempts) {
              throw new Error(`Public user document for ${userRecord.uid} not found after ${maxAttempts} attempts.`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (creationError) {
          logger.error("Error creating new Firebase user during Reddit auth.", { redditId, error: creationError });
          res.status(500).send({ error: "An unexpected error occurred while creating the user account." });
          return;
        }
      } else {
        // For any other error, log it and return a generic error message.
        logger.error("Unexpected error fetching user during Reddit auth.", { redditId, error });
        res.status(500).send({ error: "An unexpected error occurred.", details: error.message });
        return;
      }
    }

    try {
      // Generate a custom authentication token for the user.
      const customToken = await auth.createCustomToken(userRecord.uid);
      logger.info(`Successfully generated custom token for UID: ${userRecord.uid}`);

      // Return the token and a flag indicating if the user is new.
      res.status(200).json({ token: customToken, isNewUser });

    } catch (tokenError) {
      logger.error("Error creating custom token during Reddit auth.", { uid: userRecord.uid, error: tokenError });
      res.status(500).send({ error: "Failed to generate authentication token." });
    }
  }
);