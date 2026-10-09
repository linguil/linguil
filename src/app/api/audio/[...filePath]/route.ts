import 'server-only';
import { type NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Force the use of the Node.js runtime for this route because it uses server-side packages.
export const runtime = 'nodejs';

// Initialize Firebase Admin SDK if not already initialized.
if (getApps().length === 0) {
  initializeApp();
}

// GET handler for the audio proxy API route.
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ filePath: string[] }> }
) => {
  try {
    const { filePath } = await params;
    if (!filePath || !Array.isArray(filePath)) {
      return new NextResponse('File path parameter is missing or invalid.', { status: 400 });
    }

    const fullPath = `audio/${filePath.join('/')}`;
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'linguil.firebasestorage.app';
    const bucket = getStorage().bucket(bucketName);
    const file = bucket.file(fullPath);

    const [exists] = await file.exists();
    if (!exists) {
      return new NextResponse('File not found', { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'audio/mpeg';
    
    // Get a readable stream from the file.
    const stream = file.createReadStream();

    // Convert the Node.js stream to a Web Stream for the NextResponse.
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err: Error) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': contentType,
        // Cache the daily audio file for 24 hours.
        'Cache-Control': 'public, max-age=86400, must-revalidate',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred.';
    console.error(`[API/AUDIO] Error proxying audio file: ${errorMessage}`);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
};