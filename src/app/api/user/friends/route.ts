import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api/auth-utils';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export async function GET(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { uid } = authResult;

    // Get the user's private document to find their friends list
    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
        return new NextResponse(JSON.stringify({ message: 'User not found' }), { status: 404 });
    }

    const friendUids = userDoc.data()?.friends || [];
    const allUids = Array.from(new Set([uid, ...friendUids]));

    if (allUids.length === 0) {
        return NextResponse.json([]);
    }

    // Fetch the public data for the user and their friends in chunks of 30 (Firestore 'in' limit).
    const usersPublicRef = db.collection('users_public');
    const MAX_IN = 30;
    const chunks: string[][] = [];
    for (let i = 0; i < allUids.length; i += MAX_IN) {
      chunks.push(allUids.slice(i, i + MAX_IN));
    }

    const chunkSnaps = await Promise.all(
      chunks.map(chunk => usersPublicRef.where(FieldPath.documentId(), 'in', chunk).get())
    );

    const playersData = chunkSnaps.flatMap(snap =>
      snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
    );

    return NextResponse.json(playersData);

  } catch (error) {
    console.error('Fetch friends data error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}