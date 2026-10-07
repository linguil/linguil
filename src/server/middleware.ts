import type { Context, Next } from 'hono';
import { settings } from '@devvit/web/server';

// Hono middleware to verify a Firebase ID token.
// Checks the Authorization header for a token, verifies it with the Firebase Auth REST API, and attaches the user's UID to the context if valid.
export const verifyToken = async (c: Context, next: Next) => {
  let tokenValue: string | undefined;

  // 1. Get token from Authorization header.
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    tokenValue = authHeader.substring(7);
  }

  if (!tokenValue) {
    return c.json({ message: 'Unauthorized: No token provided.' }, 401);
  }

  try {
    // 2. Verify the token using the Firebase Auth REST API.
    const FIREBASE_API_KEY = await settings.get('NEXT_PUBLIC_FIREBASE_API_KEY');
    if (!FIREBASE_API_KEY || typeof FIREBASE_API_KEY !== 'string') {
      return c.json({ message: 'Server configuration error'}, 500)
    }
    const AUTH_FUNCTION_URL = await settings.get('NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_FUNCTION_URL');
    if (!AUTH_FUNCTION_URL || typeof AUTH_FUNCTION_URL !== 'string') {
      return c.json({ message: 'Server configuration error' }, 500);
    }

    const response = await fetch(AUTH_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
        body: { idToken: tokenValue },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.users || data.users.length === 0) {
      console.error('Firebase token verification failed:', data.error?.message);
      return c.json({ message: 'Unauthorized: Invalid token.' }, 401);
    }

    // 3. Attach user profile and UID to the context for downstream handlers.
    c.set('uid', data.users[0].localId);
    c.set('userProfile', data.users[0]);
    await next();

  } catch (error) {
    console.error('Error in authentication middleware:', error);
    return c.json({ message: 'Internal Server Error' }, 500);
  }
};