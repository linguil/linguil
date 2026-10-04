import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "./init";

// Defines the structure for a Reddit Gold order.
interface RedditGoldOrder {
  userId: string;
  products: {
    sku: string;
    price: number;
  }[];
}

// Processes webhook notifications for Reddit Gold purchases.
export const redditGoldWebhook = onRequest({ region: "us-central1", memory: "256MiB" }, async (req, res) => {
  let order: RedditGoldOrder;

  // Parse the order data from the request body.
  try {
    order = req.body as RedditGoldOrder;
  } catch (_error) {
    res.status(400).send("Invalid request body");
    return;
  }

  const { userId, products } = order;

  // Validate the incoming order data.
  if (!userId || !products || !products.length) {
    res.status(400).send("Invalid order data");
    return;
  }

  try {
    // Retrieve the user document to get their email address.
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    const customerEmail = userDoc.data()?.email || "anonymous";

    // Calculate the purchase amount.
    const product = products[0];
    const amountInUsd = (product.price / 100) * 2;

    // Record the purchase in the Stripe metrics collection for tracking.
    const metricsRef = db.collection("stripe_metrics").doc(userId);
    await metricsRef.set({
      amount: amountInUsd,
      currency: "bsd",
      customerEmail: customerEmail,
      firebaseUID: userId,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Mark the user as having paid.
    await db.collection("users").doc(userId).set({ hasPaid: true }, { merge: true });

    console.log(`Successfully processed Reddit Gold purchase for user ${userId}.`);

    res.status(200).send({ received: true });
  } catch (error) {
    console.error("Error processing Reddit Gold purchase:", error);
    res.status(500).send("Internal server error while updating user data");
  }
});