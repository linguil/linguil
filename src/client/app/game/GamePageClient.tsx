'use client';

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { LoadingSpinner } from '@/client/components/common/LoadingSpinner';
import { useGame } from '@/client/hooks/use-game';
import { Switch } from '@/client/components/ui/switch';
import { Plus } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import type { RawDailyData } from '@/shared/types';
import { WordDisplay } from '@/client/components/game/WordDisplay';

// Dynamically import components to reduce initial bundle size and show loading indicators.
const AuthButton = lazy(() => import('@/client/components/auth/AuthButton').then(mod => ({ default: mod.AuthButton })));
const DarkModeToggleSwitch = lazy(() => import('@/client/components/common/DarkModeToggleSwitch').then(mod => ({ default: mod.DarkModeToggleSwitch })));
const Quiz = lazy(() => import('@/client/components/game/Quiz').then(mod => ({ default: mod.Quiz })));
const QuizResults = lazy(() => import('@/client/components/game/QuizResults').then(mod => ({ default: mod.QuizResults })));

// This component handles fetching the initial game data on the client.
const GamePageClient = () => {
  // State for storing the initial word data fetched from the API.
  const [initialDailyWord, setInitialDailyWord] = useState<RawDailyData | null>(null);
  // State to track if the data is currently being fetched.
  const [isFetching, setIsFetching] = useState(true);
  // State to store any errors that occur during fetching.
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch the daily word data when the component mounts.
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/daily-word');
        if (!response.ok) {
          throw new Error('Failed to fetch daily word data');
        }
        const data = await response.json();
        setInitialDailyWord(data);
      } catch {
        setFetchError('Failed to load game data');
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, []);

  // Show a loading spinner while fetching the initial data.
  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[550px]">
        <LoadingSpinner />
      </div>
    );
  }

  // Display an error message if data fetching fails.
  if (fetchError) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center">
        <p>{fetchError}</p>
        <div className="flex justify-between w-full px-1">
          <DarkModeToggleSwitch variant="gamepage" />
        </div>
      </div>
    );
  }

  // Render the main game flow once the initial data is successfully fetched.
  return <GameFlow initialDailyWord={initialDailyWord} />;
};

// This component manages the core game logic and UI flow.
const GameFlow = ({ initialDailyWord }: { initialDailyWord: RawDailyData | null }) => {
  // Use the custom game hook to manage game state and actions.
  const {
    loading,
    data,
    dailyScore,
    quizFinished,
    isOfflineGame,
    handleModeToggle,
    startNewOfflineGame,
    hasPaid,
    isAudioReady,
    handlePlayAudio,
    handleQuizFinish,
  } = useGame(initialDailyWord);

  // Define the game mode toggle switch, only visible to paid users.
  const gameModeToggleSwitch = hasPaid ? (
    <div className="flex items-center space-x-1.5">
      <Switch
        id="game-mode"
        name="game-mode"
        checked={isOfflineGame}
        onCheckedChange={handleModeToggle}
        className="data-[state=unchecked]:bg-muted"
        aria-label="Toggle linguil+"
      >
        <Plus className={cn("h-4 w-4", isOfflineGame ? "text-primary" : "text-muted-foreground dark:text-muted")} />
      </Switch>
    </div>
  ) : (
    // Render a hidden placeholder for consistent layout for non-paid users.
    <div className="flex items-center space-x-1.5" style={{ visibility: 'hidden' }} aria-hidden="true">
      <Switch id="game-mode-placeholder" />
    </div>
  );

  // Show a loading spinner while the game data is being processed by the useGame hook.
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[550px]">
        <LoadingSpinner />
      </div>
    );
  }

  // Show an error message if the game data fails to load.
  if (!data) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center">
        <p>Failed to load game</p>
        <div className="flex justify-between w-full px-1">
          <DarkModeToggleSwitch variant="gamepage" />
          {gameModeToggleSwitch}
        </div>
      </div>
    );
  }

  // Define the word display component.
  const wordDisplay = <WordDisplay word={data.word} isOfflineGame={isOfflineGame} isAudioReady={isAudioReady} onPlayAudio={handlePlayAudio} />;
  // Define the dark mode toggle switch.
  const darkModeToggleSwitch = <DarkModeToggleSwitch variant="gamepage" />;

  // Conditionally render the quiz results or the quiz itself based on whether the quiz is finished.
  const content = (quizFinished && dailyScore) ? (
    <Suspense fallback={<div className="flex flex-col items-center justify-center min-h-[550px]"><LoadingSpinner /></div>}>
      <QuizResults
        score={dailyScore.score}
        totalQuestions={dailyScore.totalQuestions}
        questionResults={dailyScore.questionResults}
        date={data.date}
        word={data.word}
        languageStats={data.languageStats}
        startOfflineGame={startNewOfflineGame}
        wordDisplay={wordDisplay}
        gameModeToggleSwitch={gameModeToggleSwitch}
        darkModeToggleSwitch={darkModeToggleSwitch}
        isOfflineGame={isOfflineGame}
      />
    </Suspense>
  ) : (
    <Suspense fallback={<div className="flex flex-col items-center justify-center min-h-[550px]"><LoadingSpinner /></div>}>
      <Quiz
        key={data.date}
        quizId={data.date}
        initialQuestions={data.questions}
        onFinish={handleQuizFinish}
        wordDisplay={wordDisplay}
        gameModeToggleSwitch={gameModeToggleSwitch}
        darkModeToggleSwitch={darkModeToggleSwitch}
      />
    </Suspense>
  );

  // Render the main game layout.
  return (
    <div className="flex flex-col gap-4 px-4 pt-2 md:pt-4 pb-24 h-full">
      <div className="relative z-20 flex justify-end">
        <AuthButton />
      </div>
      <div className="overflow-x-hidden grow min-h-0">
        {content}
      </div>
    </div>
  );
};

export default GamePageClient;