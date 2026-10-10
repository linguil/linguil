import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api/auth-utils';

// Initialize Firebase Admin SDK if not already initialized.
if (getApps().length === 0) {
  initializeApp();
}

export async function POST(req: NextRequest) {
  const auth = getAuth();
  const db = getFirestore();

  try {
    // 1. Authenticate the caller (must be an active Google or email account session).
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { uid: currentUid } = authResult;

    // 2. Validate request body.
    const body = await req.json();
    const { code, isFromDiscordClient } = body;

    if (!code) {
      return NextResponse.json({ message: 'Authorization code not provided.' }, { status: 400 });
    }

    // 3. Exchange authorization code with Discord API for access token.
    const tokenRequestBody: Record<string, string> = {
      client_id: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
    };

    if (!isFromDiscordClient) {
      tokenRequestBody.redirect_uri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!;
    }

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenRequestBody),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('[API/AUTH/DISCORD/LINK] Discord token exchange failed:', errorData);
      return NextResponse.json({ message: 'Failed to authenticate with Discord.' }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 4. Retrieve Discord user profile.
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ message: 'Failed to fetch Discord user profile.' }, { status: 500 });
    }

    const discordUser = await userResponse.json();
    const { id: discordId, username, avatar } = discordUser;
    const photoURL = avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : undefined;
    const email = `${username.replace(/[^a-zA-Z0-9]/g, '')}.${discordId}@linguil.app`;

    // 5. Prevent merging into oneself if already authenticated as that Discord ID.
    if (currentUid === discordId) {
      const customToken = await auth.createCustomToken(discordId);
      return NextResponse.json({
        success: true,
        message: 'Account is already this Discord account.',
        customToken,
        user: { uid: discordId, displayName: username, photoURL },
      }, { status: 200 });
    }

    // 6. Prevent hijacking if discordId is already linked to another different user.
    const existingLinkedDocs = await db.collection('users').where('linkedDiscordId', '==', discordId).get();
    const conflict = existingLinkedDocs.docs.find(d => d.id !== currentUid);
    if (conflict) {
      return NextResponse.json({
        message: 'This Discord account is already linked to another linguil account.'
      }, { status: 409 });
    }

    // 7. Ensure a Firebase Auth record exists for the Discord account.
    let discordUserRecord: UserRecord;
    try {
      discordUserRecord = await auth.getUser(discordId);
      await auth.updateUser(discordId, { displayName: username, photoURL });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        discordUserRecord = await auth.createUser({
          uid: discordId,
          email,
          displayName: username,
          photoURL,
        });
        await auth.setCustomUserClaims(discordId, { hasPaid: false });
      } else {
        throw err;
      }
    }

    // 8. Fetch data from Firestore for both accounts.
    const currentUserDocRef = db.collection('users').doc(currentUid);
    const discordUserDocRef = db.collection('users').doc(discordId);

    const [currentUserDoc, discordUserDoc] = await Promise.all([
      currentUserDocRef.get(),
      discordUserDocRef.get(),
    ]);

    const currentUserData = currentUserDoc.data() || {};
    const discordUserData = discordUserDoc.data() || {};

    const [currentScoresSnap, discordScoresSnap] = await Promise.all([
      currentUserDocRef.collection('dailyScores').get(),
      discordUserDocRef.collection('dailyScores').get(),
    ]);

    // 9. Merge daily scores: if score exists on both accounts for the same day, keep the highest score.
    const mergedScores = new Map<string, any>();

    // Seed with existing Discord scores
    discordScoresSnap.forEach(doc => {
      mergedScores.set(doc.id, doc.data());
    });

    // Merge Google/email scores (highest score wins)
    currentScoresSnap.forEach(doc => {
      const dayId = doc.id;
      const currentScoreData = doc.data();
      const existingDiscordScore = mergedScores.get(dayId);

      if (!existingDiscordScore) {
        mergedScores.set(dayId, currentScoreData);
      } else {
        const currentScoreNum = typeof currentScoreData.score === 'number' ? currentScoreData.score : 0;
        const discordScoreNum = typeof existingDiscordScore.score === 'number' ? existingDiscordScore.score : 0;

        if (currentScoreNum > discordScoreNum) {
          mergedScores.set(dayId, currentScoreData);
        } else {
          mergedScores.set(dayId, existingDiscordScore);
        }
      }
    });

    // 10. Recalculate aggregated stats across all merged scores.
    let perfectScores = 0;
    let totalCorrect = 0;
    const totalAnswered = mergedScores.size * 3;

    mergedScores.forEach((data) => {
      const score = typeof data.score === 'number' ? data.score : 0;
      totalCorrect += score;
      if (score === 3) {
        perfectScores += 1;
      }
    });

    // 11. Merge friends lists (union without self-references).
    const currentFriends: string[] = Array.isArray(currentUserData.friends) ? currentUserData.friends : [];
    const discordFriends: string[] = Array.isArray(discordUserData.friends) ? discordUserData.friends : [];
    const mergedFriends = Array.from(new Set([...currentFriends, ...discordFriends]))
      .filter(id => id !== currentUid && id !== discordId);

    // 12. Merge paid status and Stripe customer ID.
    const mergedHasPaid = Boolean(
      currentUserData.hasPaid === true ||
      discordUserData.hasPaid === true ||
      discordUserRecord.customClaims?.['hasPaid'] === true
    );
    const mergedStripeCustomerId = discordUserData.stripeCustomerId || currentUserData.stripeCustomerId || null;

    // 13. Persist merged daily scores in batches (respecting 500 ops limit).
    const scoreEntries = Array.from(mergedScores.entries());
    // Each score entry performs 2 writes (one to Discord doc, one to Google doc).
    // Firestore max is 500 operations per batch, so chunk by 200 (400 writes).
    const BATCH_SIZE = 200;

    for (let i = 0; i < scoreEntries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = scoreEntries.slice(i, i + BATCH_SIZE);
      for (const [dayId, scoreData] of chunk) {
        batch.set(discordUserDocRef.collection('dailyScores').doc(dayId), scoreData);
        // Keep current account synced so both have the highest score
        batch.set(currentUserDocRef.collection('dailyScores').doc(dayId), scoreData);
      }
      await batch.commit();
    }

    // 14. Persist updated user documents & users_public stats.
    const mainBatch = db.batch();

    // A. Discord user doc
    const discordUserDocUpdate: Record<string, any> = {
      friends: mergedFriends,
      hasPaid: mergedHasPaid,
      linkedGoogleUid: currentUid,
      linkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (mergedStripeCustomerId) {
      discordUserDocUpdate.stripeCustomerId = mergedStripeCustomerId;
    }
    mainBatch.set(discordUserDocRef, discordUserDocUpdate, { merge: true });

    // B. Google/email user doc (retain link pointer & merged friends)
    mainBatch.set(currentUserDocRef, {
      linkedDiscordId: discordId,
      friends: mergedFriends,
      hasPaid: mergedHasPaid,
      linkedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // C. users_public/{discordId}
    const discordPublicRef = db.collection('users_public').doc(discordId);
    mainBatch.set(discordPublicRef, {
      displayName: discordUserRecord.displayName || username,
      photoURL: discordUserRecord.photoURL || photoURL || null,
      friendCode: discordId,
      scores: {
        perfectScores,
        totalAnswered,
        totalCorrect,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // D. users_public/{currentUid} (keep aggregated scores in sync)
    const currentPublicRef = db.collection('users_public').doc(currentUid);
    mainBatch.set(currentPublicRef, {
      scores: {
        perfectScores,
        totalAnswered,
        totalCorrect,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await mainBatch.commit();

    // 15. Update friends of currentUid so their friends arrays point to discordId instead.
    try {
      const friendsOfSnap = await db.collection('users').where('friends', 'array-contains', currentUid).get();
      if (!friendsOfSnap.empty) {
        const friendBatch = db.batch();
        friendsOfSnap.docs.forEach(doc => {
          if (doc.id !== discordId && doc.id !== currentUid) {
            const oldFriends: string[] = doc.data()?.friends || [];
            const newFriends = Array.from(new Set(
              oldFriends.map(fId => fId === currentUid ? discordId : fId)
            ));
            friendBatch.update(doc.ref, { friends: newFriends });
          }
        });
        await friendBatch.commit();
      }
    } catch (friendsErr) {
      console.warn('[API/AUTH/DISCORD/LINK] Warning updating other users friend references:', friendsErr);
    }

    // 16. Update custom claims for hasPaid on Discord user if paid.
    if (mergedHasPaid) {
      await auth.setCustomUserClaims(discordId, { hasPaid: true });
    }

    // 17. Mint custom token for the newly unified Discord account.
    const customToken = await auth.createCustomToken(discordId);

    // If request was from Discord client, exchange for ID token directly on server.
    if (isFromDiscordClient) {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ message: 'Server misconfiguration: missing Firebase API key' }, { status: 500 });
      }

      const exchangeResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Referer: 'https://linguil.app/',
          },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        }
      );

      const exchangeData = await exchangeResponse.json();
      if (!exchangeResponse.ok) {
        console.error('[API/AUTH/DISCORD/LINK] Token exchange failed:', exchangeData);
        return NextResponse.json({ message: 'Failed to exchange custom token' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        customToken,
        idToken: exchangeData.idToken,
        user: {
          uid: discordId,
          displayName: discordUserRecord.displayName || username,
          photoURL: discordUserRecord.photoURL || photoURL,
        },
        hasPaid: mergedHasPaid,
      }, { status: 200 });
    }

    // Standard browser response
    return NextResponse.json({
      success: true,
      customToken,
      user: {
        uid: discordId,
        displayName: discordUserRecord.displayName || username,
        photoURL: discordUserRecord.photoURL || photoURL,
      },
      hasPaid: mergedHasPaid,
    }, { status: 200 });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown server error occurred.';
    console.error('[API/AUTH/DISCORD/LINK] Error linking Discord account:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}