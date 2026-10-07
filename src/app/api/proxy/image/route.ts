import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTNAME_PATTERNS = [
  /^cdn\.discordapp\.com$/,
  /^lh3\.googleusercontent\.com$/,
  /^[a-z0-9-]+\.googleusercontent\.com$/,
  /^([a-z0-9-]+\.)?reddit\.com$/,
  /^([a-z0-9-]+\.)?redditstatic\.com$/,
  /^([a-z0-9-]+\.)?redditmedia\.com$/,
  /^i\.redd\.it$/,
];

function isAllowedImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl || !isAllowedImageUrl(imageUrl)) {
    return new NextResponse('Invalid or disallowed image URL', { status: 400 });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch image');

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours.
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Error', { status: 500 });
  }
}