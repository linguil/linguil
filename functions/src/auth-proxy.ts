import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Proxies authentication requests from Devvit to the Google Identity Toolkit API.
export const authProxy = onRequest({ cors: true, region: "us-central1" }, async (req, res) => {
  // The request body should contain the target Google Identity Toolkit URL and the payload.
  const { url, body } = req.body;

  // Security validation: Ensure the proxy is only used for the intended Google service.
  if (!url || !String(url).startsWith("https://identitytoolkit.googleapis.com/")) {
    logger.warn("Invalid proxy target URL attempt", { url });
    res.status(400).json({ error: "Invalid proxy target URL." });
    return;
  }

  logger.info(`Proxying request to: ${url}`);

  try {
    // Forward the request to the Google Identity Toolkit API.
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const responseData = await response.json();

    // Check for a successful response and log the outcome.
    if (response.ok) {
      logger.info(`Successfully proxied request to ${url}`, { status: response.status });
    } else {
      logger.warn(`Proxied request to ${url} failed`, { status: response.status, responseData });
    }

    // Forward the response from the Google API back to the original client.
    res.status(response.status).json(responseData);
  } catch (error) {
    logger.error("Auth Proxy Error: An unexpected error occurred while making the outbound request.", { url, error });
    res.status(500).json({ error: "Proxy request failed due to an internal error." });
  }
});