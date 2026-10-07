import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getApps } from "firebase-admin/app";
import * as logger from "firebase-functions/logger";

const firestoreApiKeySecret = defineSecret("NEXT_PUBLIC_FIREBASE_API_KEY");

// Retrieves an internal Google Cloud OAuth access token to authorize the REST proxy as Admin.
async function getAdminAccessToken(): Promise<string | null> {
  try {
    const app = getApps()[0];
    if (app?.options?.credential && typeof (app.options.credential as any).getAccessToken === "function") {
      const tokenObj = await (app.options.credential as any).getAccessToken();
      if (tokenObj?.access_token) return tokenObj.access_token;
    }
  } catch (err) {
    logger.debug("Firebase credential getAccessToken failed, checking metadata server:", { err });
  }

  try {
    // In GCP Cloud Functions runtime, fetch service account token from instance metadata server.
    const metaRes = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" }
    });
    if (metaRes.ok) {
      const data = await metaRes.json() as { access_token?: string };
      if (data?.access_token) return data.access_token;
    }
  } catch (_e) {
  }

  return null;
}

export const firestoreProxy = onRequest(
  {
    region: "us-central1",
    invoker: "public",
    secrets: [firestoreApiKeySecret],
  },
  async (req, res) => {
    // Set CORS headers for preflight and actual requests.
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, x-proxy-api-key");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Authenticate the request from the Devvit app using the shared API key.
    const expectedKeyValue = firestoreApiKeySecret.value();
    if (!expectedKeyValue) {
      logger.error("FATAL: The NEXT_PUBLIC_FIREBASE_API_KEY secret is not available.");
      res.status(500).send("Internal Server Error: Server configuration error.");
      return;
    }

    const requestKeyHeader = req.headers["x-proxy-api-key"];
    const requestKey = Array.isArray(requestKeyHeader) ? requestKeyHeader[0] : requestKeyHeader;

    if (requestKey !== expectedKeyValue) {
      logger.warn("Unauthorized API key from Devvit app.", { key: requestKey });
      res.status(401).send("Unauthorized");
      return;
    }

    // Validate the request body from the Devvit app.
    const { path, options } = req.body;
    if (!path || typeof path !== "string") {
      res.status(400).send("Bad Request: 'path' string is missing from body.");
      return;
    }

    try {
      const baseUrl = "https://firestore.googleapis.com/v1/projects/linguil/databases/(default)/documents";
      const finalUrl = `${baseUrl}/${path}${path.includes("?") ? "&" : "?"}key=${expectedKeyValue}`;

      const adminToken = await getAdminAccessToken();
      const headers: Record<string, string> = {
        ...(options?.headers || {}),
      };

      if (adminToken) {
        headers["Authorization"] = `Bearer ${adminToken}`;
      }

      if (options?.body) {
        headers["Content-Type"] = "application/json";
      }

      const requestOptions = {
        method: options?.method || "GET",
        headers: headers as HeadersInit,
        body: options?.body,
      };

      logger.info(`Proxying request to Firestore as Admin: ${requestOptions.method} ${finalUrl}`);

      // Forward the request to the Firestore REST API.
      const firestoreResponse = await fetch(finalUrl, requestOptions);

      // Proxy the response headers from Firestore back to the Devvit app.
      firestoreResponse.headers.forEach((value, name) => {
        res.setHeader(name, value);
      });

      const responseBody = await firestoreResponse.text();
      res.status(firestoreResponse.status).send(responseBody);

    } catch (error) {
      logger.error("Error processing firestore proxy request:", { error: error as any });
      res.status(500).send("Internal Server Error");
    }
  }
);