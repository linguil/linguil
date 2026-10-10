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
    const oauthError = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle cancellation or OAuth error from Discord.
    if (oauthError || !code) {
      const isCancelled = oauthError === 'access_denied' || oauthError?.includes('cancel');
      const errorMsg = isCancelled
        ? 'Discord authorization was cancelled.'
        : (errorDescription || oauthError || 'Invalid redirect from Discord. No authorization code was provided.');

      setError(errorMsg);
      setStatus(isCancelled ? 'Cancelled' : 'Error');

      if (state === 'link' || state?.startsWith('link')) {
        if (typeof window !== 'undefined' && window.opener) {
          try {
            window.opener.postMessage({
              type: 'DISCORD_LINK_CANCEL',
              reason: isCancelled ? 'cancelled' : 'error',
              message: errorMsg,
            }, window.location.origin);
          } catch (postErr) {
            console.warn('Could not postMessage to opener:', postErr);
          }
          setTimeout(() => {
            try {
              window.close();
            } catch (_e) { }
          }, 400);
          return;
        }

        router.push('/leaderboard?link_cancelled=true');
        return;
      }

      return;
    }

    // Handle Discord account linking flow.
    if (state === 'link' || state?.startsWith('link')) {
      if (typeof window !== 'undefined' && window.opener) {
        setStatus('Linking completed! You can now close this window.');
        try {
          window.opener.postMessage({ type: 'DISCORD_LINK_CODE', code }, window.location.origin);
        } catch (postErr) {
          console.warn('Could not postMessage to opener:', postErr);
        }
        setTimeout(() => {
          try {
            window.close();
          } catch (_e) {
            // Some browsers block script-initiated window.close() after cross-origin redirects.
          }
        }, 800);
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-md rounded-lg border border-border bg-card text-card-foreground shadow-sm p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {searchParams.get('state')?.startsWith('link')
            ? (status === 'Cancelled' ? 'Linking cancelled' : 'Linking account...')
            : (status === 'Error' ? 'Sign-in failed' : 'Signing in...')}
        </h1>
        <div className="mt-6">
          {status !== 'Error' && status !== 'Cancelled' && <GlobalLoadingSpinner />}
        </div>
        <p className="text-foreground/80 mt-4 text-sm">{status === 'Cancelled' ? 'Authorization was cancelled.' : status}</p>
        {error && status !== 'Cancelled' && <p className="text-destructive mt-2 text-sm">{error}</p>}
        {searchParams.get('state')?.startsWith('link') && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                try {
                  window.close();
                } catch (_e) { }
              }}
              className="px-4 py-2 text-xs rounded-md border border-border bg-background hover:bg-muted/40 text-foreground transition-colors"
            >
              Close window
            </button>
          </div>
        )}
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