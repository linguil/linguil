'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PlayerStats } from '@/shared/types';
import { useToast } from '@/client/hooks/use-toast';
import { useAuth } from '@/client/hooks/use-auth';
import useFriends from '@/client/hooks/use-friends';

// Manages and displays the leaderboard using server-side polling.
export const useLeaderboard = () => {
  const { user } = useAuth(); // Get user from auth context.
  const [players, setPlayers] = useState<PlayerStats[]>([]); // Holds player statistics.
  const { toast } = useToast(); // Hook for showing toast notifications.

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
  const { handleAddFriend: addFriend, handleRemoveFriend: removeFriend } = useFriends(currentUserStats);

  // Fetches the leaderboard data from the backend.
  const fetchLeaderboard = useCallback(async () => {
    if (!user) return;
    try {
        const response = await fetch('/api/user/friends');
        if (!response.ok) throw new Error('Failed to fetch leaderboard data');
        const data = await response.json();
        setPlayers(data);
    } catch (error) {
        console.error("Could not load leaderboard.", error);
    }
  }, [user]);

  // Sets up and tears down the leaderboard polling.
  useEffect(() => {
    if (!user) {
        setPlayers([]);
        return;
    }

    fetchLeaderboard(); // Fetch data on load.
    const intervalId = setInterval(fetchLeaderboard, 10000); // Poll every 10 seconds.
    
    return () => clearInterval(intervalId); // Cleanup on unmount.
  }, [user, fetchLeaderboard]);


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

    try {
        const response = await fetch('/api/user/update-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName: newName.trim() }),
        });

        if (!response.ok) throw new Error('Server error');
        showToast("Success", "Name updated");
        fetchLeaderboard();

    } catch (_e) {
        showToast("Error", "Failed to update name", "destructive");
    }
  }, [user, showToast, fetchLeaderboard]);

  // Wrapper for adding a friend.
  const handleAddFriend = useCallback(async (uid: string) => {
    await addFriend(uid);
    await fetchLeaderboard();
  }, [addFriend, fetchLeaderboard]);

  // Wrapper for removing a friend.
  const handleRemoveFriend = useCallback(async (uid: string, name: string) => {
    await removeFriend(uid, name);
    await fetchLeaderboard();
  }, [removeFriend, fetchLeaderboard]);

  // Returns the sorted player list and handler functions.
  return { 
      players: sortedPlayers, 
      handleAddFriend, 
      handleRemoveFriend, 
      handleUpdateName, 
      currentUserStats 
    };
};