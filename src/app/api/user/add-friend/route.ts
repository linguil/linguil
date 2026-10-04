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

    if (uid === friendUid) {
        return new NextResponse(JSON.stringify({ message: 'Cannot add yourself as a friend' }), { status: 400 });
    }

    const userDocRef = db.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();

    if (userData?.friends?.includes(friendUid)) {
        return new NextResponse(JSON.stringify({ message: 'You are already friends' }), { status: 400 });
    }

    const friendPublicRef = db.collection('users_public').doc(friendUid);
    const friendPublicDoc = await friendPublicRef.get();

    if (!friendPublicDoc.exists) {
        return new NextResponse(JSON.stringify({ message: 'User not found' }), { status: 404 });
    }

    const friendName = friendPublicDoc.data()?.displayName || 'A new friend';

    await userDocRef.update({
        friends: FieldValue.arrayUnion(friendUid)
    });

    return NextResponse.json({ message: 'Friend added successfully', friendName });

  } catch (error) {
    console.error('Add friend error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return new NextResponse(JSON.stringify({ message: errorMessage }), { status: 500 });
  }
}