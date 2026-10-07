'use client';

import { useToast } from '@/hooks/use-toast';
import type { PlayerStats } from '@/types';
import { useCallback } from 'react';

// Custom hook for managing a user's friend list.
const useFriends = (currentUserStats: PlayerStats | null) => {
  const { toast } = useToast(); // Hook for displaying notifications.

  // Shows a standardized error toast.
  const showErrorToast = useCallback((description: string) => {
    toast({ title: 'Error', description, variant: 'destructive' });
  }, [toast]);

  // Handles adding a new friend.
  const handleAddFriend = useCallback(async (friendUid: string) => {
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
      const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
      const { doc, getDoc, updateDoc, arrayUnion } = await import('firebase/firestore');
      const db = await getFirebaseFirestore();
      const userDocRef = doc(db, 'users', currentUserStats.uid);
      const userDoc = await getDoc(userDocRef);

      // Check if the current user's data exists.
      if (!userDoc.exists()) {
        showErrorToast('Your user data could not be found');
        return;
      }

      const currentData = userDoc.data() as PlayerStats;

      // Check if the potential friend exists.
      const friendDocRef = doc(db, 'users_public', friendUid);
      const friendDoc = await getDoc(friendDocRef);

      if (!friendDoc.exists()) {
        showErrorToast('User does not exist');
        return;
      }

      // Extract friend's first name.
      const friendData = friendDoc.data() as PlayerStats;
      const firstName = (friendData.displayName || 'Anonymous').split(' ')[0];

      // Check if they are already friends.
      if (currentData.friends && currentData.friends.includes(friendUid)) {
        showErrorToast(`${firstName} is already your friend`);
        return;
      }

      // Add the new friend to the user's document.
      await updateDoc(userDocRef, { friends: arrayUnion(friendUid) });

      // Show success notification.
      toast({ title: `New friend: ${firstName}!`, description: 'Added friend successfully' });
    } catch {
      // Show a generic error toast if any part fails.
      showErrorToast('Failed to add friend');
    }
  }, [currentUserStats, toast, showErrorToast]);

  // Handles removing a friend.
  const handleRemoveFriend = useCallback(async (friendUid: string, friendName: string) => {
    // Ensure the current user is logged in.
    if (!currentUserStats?.uid) {
      showErrorToast('You must be logged in to remove friends');
      return;
    }

    try {
      const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
      const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
      const db = await getFirebaseFirestore();
      const userDocRef = doc(db, 'users', currentUserStats.uid);

      // Remove the friend from the user's document.
      await updateDoc(userDocRef, { friends: arrayRemove(friendUid) });

      // Extract friend's first name for the notification.
      const firstName = friendName.split(' ')[0];

      // Show success notification.
      toast({ title: `Friend removed: ${firstName}`, description: 'Removed friend successfully' });
    } catch {
      // Show a generic error toast if removal fails.
      showErrorToast('Failed to remove friend');
    }
  }, [currentUserStats, toast, showErrorToast]);

  // Return the handler functions for use in components.
  return { handleAddFriend, handleRemoveFriend };
};

export default useFriends;