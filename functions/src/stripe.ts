// Import the Stripe library and the defineSecret function from Firebase.
import Stripe from "stripe";
import { defineSecret } from "firebase-functions/params";

// Define the Stripe secret key as a Firebase secret.
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

// Declare a variable to hold the Stripe client instance.
let stripe: Stripe.Stripe;

// Function to get a singleton instance of the Stripe client.
export const getStripe = () => {
  // If the Stripe client has not been initialized yet, create a new instance.
  if (!stripe) {
    stripe = new Stripe(stripeSecretKey.value(), {
      apiVersion: "2026-08-26.dahlia", // Specify the Stripe API version.
      typescript: true, // Enable TypeScript support.
    });
  }
  // Return the Stripe client instance.
  return stripe;
};