'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { GlobalLoadingSpinner } from '@/components/common/GlobalLoadingSpinner';

// Handles the OAuth redirect from Discord.
function DiscordCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signInWithCustomToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Finalizing Discord sign-in...');

  useEffect(() => {
    const code = searchParams.get('code');

    const state = searchParams.get('state');

    if (!code) {
      setError('Invalid redirect from Discord. No authorization code was provided.');
      return;
    }

    // Handle Discord account linking flow.
    if (state === 'link' || state?.startsWith('link')) {
      if (window.opener) {
        setStatus('Linking completed! Closing dialog...');
        window.opener.postMessage({ type: 'DISCORD_LINK_CODE', code }, window.location.origin);
        setTimeout(() => window.close(), 600);
        return;
      }

      // Fallback for full-page redirect when popups are blocked.
      const linkAccount = async () => {
        setStatus('Linking and merging Discord account data...');
        try {
          const response = await fetch('/api/auth/discord/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to link Discord account.');
          }

          const { customToken } = await response.json();
          await signInWithCustomToken(customToken);
          router.push('/leaderboard?linked=true');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setError(`Linking failed: ${errorMessage}`);
          setStatus('Error');
        }
      };

      linkAccount();
      return;
    }

    const exchangeCodeForToken = async () => {
      try {
        const response = await fetch('/api/auth/discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to exchange code for token.');
        }

        const { customToken } = await response.json();

        await signInWithCustomToken(customToken);

        // Redirect user to the home page after successful sign-in.
        router.push('/');

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Sign-in failed: ${errorMessage}`);
        setStatus('Error');
      }
    };

    exchangeCodeForToken();

  }, [searchParams, router, signInWithCustomToken]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-sm p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Signing in...</h1>
        <div className="mt-6">
          {status !== 'Error' && <GlobalLoadingSpinner />}
        </div>
        <p className="text-muted-foreground mt-4">{status}</p>
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </div>
    </main>
  );
}

// Wraps the page in a Suspense boundary, required for using `useSearchParams`.
export default function DiscordCallbackPageWrapper() {
  return (
    <Suspense fallback={<GlobalLoadingSpinner />}>
      <DiscordCallbackPage />
    </Suspense>
  );
}