'use client';

import { getDiscordSdk } from '@/lib/discord';

// A simplified user type for the object we will get back from our API
// when authenticating from within the Discord client.
export interface DiscordClientUser {
  uid: string;
  displayName?: string;
  photoURL?: string;
}

// The expected shape of the successful response from our API route
// when authenticating from within the Discord client.
export interface DiscordClientAuthResponse {
  accessToken: string; // The token to authenticate the SDK.
  customToken: string;
  idToken: string;
  user: DiscordClientUser;
  hasPaid: boolean;
}

// Core Discord Client authentication logic.
async function authenticateWithBackend(discordSdk: any, authorizeSilently: boolean): Promise<DiscordClientAuthResponse | null> {
  let code: string | null = null;

  try {
    // 1. Authorize with the Discord client to get a code.
    const authorizePayload: any = {
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      response_type: 'code',
      state: '',
      scope: ['identify', 'guilds.join', 'rpc.activities.write'],
    };
    if (authorizeSilently) {
      authorizePayload.prompt = 'none';
    }

    const authorizePromise = discordSdk.commands.authorize(authorizePayload);
    const authResult = authorizeSilently
      ? await Promise.race([
          authorizePromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Silent Discord authorization timed out')), 5000)
          ),
        ])
      : await authorizePromise;
    code = authResult.code;
  } catch (error: any) {
    if (error.code === 4002 || error.message?.includes('Already authenticated')) {
      const cachedSession = sessionStorage.getItem('discord_auth_cache');
      if (cachedSession) {
        return JSON.parse(cachedSession) as DiscordClientAuthResponse;
      }
    }

    if (authorizeSilently) {
      console.warn("Silent Discord SDK authorization failed. This is expected for new users.", error);
      return null;
    } else {
      console.error("Discord SDK authorization failed:", error);
      throw new Error(error.message || "Failed to authorize with Discord.");
    }
  }

  try {
    if (!code) throw new Error("No authorization code received.");

    const apiUrl = new URL('/api/auth/discord', window.location.origin);

    // 2. Send the code to our backend for token exchange and user creation.
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, isFromDiscordClient: true }),
    });

    if (!response.ok) {
      if (authorizeSilently) {
        console.warn('Silent sign-in failed during backend fetch.');
        return null;
      }
      const error = await response.json();
      throw new Error(error.message || 'Failed to authenticate with Discord.');
    }

    // 3. Our backend returns the access token, user object, and payment status.
    const authResponse: DiscordClientAuthResponse = await response.json();

    sessionStorage.setItem('discord_auth_cache', JSON.stringify(authResponse));

    // 4. Use the access token to authenticate the Discord SDK instance.
    await discordSdk.commands.authenticate({ access_token: authResponse.accessToken });

    return authResponse;

  } catch (error) {
     console.error("Backend auth or SDK authentication failed:", error);
     throw error;
  }
}


// Attempts a silent authentication on app launch inside the Discord client.
// It will only succeed if the user has previously authorized the app.
export const handleSilentSignIn = async (): Promise<DiscordClientAuthResponse | null> => {
  const discordSdk = await getDiscordSdk();
  if (!discordSdk) return null;
  return authenticateWithBackend(discordSdk, true);
};

// Handles the Discord sign-in process for user authentication.
// In a browser, this initiates a redirect and the promise may not resolve.
export const handleSignInWithDiscord = async (): Promise<DiscordClientAuthResponse | { customToken: string } | null> => {
  const discordSdk = await getDiscordSdk();

  if (discordSdk) {
    // Flow for when the app is embedded inside the Discord client.
    return authenticateWithBackend(discordSdk, false);
  } else {
    // Standard browser flow (redirect to Discord auth page).
    const authUrl = new URL('https://discord.com/api/oauth2/authorize');
    authUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
    authUrl.searchParams.set('redirect_uri', process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'identify guilds.join rpc.activities.write');

    window.location.href = authUrl.toString();

    return null;
  }
};