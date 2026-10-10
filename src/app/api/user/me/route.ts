import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-utils';
import { getFirestore } from 'firebase-admin/firestore';

export async function GET(req: NextRequest) {
  // Verify the Auth header or cookie.
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) {
    return authResult; // Returns 401 Unauthorized if cookie is missing/invalid.
  }

  try {
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(authResult.uid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    
    // Return user payment status and linkedDiscordId.
    return NextResponse.json({
      hasPaid: userData?.hasPaid === true,
      linkedDiscordId: userData?.linkedDiscordId || null,
    }, { status: 200 });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}