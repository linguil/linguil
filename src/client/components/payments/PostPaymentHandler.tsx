'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/client/hooks/use-toast';
import { useAuth } from '@/client/hooks/use-auth';

// Timeout for payment processing to prevent indefinite waiting.
const PROCESSING_TIMEOUT_MS = 30000;
// Interval for polling the backend to check for payment status.
const POLLING_INTERVAL_MS = 2000;

// Handles post-payment verification by polling a backend endpoint.
export const PostPaymentHandler = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const verificationStarted = useRef(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    const sessionId = searchParams.get('session_id');

    // Exit if there's no session, no user, or if verification has already started.
    if (!sessionId || !user?.uid || verificationStarted.current) {
      return;
    }
    verificationStarted.current = true;

    let pollingIntervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollingIntervalId) clearInterval(pollingIntervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Set a timeout to prevent indefinite polling.
    timeoutId = setTimeout(() => {
      cleanup();
      toast({
        title: "Processing payment...",
        description: "linguil+ pending",
      });
    }, PROCESSING_TIMEOUT_MS);

    // Start polling the backend API.
    pollingIntervalId = setInterval(async () => {
      try {
        const response = await fetch(`/api/verify-payment`);
        const data = await response.json();

        if (data.status === 'paid') {
          cleanup();

          // Use the success toast.
          toast({
            title: 'Successful payment!',
            description: 'linguil+ unlocked',
          });

          // Reload the app, causing the AuthProvider to refetch the user state.
          window.location.reload();
          window.history.replaceState({}, '', pathname);
        }
      } catch (error) {
        // A single failed poll should not stop the process. Log it to the console and allow polling to continue.
        console.error('Payment verification poll failed:', error);
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      cleanup();
    };
  }, [user, toast]);

  return null;
};

PostPaymentHandler.displayName = 'PostPaymentHandler';