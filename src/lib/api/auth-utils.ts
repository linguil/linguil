import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK if it hasn't been already.
if (getApps().length === 0) {
  initializeApp();
}

// Authenticates an incoming API request.
// It checks for a 'firebaseIdToken' cookie, verifies it with Firebase Admin, and returns the user's UID if the token is valid.
// If authentication fails at any step, it returns a NextResponse object with the appropriate HTTP status code and error message.

export const authenticateRequest = async (req: NextRequest): Promise<{ uid: string } | NextResponse> => {
  // 1. Try URL parameters to bypass Discord proxy header stripping.
  const cookieStore = await cookies();
  let tokenValue = req.nextUrl.searchParams.get('token');

  // 2. Try our custom header fallback.
  if (!tokenValue) {
    const customHeader = req.headers.get('x-auth-token');
    if (customHeader) tokenValue = customHeader;
  }
  
  // 3. Try standard authorisation.
  if (!tokenValue) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenValue = authHeader.substring(7);
    }
  }

  // 4. Try cookie (standard browser fallback)
  if (!tokenValue) {
    const idToken = cookieStore.get('firebaseIdToken');
    if (idToken) {
      tokenValue = idToken.value;
    }
  }

  if (!tokenValue) {
    return new NextResponse(JSON.stringify({ message: 'Unauthorized: No Firebase ID token provided.' }), { status: 401 });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(tokenValue);
    return { uid: decodedToken.uid };
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return new NextResponse(JSON.stringify({ message: 'Unauthorized: Invalid Firebase ID token.' }), { status: 401 });
  }
};