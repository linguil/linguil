'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthButton } from '@/components/auth/AuthButton';
import { useToast } from '@/hooks/use-toast';
import useLocalStorage from '@/hooks/use-local-storage';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import dynamic from 'next/dynamic';
import { DarkModeToggleSwitch } from '@/components/common/DarkModeToggleSwitch';
import type { PlayerStats } from '@/types';
import type { User } from 'firebase/auth';
import MockLeaderboard from './MockLeaderboard';
import { LinkDiscordButton } from '@/components/leaderboard/LinkDiscordButton';

// Dynamically import the Leaderboard component to reduce bundle size, with a loading spinner as a fallback.
const Leaderboard = dynamic(() => import('@/components/leaderboard/Leaderboard').then(mod => mod.Leaderboard), {
  loading: () => <div className="min-h-[550px] flex justify-center items-center"><LoadingSpinner /></div>,
  ssr: false
});

// Dynamically import the AddFriendCard component, also with a loading fallback.
const AddFriendCard = dynamic(() => import('@/components/leaderboard/AddFriendCard').then(mod => mod.AddFriendCard), {
  loading: () => <div className="min-h-[260px] lg:min-h-[180px] flex justify-center items-center"><LoadingSpinner /></div>,
  ssr: false
});

// Define an array of colors for the chart.
const CHART_COLORS = [
  'hsl(26 80% 67%)', // Warm Orange
  'hsl(174 41% 51%)', // Teal
  'hsl(43 74% 66%)', // Yellow-Orange
  'hsl(350 65% 65%)', // Pinkish-Red
  'hsl(210 35% 55%)', // Blue
];

// This component renders the client-side logic for the leaderboard page.
const AuthenticatedView = ({ user, isInsideDiscord }: { user: User, isInsideDiscord: boolean }) => {
  // Get the toast function for displaying notifications.
  const { toast } = useToast();
  // Use local storage to persist the selected chart color.
  const [chartColor, setChartColor] = useLocalStorage<string>('chartColor', CHART_COLORS[0]);
  // State to manage the friend's UID input field.
  const [friendUid, setFriendUid] = useState('');

  // Get leaderboard data and functions from the useLeaderboard hook.
  const { players, handleAddFriend, handleRemoveFriend, handleUpdateName } = useLeaderboard(user, isInsideDiscord);

  // Function to copy the user's UID to the clipboard.
  const handleCopy = () => {
    if (user) {
      navigator.clipboard.writeText(user.uid);
      toast({
        title: 'ID copied',
        description: 'Your ID has been copied to your clipboard',
      });
    }
  };

  return (
    <>
      <div className="relative">
        {/* Show DarkModeToggleSwitch if the user is authenticated. */}
        {user && (
          <div className="absolute top-6 right-6 z-20">
            <DarkModeToggleSwitch variant="gamepage" />
          </div>
        )}
        {/* The Leaderboard is rendered with the user's actual data. */}
        <Leaderboard
          players={players as PlayerStats[]}
          chartColor={chartColor}
          onChartColorChange={setChartColor}
          onRemoveFriend={handleRemoveFriend}
          onUpdateName={handleUpdateName}
          currentUserId={user?.uid}
        />
      </div>

      {/* Show the AddFriendCard if the user is authenticated. */}
      {user ? (
        <AddFriendCard
          friendUid={friendUid}
          onFriendUidChange={setFriendUid}
          onAddFriend={async (uid: string) => {
            await handleAddFriend(uid);
            setFriendUid('');
          }}
          onCopy={handleCopy}
          user={user as User}
        />
      ) : null}

      {/* Link with Discord button for Google and email accounts */}
      <LinkDiscordButton />
    </>
  )
}

// This component renders the client-side logic for the leaderboard page.
const LeaderboardPageClient = () => {
  // Get user authentication status and data from the useAuth hook.
  const { user, loading, isInsideDiscord } = useAuth();

  // Show a loading spinner while checking the authentication status.
  if (loading) {
    return <div className="min-h-screen flex justify-center items-center"><LoadingSpinner /></div>;
  }

  // Render the leaderboard page layout.
  return (
    <div className="w-full text-center pb-24 px-4 pt-2 md:pt-4">
      <div className="min-h-[550px] flex flex-col justify-center">
        <div className="w-full flex justify-end mb-4 h-10">
          {/* Show the AuthButton if the user is authenticated. */}
          {user && (
            <div className="relative z-20">
              <AuthButton />
            </div>
          )}
        </div>

        {user ? <AuthenticatedView user={user} isInsideDiscord={isInsideDiscord} /> : <MockLeaderboard />}
      </div>
    </div>
  );
}

export default LeaderboardPageClient;