import type { Hono, Context } from 'hono';
import { reddit, settings } from '@devvit/web/server';

// Adds GET and POST routes for Reddit authentication.
export const addRedditAuthRoute = (app: Hono) => {
  // Checks if a user has an active Reddit session.
  // This is used by the client to determine if it should attempt an automatic sign-in.
  app.get('/api/auth/reddit', async (c: Context) => {
    try {
      const user = await reddit.getCurrentUser();
      if (user) {
        const username = await reddit.getCurrentUsername();
        return c.json({ loggedIn: true, username });
      } else {
        return c.json({ loggedIn: false });
      }
    } catch (error: any) {
      console.error("Failed to get current Reddit user:", error.message);
      return c.json({ loggedIn: false, error: 'Failed to check Reddit session' }, 500);
    }
  });

  // Performs the full sign-in/sign-up flow.
  app.post('/api/auth/reddit', async (c: Context) => {
    try {
      // Get the URL of the backend authentication function from app settings.
      const REDDIT_AUTH_URL = await settings.get('NEXT_PUBLIC_FIREBASE_REDDIT_AUTH_FUNCTION_URL');
      if (typeof REDDIT_AUTH_URL !== 'string' || !REDDIT_AUTH_URL) {
        console.error('ERROR: The `NEXT_PUBLIC_FIREBASE_REDDIT_AUTH_FUNCTION_URL` setting is not configured.');
        return c.json({ error: 'Server configuration error' }, 500);
      }

      // Get the current user from the active Reddit session.
      const user = await reddit.getCurrentUser();
      if (!user) {
        return c.json({ error: 'No active Reddit session found. Please sign in to Reddit.' }, 401);
      }

      // Retrieve the username and snoovatar for the authenticated user.
      const username = await reddit.getCurrentUsername();
      if (!username) {
        return c.json({ error: 'Could not retrieve Reddit username.' }, 400);
      }
      const snoovatarUrl = await reddit.getSnoovatarUrl(username);

      const apiKey = await settings.get('NEXT_PUBLIC_FIREBASE_API_KEY');

      // Forward the user's details to the Firebase authentication function with authorization header.
      const response = await fetch(REDDIT_AUTH_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-proxy-api-key': typeof apiKey === 'string' ? apiKey : '',
        },
        body: JSON.stringify({
          redditId: user.id,
          username: username,
          snoovatarUrl: snoovatarUrl ?? null,
        }),
      });

      // Handle the response from the Firebase function.
      const data = await response.json();

      if (!response.ok) {
        console.error(`Firebase reddit-auth function failed with status ${response.status}:`, data.error);
        return c.json({ error: data.error || 'Backend authentication failed' }, response.status as any);
      }

      // Return the successful response, containing the custom auth token, to the client.
      return c.json(data, response.status as any);

    } catch (error: any) {
      console.error("Reddit auth proxy route crashed:", error.message);
      return c.json({ error: `Proxy error: ${error.message}` }, 500);
    }
  });
};