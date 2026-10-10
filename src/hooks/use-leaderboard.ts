'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Unsubscribe } from 'firebase/firestore';
import type { PlayerStats } from '@/types';
import { useToast } from '@/hooks/use-toast';
import useFriends from './use-friends';
import type { User } from 'firebase/auth';

// Manages and displays the leaderboard.
export const useLeaderboard = (user: User | null, isInsideDiscord?: boolean) => {
  const [players, setPlayers] = useState<PlayerStats[]>([]); // Holds player statistics.
  const { toast } = useToast(); // Hook for showing toast notifications.
  
  // Refs for managing friend UIDs, listeners, and initial load state.
  const friendUidsRef = useRef<string[]>([]);
  const listenersRef = useRef<Unsubscribe[]>([]);
  const userDocListenerRef = useRef<Unsubscribe | null>(null);
  const isInitialLoadRef = useRef(true);

  // Displays a toast notification.
  const showToast = useCallback((title: string, description: string, variant: 'default' | 'destructive' = 'default') => {
    toast({ title, description, variant });
  }, [toast]);

  // Finds the current user's stats from the players list.
  const currentUserStats = useMemo(() => {
    if (!user) return null;
    return players.find(p => p.uid === user.uid) || null;
  }, [players, user]);

  // Hook for handling friend management.
  const { handleAddFriend, handleRemoveFriend } = useFriends(currentUserStats);

  // Cleans up all Firestore listeners.
  const cleanupListeners = useCallback(() => {
    userDocListenerRef.current?.();
    userDocListenerRef.current = null;
    listenersRef.current.forEach(unsub => unsub());
    listenersRef.current = [];
    setPlayers([]);
    friendUidsRef.current = [];
    isInitialLoadRef.current = true;
  }, []);

  const fetchDiscordLeaderboard = useCallback(async () => {
    if (!user) return;
    try {
        const response = await fetch('/api/user/friends');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setPlayers(data);
    } catch {
        showToast("Error", "Could not load leaderboard.", "destructive");
    }
  }, [user, showToast]);

  // Sets up real-time Firestore listeners for the user and their friends.
  const setupListeners = useCallback(async (uid: string, friendUids: string[]) => {
    listenersRef.current.forEach(unsub => unsub()); // Cleans up existing listeners.
    listenersRef.current = [];
    
    const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
    const db = await getFirebaseFirestore();
    const uidsToQuery = Array.from(new Set([uid, ...friendUids])); // Create a unique list of UIDs to query.
    const MAX_IN_QUERIES = 30; // Firestore 'in' query limit.
    const uidChunks: string[][] = [];

    // Split UIDs into chunks to respect query limits.
    for (let i = 0; i < uidsToQuery.length; i += MAX_IN_QUERIES) {
      uidChunks.push(uidsToQuery.slice(i, i + MAX_IN_QUERIES));
    }

    const newPlayersMap = new Map<string, PlayerStats>();

    // Updates the component's state with the latest player data.
    const onNewSnapshot = () => {
      const allPlayers = Array.from(newPlayersMap.values());
      setPlayers(allPlayers);
    };

    if (uidChunks.length === 0) {
      onNewSnapshot(); // Update state even if there are no UIDs to query.
      return;
    }

    const { collection, query, where, onSnapshot } = await import('firebase/firestore');

    // Create a listener for each chunk of UIDs.
    uidChunks.forEach(chunk => {
      if (chunk.length === 0) return;
      const usersQuery = query(collection(db, 'users_public'), where('__name__', 'in', chunk));
      const listener = onSnapshot(usersQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "removed") {
            newPlayersMap.delete(change.doc.id);
          } else {
            newPlayersMap.set(change.doc.id, { uid: change.doc.id, ...change.doc.data() } as PlayerStats);
          }
        });
        onNewSnapshot();
      }, () => {
        showToast("Error", "Failed to load leaderboard data", "destructive");
      });
      listenersRef.current.push(listener);
    });
  }, [showToast]);

  // Orchestrates listener setup when the user logs in or friends change.
  useEffect(() => {
    if (isInsideDiscord) {
      fetchDiscordLeaderboard(); // Fetch data immediately on load
      const intervalId = setInterval(fetchDiscordLeaderboard, 5000); // Poll every 5 seconds
      return () => clearInterval(intervalId); // Cleanup on unmount
    }

    if (!user || !user.uid) {
      cleanupListeners(); // Clean up if user is not logged in.
      return;
    }
    
    let isMounted = true;
    (async () => {
      const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
      const db = await getFirebaseFirestore();
      
      if (userDocListenerRef.current) userDocListenerRef.current(); // Clean up previous user doc listener.

      const { doc, onSnapshot } = await import('firebase/firestore');
      const userDocRef = doc(db, 'users', user.uid); // Listen for changes to the user's friend list.
      userDocListenerRef.current = onSnapshot(userDocRef, (docSnap) => {
        if (!isMounted) return;
        const userData = docSnap.exists() ? (docSnap.data() as PlayerStats) : null;
        const newFriendUids = userData?.friends || [];
        
        const uidsHaveChanged = friendUidsRef.current.length !== newFriendUids.length ||
                                friendUidsRef.current.some(uid => !newFriendUids.includes(uid)) ||
                                newFriendUids.some(uid => !friendUidsRef.current.includes(uid));

        // Set up new listeners if friends change or on initial load.
        if (uidsHaveChanged || isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          friendUidsRef.current = newFriendUids;
          setupListeners(user.uid, newFriendUids);
        }
      }, (error) => {
        console.warn("Leaderboard userDocListener warning:", error?.message);
      });
    })();

    return () => {
      isMounted = false; // Prevent state updates on unmounted component.
      cleanupListeners();
    };
  }, [user, setupListeners, cleanupListeners, isInsideDiscord, fetchDiscordLeaderboard]);

  // Sorts players for the leaderboard display.
  const sortedPlayers = useMemo(() => {
    if (!user) return [];
    
    const currentUser = players.find(p => p.uid === user.uid);
    const friends = players.filter(p => p.uid !== user.uid);

    // Sort friends by correctness ratio, then by total questions answered.
    friends.sort((a, b) => {
        const ratioA = a.scores?.totalAnswered ? a.scores.totalCorrect / a.scores.totalAnswered : 0;
        const ratioB = b.scores?.totalAnswered ? b.scores.totalCorrect / b.scores.totalAnswered : 0;
        if (ratioB !== ratioA) return ratioB - ratioA;
        return (b.scores?.totalAnswered || 0) - (a.scores?.totalAnswered || 0);
    });

    // Always display the current user at the top of the list.
    return currentUser ? [currentUser, ...friends] : friends;
  }, [players, user]);

  // Handles updating the user's display name.
  const handleUpdateName = useCallback(async (newName: string) => {
    if (!user) return;
    if (!newName.trim()) {
      showToast("Invalid name", "Name cannot be empty", "destructive");
      return;
    }

    if (isInsideDiscord) {
        try {
            const response = await fetch('/api/user/update-name', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ newName }),
            });

            if (!response.ok) throw new Error('Server error');
            
            setPlayers(prevPlayers => prevPlayers.map(p => p.uid === user.uid ? { ...p, displayName: newName } : p));
            showToast("Success", "Name updated");

        } catch (_e) {
            showToast("Error", "Failed to update name", "destructive");
        }
        return;
    }

    const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
    const db = await getFirebaseFirestore();

    const { doc, updateDoc } = await import('firebase/firestore');
    const userDocRef = doc(db, 'users_public', user.uid);

    try {
      await updateDoc(userDocRef, { displayName: newName });
      showToast("Success", "Name updated");
    } catch {
      showToast("Error", "Failed to update name", "destructive");
    }
  }, [user, showToast, isInsideDiscord]);

  const handleAddFriendWrapper = useCallback(async (uid: string) => {
    if (!user) return;
    if (isInsideDiscord) {
        try {
            const response = await fetch('/api/user/add-friend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ friendUid: uid }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Server error');
            showToast("New friend", `You are now friends with ${data.friendName}!`);
            fetchDiscordLeaderboard(); // Re-fetch the leaderboard to show the new friend
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
            showToast("Error", errorMessage, "destructive");
        }
        return;
    }
    await handleAddFriend(uid);
  }, [user, isInsideDiscord, showToast, handleAddFriend, fetchDiscordLeaderboard]);

  const handleRemoveFriendWrapper = useCallback(async (uid: string, name: string) => {
    if (!user) return;
    if (isInsideDiscord) {
        try {
            const response = await fetch('/api/user/remove-friend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ friendUid: uid }),
            });
            if (!response.ok) throw new Error('Server error');
            showToast("Friend removed", `You are no longer friends with ${name}.`);
            fetchDiscordLeaderboard(); // Re-fetch the leaderboard to show the change
        } catch (_e) {
            showToast("Error", "Failed to remove friend", "destructive");
        }
        return;
    }
    await handleRemoveFriend(uid, name);
  }, [user, isInsideDiscord, showToast, handleRemoveFriend, fetchDiscordLeaderboard]);

  // Returns the sorted player list and handler functions.
  return { players: sortedPlayers, handleAddFriend: handleAddFriendWrapper, handleRemoveFriend: handleRemoveFriendWrapper, handleUpdateName, currentUserStats };
};