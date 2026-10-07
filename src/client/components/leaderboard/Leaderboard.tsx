'use client';

import { memo, useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent } from '@/client/components/ui/card';
import type { PlayerStats } from '@/shared/types';
import { MOCK_SUCCESS_RATE_DATA, MOCK_COMPARISON_DATA, MAX_MOCK_COMPARISON_VALUE, CHART_COLORS } from '@/client/components/leaderboard/mock-data';
import { LeaderboardHeader } from '@/client/components/leaderboard/LeaderboardHeader';
import { PlayerLegend } from '@/client/components/leaderboard/PlayerLegend';
import { LoadingSpinner } from '@/client/components/common/LoadingSpinner';

// Dynamically import `ScoreRadialChart` with a loading fallback.
const ScoreRadialChart = lazy(() => import('@/client/components/leaderboard/ScoreRadialChart').then(mod => ({ default: mod.ScoreRadialChart })));

// Dynamically import `ScoreBarChart` with a loading fallback.
const ScoreBarChart = lazy(() => import('@/client/components/leaderboard/ScoreBarChart').then(mod => ({ default: mod.ScoreBarChart })));

// Props for Leaderboard.
type LeaderboardProps = {
  // Player statistics to display.
  players?: PlayerStats[];
  // Selected color for the current user's chart.
  chartColor?: string;
  // Callback on chart color change.
  onChartColorChange?: (color: string) => void;
  // Callback to remove a friend.
  onRemoveFriend?: (uid: string, name: string) => void;
  // Callback to update the user's name.
  onUpdateName?: (newName: string) => Promise<void>;
  // Current user's UID.
  currentUserId?: string;
}

// Main leaderboard component with charts and player stats.
const Leaderboard = memo<LeaderboardProps>(({ 
  players,
  chartColor,
  onChartColorChange,
  onRemoveFriend,
  onUpdateName,
  currentUserId,
}) => {
  // Tracks if the component has mounted.
  const [isClient, setIsClient] = useState(false);

  // Set isClient to true on mount.
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Memoized flag to show mock data.
  const showMockData = useMemo(() => {
    return !currentUserId && (!players || players.length === 0);
  }, [currentUserId, players]);

  // Memoized chart colors, with user's selection first.
  const dynamicChartColors = useMemo(() => {
    return chartColor ? [chartColor, ...CHART_COLORS.filter(c => c !== chartColor)] : CHART_COLORS;
  }, [chartColor]);

  // Memoized data for the success rate radial chart.
  const successRateData = useMemo(() => {
    return showMockData
      ? MOCK_SUCCESS_RATE_DATA
      : (players || []).map((player, index) => ({
          uid: player.uid,
          name: (player.displayName || 'Anonymous').split(' ')[0], // Use first name.
          'Success Rate': player.scores && player.scores.totalAnswered > 0
            ? Math.round((player.scores.totalCorrect / player.scores.totalAnswered) * 100)
            : 0,
          fill: `${dynamicChartColors[index % dynamicChartColors.length]}`, // Assign color.
        }));
  }, [showMockData, players, dynamicChartColors]);

  // Memoized map of player UIDs to chart colors.
  const playerColorMap = useMemo(() => 
    new Map(successRateData.map(p => [p.uid, p.fill]))
  , [successRateData]);

  // Memoized data for the comparison bar chart.
  const comparisonData = useMemo(() => {
    return showMockData
      ? MOCK_COMPARISON_DATA
      : (players || []).map((player) => ({
          uid: player.uid,
          name: (player.displayName || 'Anonymous').split(' ')[0],
          correct: player.scores ? player.scores.totalCorrect : 0,
          perfect: player.scores ? player.scores.perfectScores : 0,
        }));
  }, [showMockData, players]);

  // Memoized max value for the comparison bar chart.
  const maxComparisonValue = useMemo(() => {
    return showMockData
      ? MAX_MOCK_COMPARISON_VALUE
      : Math.max(1, ...comparisonData.flatMap(d => [d.correct, d.perfect])); // Ensure max is at least 1.
  }, [showMockData, comparisonData]);

  // Find the current user's player object.
  const currentUserPlayer = players?.find(p => p.uid === currentUserId);

  return (
    <Card className="w-full shadow-lg">
      <LeaderboardHeader 
        chartColor={chartColor}
        onChartColorChange={onChartColorChange}
      />

      <CardContent className="p-0 pt-2 relative">
        <Suspense fallback={<div className="relative w-full aspect-square max-h-[400px] min-h-[300px] flex items-center justify-center"><LoadingSpinner /></div>}>
          <ScoreRadialChart 
            isClient={isClient}
            data={successRateData} 
            showMockData={showMockData}
            players={players}
          />
        </Suspense>
      </CardContent>

      <CardContent className="pt-4 mt-4">
        <PlayerLegend 
          data={successRateData}
          currentUserId={currentUserId}
          currentUserDisplayName={currentUserPlayer?.displayName}
          onRemoveFriend={onRemoveFriend}
          onUpdateName={onUpdateName}
        />
      </CardContent>

      <CardContent>
        <Suspense fallback={<div className="h-[90px] flex items-center justify-center"><LoadingSpinner /></div>}>
          <ScoreBarChart 
            data={comparisonData}
            colorMap={playerColorMap}
            maxValue={maxComparisonValue}
            showMockData={showMockData}
          />
        </Suspense>
      </CardContent>
    </Card>
  );
});

Leaderboard.displayName = 'Leaderboard';

export { Leaderboard };