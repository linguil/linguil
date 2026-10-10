import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api/auth-utils';

// Initialize Firebase Admin SDK if not already initialized.
if (getApps().length === 0) {
  initializeApp();
}

// Interface for the expected score data in the request body.
interface ScoreData {
  score: number;
  totalQuestions: number;
  wordIdentifier: string;
  questionResults: boolean[];
}

export async function POST(req: NextRequest) {
  const db = getFirestore();

  try {
    // 1. Authenticate the user using the Firebase ID token from the cookie.
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult; 
    }
    const { uid } = authResult;

    // 2. Validate the request body against the required structure.
    const body = await req.json();
    const { score, totalQuestions, wordIdentifier, questionResults } = body as ScoreData;

    if (typeof score !== 'number' || typeof totalQuestions !== 'number' || !wordIdentifier || !Array.isArray(questionResults)) {
      return new NextResponse(JSON.stringify({ message: 'Invalid score data payload' }), { status: 400 });
    }

    // 3. Define the document reference for a user's daily score.
    const dailyScoreDocRef = db.collection('users').doc(uid).collection('dailyScores').doc(wordIdentifier);

    // 4. Check if a score has already been saved for this identifier.
    const docSnap = await dailyScoreDocRef.get();
    if (docSnap.exists) {
        console.log(`Score for ${wordIdentifier} has already been saved for user ${uid}.`);
        return new NextResponse(JSON.stringify({ message: 'Score already saved' }), { status: 200 });
    }

    // 5. If no score exists, prepare the new score record.
    const scoreRecord = {
      wordIdentifier,
      score,
      totalQuestions,
      questionResults,
      timestamp: FieldValue.serverTimestamp(),
    };

    // 6. Save the new score record.
    await dailyScoreDocRef.set(scoreRecord);

    // 7. If this account has a linked Discord account, mirror score to ensure bot sees it.
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      const linkedDiscordId = userDoc.data()?.linkedDiscordId;
      if (linkedDiscordId) {
        const discordScoreDocRef = db.collection('users').doc(linkedDiscordId).collection('dailyScores').doc(wordIdentifier);
        const discordDocSnap = await discordScoreDocRef.get();
        if (!discordDocSnap.exists || (discordDocSnap.data()?.score ?? -1) < score) {
          await discordScoreDocRef.set(scoreRecord);
        }
      }
    } catch (mirrorErr) {
      console.error('[API/GAME/SCORE] Warning mirroring score to linked Discord account:', mirrorErr);
    }

    return new NextResponse(JSON.stringify({ message: 'Score saved successfully' }), { status: 201 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    console.error(`[API/GAME/SCORE] Error saving score: ${errorMessage}`);
    return new NextResponse(JSON.stringify({ message: 'Error saving score' }), { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const db = getFirestore();

  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) return authResult;
    const { uid } = authResult;

    // Extract the wordIdentifier from the query string.
    const url = new URL(req.url);
    const wordIdentifier = url.searchParams.get('wordIdentifier');

    if (!wordIdentifier) {
      return new NextResponse(JSON.stringify({ message: 'Missing wordIdentifier' }), { status: 400 });
    }

    const dailyScoreDocRef = db.collection('users').doc(uid).collection('dailyScores').doc(wordIdentifier);
    const docSnap = await dailyScoreDocRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      // Return the questionResults for the Share button.
      return NextResponse.json({ 
        score: data?.score, 
        totalQuestions: data?.totalQuestions,
        questionResults: data?.questionResults
      }, { status: 200 });
    } else {
      return NextResponse.json(null, { status: 200 });
    }
  } catch (error) {
    console.error(`[API/GAME/SCORE] Error fetching score:`, error);
    return new NextResponse(JSON.stringify({ message: 'Error fetching score' }), { status: 500 });
  }
}