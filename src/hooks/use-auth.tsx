'use client';

import {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  useCallback,
  Suspense,
  type ReactNode,
  type ComponentType,
} from 'react';
import type { User, UserCredential } from 'firebase/auth';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { AuthDialogProps } from '@/components/auth/AuthDialog';
import Cookies from 'js-cookie';
import { GlobalLoadingSpinner } from '@/components/common/GlobalLoadingSpinner';
import { useToast } from './use-toast';
import { getAuthErrorMessage } from '@/lib/auth-actions';
import type { DiscordClientUser, DiscordClientAuthResponse } from '@/lib/discord-auth';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams } from 'next/navigation';
import { isDiscordEnvironment } from '@/lib/utils';

// Defines the cookie name for the Firebase ID token.
const FIREBASE_ID_TOKEN_COOKIE = 'firebaseIdToken';

// Defines the shape of the authentication context.
interface AuthContextType {
  user: User | null; // The current authenticated Firebase user.
  discordClientUser: DiscordClientUser | null; // User data from Discord client flow.
  loading: boolean; // Indicates if authentication status is being checked.
  authError: string | null; // Stores any authentication-related error messages.
  hasPaid: boolean; // Indicates if the user has a paid subscription.
  isInsideDiscord: boolean; // Indicates if the app is inside the Discord client.
  isGooglePolling: boolean;
  cancelGooglePolling: () => void;
  signInWithGoogle: () => Promise<void>; // Function to initiate Google sign-in.
  signInWithDiscord: () => Promise<void>; // Function to initiate Discord sign-in.
  signInWithCustomToken: (token: string) => Promise<void>; // Function to sign in with a custom token.
  signInWithEmail: (email: string, password: string) => Promise<boolean>; // Function for email and password sign-in.
  signUpWithEmail: (name: string, email: string, password: string) => Promise<boolean>; // Function for email and password sign-up.
  resetPassword: (email: string) => Promise<boolean>; // Function to send a password reset email.
  logout: () => Promise<void>; // Function to sign the user out.
  clearAuthError: () => void; // Function to clear any authentication errors.
  linkedDiscordId: string | null; // The Discord ID linked to this account, if any.
  linkWithDiscord: () => Promise<boolean>; // Initiates linking with Discord.
  openAuthDialog: () => void; // Function to open the authentication modal.
  addSignOutCleanup: (cleanup: () => void) => void; // Adds a cleanup function to be run on sign-out.
  removeSignOutCleanup: (cleanup: () => void) => void; // Removes a cleanup function.
}

// Creates the authentication context.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProviderContent = ({ children }: { children: ReactNode }) => {
  // State for the current user.
  const [user, setUser] = useState<User | null>(null);
  const [discordClientUser, setDiscordClientUser] = useState<DiscordClientUser | null>(null);
  // State for loading status.
  const [loading, setLoading] = useState(true);
  // State for authentication errors.
  const [authError, setAuthError] = useState<string | null>(null);
  // State for the user's payment status.
  const [hasPaid, setHasPaid] = useState(false);
  // State for linked Discord ID.
  const [linkedDiscordId, setLinkedDiscordId] = useState<string | null>(null);
  // State to control the visibility of the authentication dialog.
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  // State to hold the dynamically imported AuthDialog component.
  const [AuthDialog, setAuthDialog] = useState<ComponentType<AuthDialogProps> | null>(null);
  // Ref to store cleanup functions to be run on sign-out.
  const signOutCleanup = useRef<Array<() => void>>([]);
  // Custom hook for displaying toasts.
  const { toast } = useToast();
  // Ref to hold the Firestore instance.
  const dbRef = useRef<Firestore | null>(null);
  // State to check if the app is inside the Discord client.
  const [isInsideDiscord, setIsInsideDiscord] = useState(() => isDiscordEnvironment());
  // State to prevent hydration errors by delaying client-side logic.
  const [hasMounted, setHasMounted] = useState(false);
  const [isGooglePolling, setIsGooglePolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchParams = useSearchParams();

  const cancelGooglePolling = useCallback(() => {
    setIsGooglePolling(false);
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
  }, []);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Logs analytics events.
  const logEvent = useCallback(async (eventName: string, params = {}) => {
    if (isInsideDiscord) return;
    try {
      const { getFirebaseAnalytics } = await import('@/lib/firebase/firebase');
      const { logEvent: logAnalyticsEvent } = await import('firebase/analytics');
      const analytics = await getFirebaseAnalytics();
      if (analytics) {
        logAnalyticsEvent(analytics, eventName, params);
      }
    } catch {
      // This error is not critical to the user, so we can ignore it.
    }
  }, [isInsideDiscord]);

  // Handles and formats authentication errors.
  const handleAuthError = useCallback((error: unknown): void => {
    const message = getAuthErrorMessage(error);
    setAuthError(message);
  }, []);

  // Clears the authentication error state.
  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Adds a cleanup function to the signOutCleanup ref.
  const addSignOutCleanup = useCallback(
    (cleanupFunc: () => void) => signOutCleanup.current.push(cleanupFunc),
    []
  );

  // Removes a specific cleanup function.
  const removeSignOutCleanup = useCallback(
    (cleanupFunc: () => void) => {
      signOutCleanup.current = signOutCleanup.current.filter(
        (fn) => fn !== cleanupFunc
      );
    },
    []
  );

  // Helper to call the CAPI tracking function for new Google/Discord website sign-ups.
  const trackRegistration = useCallback(async () => {
    if (isInsideDiscord) return;

    try {
      const { getFirebaseFunctions } = await import('@/lib/firebase/firebase');
      const functions = await getFirebaseFunctions();
      const trackSocialRegistration = httpsCallable(functions, 'trackSocialRegistration');
      const fbc = Cookies.get('_fbc') || undefined;
      const fbp = Cookies.get('_fbp');
      const leadId = searchParams.get('lead_id') || undefined;
      await trackSocialRegistration({ fbc, fbp, leadId });
    } catch (error) {
      console.error("Failed to track social registration via CAPI:", error);
    }
  }, [isInsideDiscord, searchParams]);

  const signInWithDiscord = useCallback(async (): Promise<void> => {
    clearAuthError();
    setLoading(true);

    try {
      const { handleSignInWithDiscord } = await import('@/lib/discord-auth');

      const response = await handleSignInWithDiscord();

      if (!response) {
        setLoading(false);
        return;
      }

      if ('user' in response) {
        // Discord Client authentication: set user data and then set the activity.
        const clientAuth = response as DiscordClientAuthResponse;

        // Manually set the cookie and the React state.
        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, clientAuth.idToken, { expires: 1, secure: true, sameSite: 'none' });
        sessionStorage.setItem('discord_auth_cache', JSON.stringify({ idToken: clientAuth.idToken }));

        // Manually mock the Firebase User object to satisfy the context type.
        setUser({
          uid: clientAuth.user.uid,
          displayName: clientAuth.user.displayName,
          photoURL: clientAuth.user.photoURL
        } as User);

        setDiscordClientUser(clientAuth.user);
        setHasPaid(clientAuth.hasPaid);

        const { getDiscordSdk, setDiscordActivity } = await import('@/lib/discord');
        const sdk = await getDiscordSdk();
        if (sdk) {
          await setDiscordActivity(sdk);
        }
      }

    } catch (error: any) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  }, [clearAuthError, handleAuthError]);

  useEffect(() => {
    if (!hasMounted) return;

    const inDiscord = isDiscordEnvironment();
    setIsInsideDiscord(inDiscord);

    let unsubscribe: (() => void) | undefined;
    let discordSafetyTimeout: NodeJS.Timeout | undefined;

    if (inDiscord) {
      // 1. Discord
      // Safety timeout: ensure loading state is cleared if Discord handshake or network stalls.
      discordSafetyTimeout = setTimeout(() => {
        setLoading(false);
      }, 7000);

      const silentSignIn = async () => {
        try {
          const { handleSilentSignIn } = await import('@/lib/discord-auth');
          const authResponse = await handleSilentSignIn();

          if (authResponse) {
            Cookies.set(FIREBASE_ID_TOKEN_COOKIE, authResponse.idToken, { expires: 1, secure: true, sameSite: 'none' });
            sessionStorage.setItem('discord_auth_cache', JSON.stringify({ idToken: authResponse.idToken }));
            setUser({
              uid: authResponse.user.uid,
              displayName: authResponse.user.displayName,
              photoURL: authResponse.user.photoURL
            } as User);

            setDiscordClientUser(authResponse.user);
            setHasPaid(authResponse.hasPaid);

            const { getDiscordSdk, setDiscordActivity } = await import('@/lib/discord');
            const sdk = await getDiscordSdk();
            if (sdk) {
              await setDiscordActivity(sdk);
            }
          }
        } catch (error) {
          console.error("An unexpected error occurred during Discord silent sign-in:", error);
        } finally {
          if (discordSafetyTimeout) clearTimeout(discordSafetyTimeout);
          setLoading(false);
        }
      };
      silentSignIn();

    } else {
      // 2. Browser
      const initializeAuth = async () => {
        try {
          const { getFirebaseAuth } = await import('@/lib/firebase/firebase');
          const { onIdTokenChanged } = await import('firebase/auth');
          const auth = await getFirebaseAuth();

          unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
            if (currentUser) {
              const idTokenResult = await currentUser.getIdTokenResult();
              const paidStatus = idTokenResult.claims.hasPaid === true;
              setUser(currentUser);
              setHasPaid(paidStatus);
              Cookies.set(FIREBASE_ID_TOKEN_COOKIE, idTokenResult.token, { expires: 1, secure: true, sameSite: 'none' });
              try {
                const { getFirebaseAnalytics } = await import('@/lib/firebase/firebase');
                const { setUserId, setUserProperties } = await import('firebase/analytics');
                const analytics = await getFirebaseAnalytics();
                if (analytics && !inDiscord) {
                  setUserId(analytics, currentUser.uid);
                  setUserProperties(analytics, { has_paid: paidStatus });
                }
              } catch { }
            } else {
              setUser(null);
              setHasPaid(false);
              setLinkedDiscordId(null);
              Cookies.remove(FIREBASE_ID_TOKEN_COOKIE);
            }
            setLoading(false);
            setAuthError(null);
            setIsAuthDialogOpen(false);
          });
        } catch {
          setAuthError("Failed to connect to authentication service");
          setLoading(false);
        }
      };
      initializeAuth();
    }

    return () => {
      if (discordSafetyTimeout) {
        clearTimeout(discordSafetyTimeout);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [hasMounted]);

  // This effect runs when the Discord user state changes.
  useEffect(() => {
    if (discordClientUser) {
      // The user has successfully signed in via the Discord client.
      setIsAuthDialogOpen(false);
    }
  }, [discordClientUser]);

  // Listens for real-time changes to the user's payment status.
  useEffect(() => {
    const currentUid = user?.uid || discordClientUser?.uid;
    if (!currentUid) return;

    if (isInsideDiscord) {
      // Discord: Use secure backend polling as the Firestore client SDK is not authenticated.
      let isSubscribed = true;
      let pollInterval: NodeJS.Timeout;

      const fetchUserProfile = async (): Promise<void> => {
        try {
          // Fallback check: cookie -> session storage cache
          let token: string | undefined = Cookies.get(FIREBASE_ID_TOKEN_COOKIE);

          if (token === 'undefined') {
            Cookies.remove(FIREBASE_ID_TOKEN_COOKIE, { secure: true, sameSite: 'none' });
            token = undefined;
          }

          if (!token) {
            const cache = sessionStorage.getItem('discord_auth_cache');
            if (cache) {
              try {
                const parsed = JSON.parse(cache);
                token = parsed.idToken;
              } catch (_e) { }
            }
          }

          if (token === 'undefined') token = undefined;

          if (!token) return;

          const response = await fetch(`/api/user/me?token=${token}`, {
            headers: {
              'x-auth-token': token
            }
          });

            if (response.ok && isSubscribed) {
              const data = await response.json();
              if (hasPaid !== data.hasPaid) {
                setHasPaid(data.hasPaid);
              }
              if (data.linkedDiscordId !== undefined) {
                setLinkedDiscordId(data.linkedDiscordId);
              }
            }
        } catch (error) {
          console.error("Failed to sync user profile from backend:", error);
        }
      };

      fetchUserProfile();
      pollInterval = setInterval(fetchUserProfile, 30000); // 30 seconds

      return () => {
        isSubscribed = false;
        clearInterval(pollInterval);
      };
    } else {
      // Browser: Use an onSnapshot listener with the authenticated Firestore client SDK.
      let unsubscribe: (() => void) | undefined;
      const initializeFirestore = async () => {
        try {
          if (!dbRef.current) {
            const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
            dbRef.current = await getFirebaseFirestore();
          }
          const userDocRef = doc(dbRef.current, 'users', currentUid);
          // Listen for snapshot changes on the user's document.
          unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              const docData = docSnap.data();
              const serverHasPaid = docData.hasPaid === true;
              if (docData.linkedDiscordId !== undefined) {
                setLinkedDiscordId(docData.linkedDiscordId || null);
              }
              // Sync local `hasPaid` state if it differs from the server.
              if (hasPaid !== serverHasPaid) {
                setHasPaid(serverHasPaid);
                // Update user properties in analytics.
                import('@/lib/firebase/firebase').then(({ getFirebaseAnalytics }) => {
                  getFirebaseAnalytics().then(analytics => {
                    if (analytics) {
                      import('firebase/analytics').then(({ setUserProperties }) => {
                        setUserProperties(analytics, { has_paid: serverHasPaid });
                      });
                    }
                  });
                });
              }
            }
          });

          // Add the unsubscribe function to the sign-out cleanup.
          addSignOutCleanup(unsubscribe);
        } catch {
          setAuthError("Failed to connect to user database");
        }
      };
      initializeFirestore();

      // Cleanup the listener on component unmount or when the user changes.
      return () => {
        if (unsubscribe) {
          unsubscribe();
          removeSignOutCleanup(unsubscribe);
        }
      };
    }
  }, [user, discordClientUser, isInsideDiscord, hasPaid, addSignOutCleanup, removeSignOutCleanup]);


  // Handles Google sign-in.
  const signInWithGoogle = useCallback(async (): Promise<void> => {
    clearAuthError();
    try {
      if (isInsideDiscord) {
        // Discord: Open external browser and poll.
        setIsGooglePolling(true);
        const sessionId = crypto.randomUUID();

        // Register session in backend.
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', sessionId })
        });

        // Open user's desktop browser.
        const { openExternalLink } = await import('@/lib/discord');
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://linguil.app';
        await openExternalLink(`${baseUrl}/auth/google/external?session=${sessionId}`);

        // Start polling for completion.
        pollingIntervalRef.current = setInterval(async () => {
          const res = await fetch(`/api/auth/session?sessionId=${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'completed') {
              clearInterval(pollingIntervalRef.current!);
              setIsGooglePolling(false);

              // If login is successful, apply credentials locally.
              Cookies.set(FIREBASE_ID_TOKEN_COOKIE, data.idToken, { expires: 1, secure: true, sameSite: 'none' });
              setUser(data.user as User);
              setIsAuthDialogOpen(false);
            }
          }
        }, 2500);

      } else {
        // Browser: Use the Firebase SDK.
        const { signInWithGoogle: signIn }: { signInWithGoogle: (isInsideDiscord: boolean) => Promise<UserCredential | void> } = await import('@/lib/auth-actions');
        const { getAdditionalUserInfo } = await import('firebase/auth');
        const userCredential = await signIn(false);

        if (userCredential) {
          const user = (userCredential as UserCredential).user;
          const idTokenResult = await user.getIdTokenResult();
          const paidStatus = idTokenResult.claims.hasPaid === true;
          setUser(user);
          setHasPaid(paidStatus);
          Cookies.set(FIREBASE_ID_TOKEN_COOKIE, idTokenResult.token, { expires: 1, secure: true, sameSite: 'none' });
          const isNewUser = getAdditionalUserInfo(userCredential as UserCredential)?.isNewUser ?? false;
          // Fire CAPI event for new Google website users.
          if (isNewUser) {
            trackRegistration();
          }
          logEvent(isNewUser ? 'sign_up' : 'login', { method: 'google' });
          setIsAuthDialogOpen(false);
        }
      }
    } catch (error) {
      setIsGooglePolling(false);
      handleAuthError(error);
    }
  }, [isInsideDiscord, clearAuthError, handleAuthError, logEvent, trackRegistration]);

  const signInWithCustomToken = useCallback(async (token: string): Promise<void> => {
    clearAuthError();
    try {
      if (isInsideDiscord) {
        const exchangeRes = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const exchangeData = await exchangeRes.json();
        if (!exchangeRes.ok) throw { code: exchangeData.code || "UNKNOWN_ERROR" };

        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, exchangeData.idToken, { expires: 1, secure: true, sameSite: 'none' });
        setUser(exchangeData.user as User);
        setIsAuthDialogOpen(false);
      } else {
        const { getFirebaseAuth } = await import('@/lib/firebase/firebase');
        const { getAdditionalUserInfo, signInWithCustomToken: firebaseSignInWithCustomToken } = await import('firebase/auth');
        const auth = await getFirebaseAuth();
        const userCredential = await firebaseSignInWithCustomToken(auth, token);
        const isNewUser = getAdditionalUserInfo(userCredential)?.isNewUser ?? false;
        // Fire CAPI event for new Discord website users.
        if (isNewUser) {
          trackRegistration();
        }
        logEvent(isNewUser ? 'sign_up' : 'login', { method: 'discord' });
        setIsAuthDialogOpen(false);
      }
    } catch (error) {
      handleAuthError(error);
    }
  }, [clearAuthError, handleAuthError, logEvent, isInsideDiscord, trackRegistration]);

  const linkWithDiscord = useCallback(async (): Promise<boolean> => {
    clearAuthError();
    setLoading(true);
    try {
      const { linkDiscordAccount } = await import('@/lib/discord-auth');
      const idToken = user ? await user.getIdToken() : undefined;
      const result = await linkDiscordAccount(isInsideDiscord, idToken);

      if (result && result.customToken) {
        await signInWithCustomToken(result.customToken);
        setLinkedDiscordId(result.user.uid);
        setLoading(false);
        return true;
      }
      setLoading(false);
      return false;
    } catch (error: any) {
      handleAuthError(error);
      setLoading(false);
      throw error;
    }
  }, [user, isInsideDiscord, clearAuthError, handleAuthError, signInWithCustomToken]);


  const signInWithEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    clearAuthError();
    if (!email || !password) {
      setAuthError('Missing email or password');
      return false;
    }
    try {
      if (isInsideDiscord) {
        // Discord: Proxy sign-in.
        const response = await fetch('/api/auth/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw { code: data.code || "UNKNOWN_ERROR" };

        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, data.idToken, { expires: 1, secure: true, sameSite: 'none' });
        setUser(data.user as User);
        setIsAuthDialogOpen(false);
        return true;
      } else {
        // Browser: Standard sign-in.
        const { handleSignInWithEmail } = await import('@/lib/auth-actions');
        const userCredential = await handleSignInWithEmail(email, password);
        const user = userCredential.user;
        const idTokenResult = await user.getIdTokenResult();
        setUser(user);
        setHasPaid(idTokenResult.claims.hasPaid === true);
        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, idTokenResult.token, { expires: 1, secure: true, sameSite: 'none' });
        logEvent('login', { method: 'email' });
        setIsAuthDialogOpen(false);
        return true;
      }
    } catch (error) {
      handleAuthError(error);
      return false;
    }
  }, [isInsideDiscord, clearAuthError, handleAuthError, logEvent]);

  // Handles new user sign-up.
  const signUpWithEmail = useCallback(async (name: string, email: string, password: string): Promise<boolean> => {
    clearAuthError();
    if (!name.trim() || !email || !password) {
      setAuthError('Missing name, email or password');
      return false;
    }
    try {
      const leadId = searchParams.get('lead_id') || undefined;
      if (isInsideDiscord) {
        // 1. Call your original cloud function to create the user & get custom token.
        const createRes = await fetch('/api/create-user-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, leadId })
        });
        const createData = await createRes.json();

        if (!createRes.ok) {
          const errMsg = typeof createData.error === 'string' ? createData.error : createData.error?.message || "Failed to create user account.";
          throw new Error(errMsg);
        }

        // 2. Exchange custom token for an ID token securely via backend proxy.
        const exchangeRes = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: createData.token })
        });
        const exchangeData = await exchangeRes.json();

        if (!exchangeRes.ok) {
          throw new Error(exchangeData.code || "Failed to finalise authentication.");
        }

        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, exchangeData.idToken, { expires: 1, secure: true, sameSite: 'none' });
        setUser(exchangeData.user as User);
        setIsAuthDialogOpen(false);
        return true;
      } else {
        // Browser: Standard sign-up.
        const { handleSignUpWithEmail } = await import('@/lib/auth-actions');
        const userCredential = await handleSignUpWithEmail(name, email, password, { leadId });
        const user = userCredential.user;
        const idTokenResult = await user.getIdTokenResult();
        setUser(user);
        setHasPaid(idTokenResult.claims.hasPaid === true);
        Cookies.set(FIREBASE_ID_TOKEN_COOKIE, idTokenResult.token, { expires: 1, secure: true, sameSite: 'none' });
        logEvent('sign_up', { method: 'email' });
        setIsAuthDialogOpen(false);
        return true;
      }
    } catch (error) {
      handleAuthError(error);
      return false;
    }
  }, [isInsideDiscord, clearAuthError, handleAuthError, logEvent, searchParams]);

  // Handles password reset requests.
  const resetPassword = useCallback(
    async (email: string): Promise<boolean> => {
      clearAuthError();
      if (!email) {
        setAuthError('Email is required');
        return false;
      }
      try {
        const { handleResetPassword } = await import('@/lib/auth-actions');
        await handleResetPassword(email);
        toast({
          title: 'Password reset email sent',
          description: 'Check your inbox for a link to reset your password',
        });
        return true;
      } catch (error) {
        handleAuthError(error);
        return false;
      }
    },
    [clearAuthError, handleAuthError, toast]
  );

  // Handles user sign-out.
  const logout = useCallback(async (): Promise<void> => {
    try {
      // Run all registered cleanup functions.
      signOutCleanup.current.forEach((cleanup) => cleanup());
      signOutCleanup.current = [];

      if (isInsideDiscord) {
        // Clear Discord local state and session cookie.
        setDiscordClientUser(null);
        setUser(null);
        setLinkedDiscordId(null);
        Cookies.remove(FIREBASE_ID_TOKEN_COOKIE, { secure: true, sameSite: 'none' });
      } else {
        setLinkedDiscordId(null);
        // Only call Firebase sign-out if in browser.
        const { handleSignOut }: { handleSignOut: () => Promise<void> } = await import('@/lib/auth-actions');
        await handleSignOut();
      }
    } catch {
      toast({
        title: 'Sign-out failed',
        description: 'An error occurred while signing out',
        variant: 'destructive',
      });
    }
  }, [isInsideDiscord, toast]);

  // Dynamically loads and opens the authentication dialog.
  const openAuthDialog = useCallback(() => {
    if (AuthDialog) {
      setIsAuthDialogOpen(true);
    } else {
      import('@/components/auth/AuthDialog').then((module) => {
        setAuthDialog(() => module.AuthDialog);
        setIsAuthDialogOpen(true);
      });
    }
  }, [AuthDialog]);

  // The value provided to the AuthContext.
  const value = {
    user,
    discordClientUser,
    loading,
    authError,
    hasPaid,
    linkedDiscordId,
    linkWithDiscord,
    isInsideDiscord,
    isGooglePolling,
    cancelGooglePolling,
    signInWithGoogle,
    signInWithDiscord,
    signInWithCustomToken,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    logout,
    clearAuthError,
    openAuthDialog,
    addSignOutCleanup,
    removeSignOutCleanup,
  };

  return (
    <AuthContext.Provider value={value}>
      {/* Show a global spinner while loading, otherwise show children. */}
      {loading ? <GlobalLoadingSpinner /> : children}
      {/* Dynamically render the AuthDialog when needed. */}
      {AuthDialog && <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />}
    </AuthContext.Provider>
  );
};

// Provides authentication context to the application.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  return (
    <Suspense>
      <AuthProviderContent>{children}</AuthProviderContent>
    </Suspense>
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