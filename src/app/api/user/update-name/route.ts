import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/api/auth-utils';

if (getApps().length === 0) {
  initializeApp();
}

// This function handles updating a user's display name.
export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticateRequest(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { uid } = authResult;

    const { newName } = await req.json();

    if (!newName || typeof newName !== 'string' || !newName.trim()) {
        return new NextResponse(JSON.stringify({ message: 'Invalid name provided' }), { status: 400 });
    }

    const db = getFirestore();
    const userPublicRef = db.collection('users_public').doc(uid);

    await userPublicRef.update({ displayName: newName });

    return new NextResponse(JSON.stringify({ message: 'Name updated successfully' }), { status: 200 });

  } catch (error) {
    console.error('Update name error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}