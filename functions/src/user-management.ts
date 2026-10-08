import { getAuth, UserRecord } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import cookieParser from "cookie-parser";
import { db } from "./init";
import { getStripe } from "./stripe";
import { FacebookAdsApi, UserData, ServerEvent, EventRequest } from "facebook-nodejs-business-sdk";

const cookieParserMiddleware = cookieParser();

type MetaActionSource = "website" | "system_generated";

type RegistrationTrackingContext = {
  leadId?: string;
  fbc?: string;
  fbp?: string;
  clientIp?: string;
  userAgent?: string;
};

const registrationEventId = (uid: string) => `registration:${uid}`;

const getClientIp = (req: any): string | undefined => {
  const forwarded = req.headers?.["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  if (typeof forwardedValue === "string" && forwardedValue.trim()) {
    return forwardedValue.split(",")[0].trim();
  }

  return req.ip;
};

// Helper function to send the Meta CAPI registration payload securely.
export const sendMetaCapiRegistration = async (
  uid: string,
  email: string | undefined,
  extraData: RegistrationTrackingContext & {
    eventId: string;
    actionSource: MetaActionSource;
  }
) => {
  if (!email) return;

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    console.warn("Meta CAPI tracking skipped: Pixel ID or Access Token is missing.");
    return;
  }

  try {
    FacebookAdsApi.init(accessToken);

    const userData = new UserData()
      .setEmails([email])
      .setExternalId(uid)
      .setClientIpAddress(extraData.clientIp ?? "")
      .setClientUserAgent(extraData.userAgent ?? "")
      .setFbc(extraData.fbc ?? "")
      .setFbp(extraData.fbp ?? "");

    if (extraData.leadId) {
      userData.setLeadId(extraData.leadId);
    }

    const isCrmEvent = extraData.actionSource === "system_generated";

    const serverEvent = new ServerEvent()
      .setEventName("CompleteRegistration")
      .setEventTime(Math.floor(Date.now() / 1000))
      .setEventSourceUrl("https://linguil.app")
      .setUserData(userData)
      .setEventId(extraData.eventId)
      .setActionSource(extraData.actionSource);

    // For CRM events, add the required custom_data fields.
    if (isCrmEvent) {
      serverEvent.setCustomData({
        event_source: "crm",
        lead_event_source: "Firestore"
      } as any); // Use `as any` to override outdated SDK types.
    }

    const response = await new EventRequest(accessToken, pixelId)
      .setEvents([serverEvent])
      .execute();

    console.log("Meta CAPI registration dispatched", {
      sender: isCrmEvent ? "firestore-crm" : "web",
      eventId: extraData.eventId,
      actionSource: extraData.actionSource,
      hasLeadId: Boolean(extraData.leadId),
      hasFbc: Boolean(extraData.fbc),
      hasFbp: Boolean(extraData.fbp),
      hasClientIp: Boolean(extraData.clientIp),
      hasUserAgent: Boolean(extraData.userAgent),
    });

    return response;
  } catch (error) {
    console.error("Failed to post Meta CAPI track request:", error);
    return;
  }
};

const persistRegistrationTracking = async (
  uid: string,
  context: RegistrationTrackingContext
) => {
  const userDocRef = db.collection("users").doc(uid);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists || !userDoc.data()?.email) {
    throw new Error(`Cannot persist registration tracking before users/${uid} has an email.`);
  }

  const eventId = registrationEventId(uid);

  await userDocRef.set(
    {
      metaLeadId: context.leadId ?? null,
      fbc: context.fbc ?? null,
      fbp: context.fbp ?? null,
      clientIp: context.clientIp ?? null,
      userAgent: context.userAgent ?? null,
      metaCapiRegistrationEventId: eventId,
      metaCapiRegistrationReadyAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return eventId;
};

// Internal function to set up a new user's documents and Stripe customer.
const setupNewUser = async (user: UserRecord) => {
  const userPublicDocRef = db.collection("users_public").doc(user.uid);
  const userDocRef = db.collection("users").doc(user.uid);

  const [publicDoc, userDoc] = await Promise.all([
    userPublicDocRef.get(),
    userDocRef.get(),
  ]);

  // If already fully setup, exit early to avoid duplicate work.
  if (publicDoc.exists && userDoc.exists && userDoc.data()?.stripeCustomerId) {
    return;
  }

  let stripeCustomerId = userDoc.data()?.stripeCustomerId;
  if (!stripeCustomerId) {
    try {
      const stripe = getStripe();
      // Check if customer already exists for this UID to avoid duplicates under concurrent invocations
      const existingCustomers = await stripe.customers.search({
        query: `metadata['firebaseUID']:'${user.uid}'`,
      });
      if (existingCustomers.data && existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { firebaseUID: user.uid },
        });
        stripeCustomerId = customer.id;
      }
    } catch (stripeErr) {
      console.error(`Error resolving Stripe customer for UID ${user.uid}:`, stripeErr);
    }
  }

  const batch = db.batch();

  // Set the private user document.
  const userUpdates: Record<string, any> = {
    email: user.email,
    hasPaid: userDoc.data()?.hasPaid ?? false,
  };
  if (stripeCustomerId) {
    userUpdates.stripeCustomerId = stripeCustomerId;
  }
  batch.set(userDocRef, userUpdates, { merge: true });

  // Set the public user document if not already created.
  if (!publicDoc.exists) {
    batch.set(userPublicDocRef, {
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
      friendCode: user.uid,
      scores: {
        perfectScores: 0,
        totalAnswered: 0,
        totalCorrect: 0,
      },
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
};

// Background trigger (v1) to set up a new user.
export const onUserCreate = functions
  .region("us-central1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .auth.user()
  .onCreate((user) => setupNewUser(user));

// HTTP-triggered Cloud Function to create a new user account.
export const createUserAccount = onRequest(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "META_CAPI_ACCESS_TOKEN", "META_PIXEL_ID"],
    memory: "256MiB",
    cors: [
      "https://www.linguil.app",
      "https://linguil.web.app",
      "https://linguil.firebaseapp.com",
      /^https:\/\/.*\.cloudworkstations\.dev$/,
    ],
  },
  (req, res) => {
    cookieParserMiddleware(req, res, async () => {
      // Destructure required parameters from the request body.
      const { name, email, password, fbc: fbcBody, fbp: fbpBody, leadId } = req.body;

      // Validate that all required parameters are present.
      if (!name || !email || !password) {
        res.status(400).send("Missing required parameters: name, email, or password");
        return;
      }

      let userRecord: UserRecord | null = null;

      try {
        // Check if a user with the given email already exists.
        try {
          await getAuth().getUserByEmail(email);
          res.status(409).send("A user with this email address already exists");
          return;
        } catch (error: any) {
          // If the error is anything other than 'user-not-found', re-throw it.
          if (error.code !== "auth/user-not-found") {
            throw error;
          }
        }

        // Create a new user in Firebase Authentication.
        userRecord = await getAuth().createUser({
          email: email,
          password: password,
          displayName: name,
        });

        const fbc = fbcBody || req.cookies?.["_fbc"];
        const fbp = fbpBody || req.cookies?.["_fbp"];
        const clientIp = getClientIp(req);
        const userAgent = req.headers["user-agent"] as string | undefined;

        // Manually call setupNewUser to ensure the displayName is captured correctly.
        await setupNewUser(userRecord);

        const trackingContext = { leadId, fbc, fbp, clientIp, userAgent };
        const eventId = await persistRegistrationTracking(userRecord.uid, trackingContext);

        // Trigger CAPI event with full request context.
        void sendMetaCapiRegistration(userRecord.uid, userRecord.email, {
          ...trackingContext,
          eventId,
          actionSource: "website",
        });

        // Generate a custom token for the client to use for a reliable sign-in.
        const customToken = await getAuth().createCustomToken(userRecord.uid);

        // Return the token to the client.
        res.json({ token: customToken });

      } catch (err: unknown) {
        // Clean up user record if user creation or setup fails.
        if (userRecord) {
          try {
            await getAuth().deleteUser(userRecord.uid);
          } catch (cleanupError) {
            console.error(`CRITICAL: Failed to clean up user ${userRecord.uid} after a failed signup.`, cleanupError);
          }
        }

        console.error("Error in createUserAccount:", err);
        res.status(500).send("An unexpected error occurred while creating the user account");
      }
    });
  }
);

// Callable function for tracking Google/Discord sign-ups.
export const trackSocialRegistration = onCall(
  {
    region: "us-central1",
    secrets: ["STRIPE_SECRET_KEY", "META_CAPI_ACCESS_TOKEN", "META_PIXEL_ID"],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in to track registration.");
    }

    const uid = request.auth.uid;
    const email = request.auth.token.email;
    const { fbc, fbp, leadId } = request.data;

    // onCall functions provide IP and User Agent in the raw request context.
    const clientIp = request.rawRequest.ip;
    const userAgent = request.rawRequest.headers["user-agent"];

    const authUser = await getAuth().getUser(uid);
    await setupNewUser(authUser);

    const trackingContext = { leadId, fbc, fbp, clientIp, userAgent };
    const eventId = await persistRegistrationTracking(uid, trackingContext);

    await sendMetaCapiRegistration(uid, email, {
      ...trackingContext,
      eventId,
      actionSource: "website",
    });

    return { success: true };
  }
);