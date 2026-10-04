import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api/auth-utils';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { uid } = authResult;

    const { friendUid } = await req.json();

    if (!friendUid || typeof friendUid !== 'string') {
        return new NextResponse(JSON.stringify({ message: 'Invalid friend UID provided' }), { status: 400 });
    }

    const userDocRef = db.collection('users').doc(uid);

    // Remove friend from the user's friend list
    await userDocRef.update({
        friends: FieldValue.arrayRemove(friendUid)
    });

    return new NextResponse(JSON.stringify({ message: 'Friend removed successfully' }), { status: 200 });

  } catch (error) {
    console.error('Remove friend error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}