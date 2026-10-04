import { getAuth } from "firebase-admin/auth";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { db } from "./init";
import { sendMetaCapiRegistration } from "./user-management";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

// Helper function to introduce a delay.
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Firestore trigger that updates a user's aggregated scores when a new daily score is created.
export const onDailyScoreCreate = onDocumentCreated({ document: "users/{userId}/dailyScores/{dailyScoreId}", region: "us-central1" }, async (event) => {
  try {
    // Get the user ID from the event parameters.
    const userId = event.params.userId;
    if (!userId) return;

    const userPublicDocRef = db.collection("users_public").doc(userId);
    
    // Retry logic to handle potential race conditions during user creation.
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let i = 0; i < maxRetries; i++) {
      const userPublicDoc = await userPublicDocRef.get();

      if (userPublicDoc.exists) {
        // Document found, proceed with score aggregation.
        const dailyScoresCollection = db.collection("users").doc(userId).collection("dailyScores");
        const snapshot = await dailyScoresCollection.get();

        // If there are no daily scores, reset the public scores.
        if (snapshot.empty) {
          await userPublicDocRef.update({
            "scores.perfectScores": 0,
            "scores.totalAnswered": 0,
            "scores.totalCorrect": 0,
          });
          return; // Success
        }

        // Initialize score counters.
        let perfectScores = 0;
        let totalCorrect = 0;
        const totalAnswered = snapshot.size * 3; // 3 questions per day.

        // Iterate over each daily score to calculate the totals.
        snapshot.forEach((doc: QueryDocumentSnapshot) => {
          const data = doc.data();
          if (data && typeof data.score === "number") {
            totalCorrect += data.score;
            if (data.score === 3) { // A score of 3 is perfect.
              perfectScores += 1;
            }
          }
        });

        // Update the user's public profile with the new aggregated scores.
        await userPublicDocRef.update({
          "scores.perfectScores": perfectScores,
          "scores.totalAnswered": totalAnswered,
          "scores.totalCorrect": totalCorrect,
        });
        
        return; // Success, exit the function.
      }

      // If document not found, wait and then retry.
      if (i < maxRetries - 1) {
        console.log(`onDailyScoreCreate: users_public/${userId} not found. Retrying in ${retryDelay / 1000}s...`);
        await sleep(retryDelay);
      }
    }

    // If the loop completes, the document was never found.
    console.warn(`onDailyScoreCreate: users_public/${userId} still not found after ${maxRetries} retries.`);

  } catch(err) {
    // Log any errors that occur.
    console.error(`Error in onDailyScoreCreate for user ${event.params.userId}:`, err);
  }
});

// Firestore trigger to synchronize the 'hasPaid' status with Firebase Auth custom claims.
export const onUserUpdate = onDocumentUpdated(
  {
    document: "users/{userId}",
    region: "us-central1",
    secrets: ["META_CAPI_ACCESS_TOKEN", "META_PIXEL_ID"],
  },
  async (event) => {
    try {
      // Exit if there's no event data.
      if (!event.data) return;

      // Get the data before and after the update.
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();
      const userId = event.params.userId;

      const registrationReady =
        !beforeData?.metaCapiRegistrationReady &&
        Boolean(afterData?.metaCapiRegistrationReady);

      if (
        registrationReady &&
        afterData?.email &&
        afterData?.metaCapiRegistrationEventId
      ) {
        await sendMetaCapiRegistration(userId, afterData.email, {
          leadId: afterData.metaLeadId ?? undefined,
          fbc: afterData.fbc ?? undefined,
          fbp: afterData.fbp ?? undefined,
          clientIp: afterData.clientIp ?? undefined,
          userAgent: afterData.userAgent ?? undefined,
          eventId: afterData.metaCapiRegistrationEventId,
          actionSource: "system_generated",
        });
      }

      // Exit if the 'hasPaid' status has not changed.
      if (beforeData?.hasPaid === afterData?.hasPaid) {
        return;
      }
      
      // Determine the new 'hasPaid' status.
      const hasPaid = afterData.hasPaid === true;

      // Update the custom claims on the user's auth token.
      const user = await getAuth().getUser(userId);
      await getAuth().setCustomUserClaims(userId, { ...user.customClaims, hasPaid: hasPaid });
    } catch (err) {
      console.error(`Error in onUserUpdate for user ${event.params.userId}:`, err);
    }
  }
);