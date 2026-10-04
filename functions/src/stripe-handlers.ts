import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { db } from "./init";
import { getStripe } from "./stripe";

// Define a secret for the Stripe webhook.
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// HTTP-triggered function to create a Stripe Checkout session.
export const createCheckoutSession = onRequest({
  region: "us-central1",
  secrets: ["STRIPE_SECRET_KEY"],
  memory: "256MiB",
  cors: [ "https://www.linguil.app", "https://linguil.web.app", "https://linguil.firebaseapp.com", /^https:\/\/.*\.cloudworkstations\.dev$/ ]
}, async (req, res) => {
  // Initialize Stripe.
  const stripe = getStripe();

  // Extract the Firebase ID token from the Authorization header.
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    // Verify the ID token to get the user's UID and email.
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Get required parameters from the request body.
    const { priceId, successUrl, cancelUrl } = req.body;
    if (!priceId || !successUrl || !cancelUrl) {
      res.status(400).send("Missing required parameters");
      return;
    }

    // Get the user's document from Firestore to find their Stripe Customer ID.
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    let customerId = userDoc.data()?.stripeCustomerId;

    // If the user doesn't have a Stripe Customer ID, create one.
    if (!customerId) {
      if (!email) {
        res.status(400).send("User email is missing, cannot create Stripe customer");
        return;
      }

      // Create a new Stripe customer.
      const customer = await stripe.customers.create({
        email: email,
        metadata: { firebaseUID: uid },
      });
      customerId = customer.id;

      // Save the new Stripe Customer ID to the user's document.
      await userRef.set({ stripeCustomerId: customerId }, { merge: true });
    }

    // Create a new Stripe Checkout session.
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: customerId,
      metadata: {
        firebaseUID: uid,
      },
    });

    // Return the session URL to the client.
    res.json({ url: session.url });

  } catch (err) {
    // Handle any errors.
    console.error("Error creating checkout session:", err);
    res.status(500).send("Internal Server Error");
  }
});

// HTTP-triggered Cloud Function to handle Stripe webhooks.
export const stripeWebhook = onRequest({ region: "us-central1", secrets: ["STRIPE_SECRET_KEY", stripeWebhookSecret], memory: "256MiB" }, async (req, res) => {
  // Initialize Stripe and get webhook signature.
  const stripe = getStripe();
  const signature = req.headers["stripe-signature"];
  const secret = stripeWebhookSecret.value();

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    // Verify the webhook signature to ensure the request is from Stripe.
    event = stripe.webhooks.constructEvent(req.rawBody, signature as string, secret);
  } catch (err) {
    // If the signature is invalid, return a 400 error.
    res.status(400).send("Webhook Error: " + (err as Error).message);
    return;
  }

  // Handle the 'checkout.session.completed' event.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    const uid = session.metadata?.firebaseUID;

    // If the Firebase UID is missing from metadata, return an error.
    if (!uid) {
      res.status(400).send("No firebaseUID in metadata");
      return;
    }

    try {
      // Set a custom claim on the user's auth token to indicate they have paid.
      await getAuth().setCustomUserClaims(uid, { hasPaid: true });
      // Update the user's document in Firestore to reflect their payment status.
      await db.collection("users").doc(uid).set({ hasPaid: true }, { merge: true });

      // Log the purchase to the 'stripe_metrics' collection.
      const metricsRef = db.collection("stripe_metrics").doc(uid);
      await metricsRef.set({
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email || "anonymous",
        firebaseUID: uid,
        createdAt: Timestamp.fromMillis(session.created * 1000)
      }, { merge: true });

      console.log(`Successfully processed purchase for user ${uid}.`);

      // Send a success response.
      res.status(200).send({ received: true });
    } catch {
      // Handle errors during user data update.
      res.status(500).send("Internal server error while updating user data");
    }
  } else {
    // For any other event type, acknowledge receipt.
    res.status(200).send({ received: true });
  }
});