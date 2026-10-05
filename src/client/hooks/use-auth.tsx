'use client';

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  useCallback,
} from 'react';
import type { ReactNode } from 'react';
import type { User } from '@/shared/types';
import { GlobalLoadingSpinner } from '@/client/components/common/GlobalLoadingSpinner';
import { useToast } from '@/client/hooks/use-toast';
import { getAuthErrorMessage } from '@/client/lib/auth-errors';

// Defines the shape of the authentication context.
interface AuthContextType {
  user: User | null; // The current authenticated user.
  loading: boolean; // Indicates if authentication status is being checked.
  authError: string | null; // Stores any authentication-related error messages.
  hasPaid: boolean; // Indicates if the user has a paid subscription.
  fetchUserProfile: () => Promise<void>; // Function to fetch the user's profile.
  signInWithReddit: () => Promise<void>; // Function to initiate Reddit sign-in.
  signInWithCustomToken: (
    token: string,
    isNewUser?: boolean,
    method?: string
  ) => Promise<void>; // Sign in with a custom token from the backend.
  logout: () => Promise<void>; // Function to sign the user out.
  clearAuthError: () => void; // Function to clear any authentication errors.
  addSignOutCleanup: (cleanup: () => void) => void; // Adds a cleanup function to be run on sign-out.
  removeSignOutCleanup: (cleanup: () => void) => void; // Removes a cleanup function.
}

// Creates the authentication context.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provides authentication context to the application for Devvit.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // State for the current user.
  const [user, setUser] = useState<User | null>(null);
  // State for loading status.
  const [loading, setLoading] = useState(true);
  // State for authentication errors.
  const [authError, setAuthError] = useState<string | null>(null);
  // State for the user's payment status.
  const [hasPaid, setHasPaid] = useState(false);
  // Ref to store cleanup functions to be run on sign-out.
  const signOutCleanup = useRef<Array<() => void>>([]);
  // Custom hook for displaying toasts.
  const { toast } = useToast();

  const [redditUser, setRedditUser] = useState<{ username: string } | null>(null);
  const hasAttemptedRedditAutoSignIn = useRef(false);

  // Handles and formats authentication errors.
  const handleAuthError = useCallback(
    (error: unknown): void => {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
    },
    []
  );

  // Clears the authentication error state.
  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Adds a cleanup function to the signOutCleanup ref.
  const addSignOutCleanup = useCallback((func: () => void) => {
    signOutCleanup.current.push(func);
  }, []);

  // Removes a specific cleanup function.
  const removeSignOutCleanup = useCallback((func: () => void) => {
    signOutCleanup.current = signOutCleanup.current.filter((fn) => fn !== func);
  }, []);

  // Fetches the current user's profile from the backend. This is the single source of truth for auth state.
  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await fetch('/api/user/me');
      if (response.ok) {
        const data = await response.json();
        // If the backend returns a user, set it. Otherwise, we're logged out.
        if (data && data.user) {
          setUser(data.user as User);
          setHasPaid(data.hasPaid);
        } else {
          setUser(null);
          setHasPaid(false);
        }
      } else {
        // A non-ok response (e.g., 401) also means the user is logged out.
        setUser(null);
        setHasPaid(false);
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      setAuthError('Failed to connect to user service.');
    }
  }, []);

  // Signs in the user by exchanging a custom token for a session cookie.
  const signInWithCustomToken = useCallback(
    async (token: string, _isNewUser?: boolean, _method?: string): Promise<void> => {
      setLoading(true);
      clearAuthError();
      try {
        // The backend exchanges the short-lived custom token for a session cookie.
        const exchangeRes = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!exchangeRes.ok) {
          const exchangeData = await exchangeRes.json();
          throw { code: exchangeData.code || 'TOKEN_EXCHANGE_FAILED' };
        }

        // The cookie is now set. Fetch the user profile to sync the client state.
        await fetchUserProfile();

      } catch (error) {
        handleAuthError(error);
      } finally {
        setLoading(false);
      }
    },
    [clearAuthError, handleAuthError, fetchUserProfile]
  );
  
  // On initial mount, check if the user is already logged in via session cookie.
  useEffect(() => {
    const fetchInitialUser = async () => {
      setLoading(true);
      await fetchUserProfile();
      setLoading(false);
      setAuthError(null);
    };
    fetchInitialUser();
  }, [fetchUserProfile]);

  useEffect(() => {
    fetch('/api/auth/reddit')
      .then((res) => res.json())
      .then((data) => {
        if (data.loggedIn && data.username) {
          setRedditUser({ username: data.username });
        } else {
          setRedditUser(null);
        }
      })
      .catch(() => setRedditUser(null));
  }, []);

  // Listens for real-time changes to the user's payment status by polling.
  useEffect(() => {
    if (!user?.uid) return;

    let isSubscribed = true;
    // Set up an interval to periodically check the user's profile.
    const pollInterval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/user/me');
        if (response.ok && isSubscribed) {
          const data = await response.json();
          // Sync local `hasPaid` state if it differs from the server.
          if (hasPaid !== data.hasPaid) {
            setHasPaid(data.hasPaid);
          }
        }
      } catch (error) {
        // Silently log polling errors to avoid disrupting the user.
        console.error('Failed to poll user profile:', error);
      }
    }, 30000); // Poll every 30 seconds.

    const cleanup = () => {
      isSubscribed = false;
      window.clearInterval(pollInterval);
    };
    // Add the cleanup function to the sign-out cleanup.
    addSignOutCleanup(cleanup);
    // Cleanup the listener on component unmount or when the user changes.
    return () => {
      cleanup();
      removeSignOutCleanup(cleanup);
    };
  }, [user, hasPaid, addSignOutCleanup, removeSignOutCleanup]);

    const signInWithReddit = useCallback(async (): Promise<void> => {
        clearAuthError();
        setLoading(true);
        try {
        // Call the backend proxy to initiate Reddit sign-in.
        const response = await fetch('/api/auth/reddit', {
            method: 'POST',
        });
        
        const data = await response.json();

        if (!response.ok) {
            // The proxy should return a structured error.
            throw new Error(data.error || 'Reddit sign-in failed.');
        }

        if (!data.token) {
            throw new Error('No custom token received from Reddit sign-in.');
        }

        // Use the custom token to establish the app session.
        await signInWithCustomToken(data.token, data.isNewUser || false, 'reddit');

        } catch (error) {
        handleAuthError(error);
        } finally {
        setLoading(false);
        }
    }, [clearAuthError, handleAuthError, signInWithCustomToken]);

    useEffect(() => {
        if (!loading && !user && redditUser && !hasAttemptedRedditAutoSignIn.current) {
        hasAttemptedRedditAutoSignIn.current = true;
        signInWithReddit();
        }
    }, [loading, user, redditUser, signInWithReddit]);

  // Handles user sign-out.
  const logout = useCallback(async (): Promise<void> => {
    try {
      // Call the backend endpoint to clear the session cookie.
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Sign out failed:', error);
      toast({
        title: 'Sign-out failed',
        description: 'An error occurred while signing out',
        variant: 'destructive',
      });
    } finally {
      // Run all registered cleanup functions.
      signOutCleanup.current.forEach((cleanup) => cleanup());
      signOutCleanup.current = [];
      // After logging out on the server, fetch the profile again to clear the local state.
      await fetchUserProfile();
    }
  }, [toast, fetchUserProfile]);

  // The value provided to the AuthContext.
  const value = {
    user,
    loading,
    authError,
    hasPaid,
    signInWithReddit,
    signInWithCustomToken,
    logout,
    clearAuthError,
    addSignOutCleanup,
    removeSignOutCleanup,
    fetchUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Show a global spinner while loading. */}
      {loading ? <GlobalLoadingSpinner /> : children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily consume the AuthContext.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Throw an error if useAuth is used outside of an AuthProvider.
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};