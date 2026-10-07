'use client';

import { useToast } from '@/client/hooks/use-toast';
import type { PlayerStats } from '@/shared/types';
import { useCallback } from 'react';

// Custom hook for managing a user's friend list via server-side API calls.
const useFriends = (currentUserStats: PlayerStats | null) => {
  const { toast } = useToast(); // Hook for displaying notifications.

  // Shows a standardized error toast.
  const showErrorToast = useCallback((description: string) => {
    toast({ title: 'Error', description, variant: 'destructive' });
  }, [toast]);

  // Handles adding a new friend by calling the backend API.
  const handleAddFriend = useCallback(async (friendUid: string): Promise<void> => {
    // Ensure the current user is logged in.
    if (!currentUserStats?.uid) {
      showErrorToast('You must be logged in to add friends');
      return;
    }

    // Prevent adding oneself as a friend.
    if (currentUserStats.uid === friendUid) {
      showErrorToast("You can't add yourself as a friend");
      return;
    }

    try {
      const response = await fetch('/api/user/add-friend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendUid }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Use the server's error message if available.
        throw new Error(data.message || 'Failed to add friend');
      }

      // Show success notification using the friend's name from the server's response.
      toast({ title: `New friend: ${data.friendName}!`, description: 'Added friend successfully' });
    } catch (error: any) {
      // Show a toast with the specific error message.
      showErrorToast(error.message || 'An unknown error occurred while adding a friend.');
    }
  }, [currentUserStats, toast, showErrorToast]);

  // Handles removing a friend by calling the backend API.
  const handleRemoveFriend = useCallback(async (friendUid: string, friendName: string): Promise<void> => {
    // Ensure the current user is logged in.
    if (!currentUserStats?.uid) {
      showErrorToast('You must be logged in to remove friends');
      return;
    }

    try {
      const response = await fetch('/api/user/remove-friend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendUid }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Use the server's error message if available.
        throw new Error(data.message || 'Failed to remove friend');
      }

      // Extract friend's first name for the notification.
      const firstName = (friendName || 'Anonymous').split(' ')[0];

      // Show success notification.
      toast({ title: `Friend removed: ${firstName}`, description: 'Removed friend successfully' });
    } catch (error: any) {
      // Show a toast with the specific error message.
      showErrorToast(error.message || 'An unknown error occurred while removing a friend.');
    }
  }, [currentUserStats, toast, showErrorToast]);

  // Return the handler functions for use in components.
  return { handleAddFriend, handleRemoveFriend };
};

export default useFriends;