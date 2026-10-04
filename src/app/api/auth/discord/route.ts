import 'server-only';
// Handles the entire Discord authentication process.
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK if not already initialized.
if (getApps().length === 0) {
  initializeApp();
}

// The URL of the Firebase function to create a new user's database records.
const CREATE_USER_URL = process.env.NEXT_PUBLIC_FIREBASE_CREATE_USER_FUNCTION_URL!;

export async function POST(req: NextRequest) {
  const auth = getAuth();

  try {
    const { code, isFromDiscordClient } = await req.json();
    if (!code) {
      return new NextResponse(JSON.stringify({ message: 'Authorization code not provided.' }), { status: 400 });
    }

    // 1. Exchange the authorization code for an access token from Discord.
    const tokenRequestBody: { [key: string]: string } = {
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
    };

    // The redirect_uri is only required for the standard browser OAuth flow.
    // For the Discord client flow, it should be omitted.
    if (!isFromDiscordClient) {
      tokenRequestBody.redirect_uri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!;
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenRequestBody),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error('Discord token exchange failed:', error);
      return new NextResponse(JSON.stringify({ message: 'Failed to authenticate with Discord.' }), { status: 500 });
    }
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Use the access token to get the user's profile from Discord.
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user profile from Discord.');
    }

    const discordUser = await userResponse.json();
    const { id: discordId, username, avatar } = discordUser;
    const photoURL = avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : undefined;
    const email = `${username.replace(/[^a-zA-Z0-9]/g, '')}.${discordId}@linguil.app`;

    let userRecord: UserRecord;

    try {
      // 3. Check if the user already exists in Firebase Auth.
      userRecord = await auth.getUser(discordId);
      await auth.updateUser(userRecord.uid, { email, displayName: username, photoURL });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // 4. If user does not exist, create a new one.
        const newUserRecord = await auth.createUser({ uid: discordId, email, displayName: username, photoURL });
        // 5. Set a default `hasPaid` claim synchronously to prevent a race condition.
        await auth.setCustomUserClaims(newUserRecord.uid, { hasPaid: false });
        
        // 6. Re-fetch the user record to get all properties, including the new custom claims.
        userRecord = await auth.getUser(newUserRecord.uid);

        // 7. Trigger the background Cloud Function to create user documents in Firestore.
        fetch(CREATE_USER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: userRecord.uid, displayName: username, photoURL }),
        });

      } else {
        // Handle other Firebase Admin SDK errors.
        throw error;
      }
    }

    // 8. Handle the response based on the client type.
    const customToken = await auth.createCustomToken(userRecord.uid);
    const { uid, displayName } = userRecord;

    if (isFromDiscordClient) {
      // Exchange the custom token for an ID token on the server.
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

        if (!apiKey) {
          console.error("Missing NEXT_PUBLIC_FIREBASE_API_KEY");
          return NextResponse.json({ message: "Server misconfiguration" }, { status: 500 });
        }

        const exchangeResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Referer': 'https://linguil.app/'
          },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        });

        const exchangeData = await exchangeResponse.json();

        if (!exchangeResponse.ok) {
          const googleError = exchangeData.error?.message || "UNKNOWN_GOOGLE_ERROR";
          console.error("Token exchange failed:", JSON.stringify(exchangeData));
          
          return NextResponse.json({ 
            message: `Google API Error: ${googleError}` 
          }, { status: 500 });
        }

        return new NextResponse(JSON.stringify({
          accessToken: accessToken,
          idToken: exchangeData.idToken,
          user: { uid, displayName, photoURL: userRecord.photoURL || photoURL },
          hasPaid: userRecord.customClaims?.['hasPaid'] === true,
        }), { status: 200 });
    } else {
      // For a standard browser: return a custom token for client-side sign-in.
      return new NextResponse(JSON.stringify({ customToken }), { status: 200 });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    console.error('Discord auth route error:', errorMessage);
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}