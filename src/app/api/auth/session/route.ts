import 'server-only';
import { NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK if not already done.
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Handles the creation and fulfillment of external Google Auth sessions.
export async function POST(req: Request) {
  const { action, sessionId, idToken, user } = await req.json();
  const sessionRef = db.collection('_auth_sessions').doc(sessionId);

  if (action === 'create') {
    // Discord creates a pending session.
    await sessionRef.set({ status: 'pending', createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  }

  if (action === 'fulfill') {
    // The external Chrome/Safari browser fulfills the session with the token.
    await sessionRef.update({ status: 'completed', idToken, user });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// The Discord client polls this endpoint to check if the user finished logging in.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  const doc = await db.collection('_auth_sessions').doc(sessionId).get();
  if (!doc.exists) return NextResponse.json({ status: 'not_found' });

  return NextResponse.json(doc.data());
}