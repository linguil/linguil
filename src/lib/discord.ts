'use client';

import type { DiscordSDK } from '@discord/embedded-app-sdk';

let sdkPromise: Promise<DiscordSDK | null> | null = null;

export const getDiscordSdk = (): Promise<DiscordSDK | null> => {
  if (sdkPromise) {
    return sdkPromise;
  }

  sdkPromise = new Promise((resolve) => {
    try {
      if (typeof window === 'undefined') {
        return resolve(null);
      }

      const searchParams = new URLSearchParams(window.location.search || '');
      if (!searchParams.get('frame_id')) {
        return resolve(null);
      }

      const initialize = async () => {
          try {
            const { DiscordSDK: DiscordSDKConstructor } = await import('@discord/embedded-app-sdk');
            const sdk = new DiscordSDKConstructor(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);

            // Race sdk.ready() against a timeout to prevent hanging indefinitely on iOS WKWebView / mobile.
            const isReady = await Promise.race([
              sdk.ready().then(() => true),
              new Promise<boolean>((res) => setTimeout(() => res(false), 4000)),
            ]);

            if (!isReady) {
              console.warn("Discord SDK ready() timed out; continuing without Discord SDK.");
              resolve(null);
              return;
            }

            resolve(sdk);
          } catch (e) {
            console.error("Discord SDK initialization failed inside the promise:", e);
            resolve(null);
          }
      };
      initialize();

    } catch (e) {
      console.error("Catastrophic synchronous error in getDiscordSdk:", e);
      resolve(null);
    }
  });

  return sdkPromise;
};

export async function setDiscordActivity(sdk: DiscordSDK) {
  try {
    // Set the activity for the user
    await sdk.commands.setActivity({
      activity: {
        details: "Daily",
        state: "Guessing languages",
        timestamps: {
          start: Date.now(),
      },
      assets: {
          large_image: "icon",
          large_text: "linguil | The daily language guessing game",
      },
      type: 0, // Playing
      },
    });
  } catch (error) {
    console.error("Failed to set Discord activity:", error);
  }
}

export const openExternalLink = async (url: string) => {
  const sdk = await getDiscordSdk();
  if (sdk) {
    await sdk.commands.openExternalLink({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};