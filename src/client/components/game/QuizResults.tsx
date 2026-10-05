'use client';

import type { LanguageStats, Word } from '@/shared/types/index';
import { Button } from '@/client/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/client/components/ui/card';
import { useState, useEffect, useRef, memo, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/client/hooks/use-auth';
import { Share2, Lock, Unlock } from 'lucide-react';
import { generateShareText } from '@/client/lib/utils';
import { useToast } from '@/client/hooks/use-toast';
import { PaymentDialog } from '@/client/components/payments/PaymentDialog';

// Displays the word's language statistics.
const LanguageStatsDisplay = memo(({ languageStats, word }: { languageStats: LanguageStats | null, word: Word }) => {
  if (!languageStats) return null;
  return (
    <div className="flex flex-wrap md:flex-nowrap justify-center items-stretch gap-2 md:gap-4">
      <div className="text-center bg-muted p-2 rounded-lg text-[10px] text-muted-foreground flex-1 flex flex-col justify-center order-1 md:order-1">
        <p><b>{word.language}</b> is spoken by <b>{languageStats.totalSpeakers}</b> people</p>
      </div>
      <CardTitle className="font-headline text-lg text-muted-foreground dark:text-foreground italic shrink-0 px-4 flex items-center justify-center order-3 md:order-2 w-full md:w-auto">
        ({word.family}, {word.language})
      </CardTitle>
      <div className="text-center bg-muted p-2 rounded-lg text-[10px] text-muted-foreground flex-1 flex flex-col justify-center order-2 md:order-3">
        <p><b>{languageStats.countryWithMostSpeakers}</b> has the largest number of speakers at <b>{languageStats.speakersInCountry}</b></p>
      </div>
    </div>
  );
});
LanguageStatsDisplay.displayName = 'LanguageStatsDisplay';

// Displays the final score and a corresponding ASCII art message.
const ScoreDisplay = memo(({ score, totalQuestions }: { score: number, totalQuestions: number }) => {
  // ASCII messages for different scores.
  const scoreMessages: { [key: number]: string } = {
    0: "ʕノ•ᴥ•ʔノ ︵ ┻━┻",
    1: "◝ʕ •ᴥ• ʔ◜",
    2: "ʕ ᵔᴥᵔ ʔ",
    3: "ʕ　ᵔᴥᵔʔ人ʕᵔᴥᵔ　ʔ",
  };
  const message = scoreMessages[score] || "";

  const containerRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  // Adjusts message font size to fit its container.
  const adjustFontSize = () => {
    const container = containerRef.current;
    const messageEl = messageRef.current;

    if (container && messageEl) {
      messageEl.style.fontSize = ''; // Reset font size before calculating.
      const containerWidth = container.clientWidth;
      const messageWidth = messageEl.scrollWidth;

      // If message overflows, reduce font size.
      if (messageWidth > containerWidth) {
        const initialFontSize = parseFloat(getComputedStyle(messageEl).fontSize);
        const newSize = initialFontSize * (containerWidth / messageWidth);
        messageEl.style.fontSize = `${newSize}px`;
      }
    }
  };

  // Adjust font size before browser paint.
  useLayoutEffect(() => {
    adjustFontSize();
  }, [message]);

  // Re-adjust font on window resize.
  useEffect(() => {
    window.addEventListener('resize', adjustFontSize);
    return () => {
      window.removeEventListener('resize', adjustFontSize);
    };
  }, []);

  return (
    <div className="shrink-0 w-full" ref={containerRef}>
      <p className="font-headline text-3xl font-bold mb-2 dark:text-white">
        You scored {score}/{totalQuestions}
      </p>
      <p ref={messageRef} className="text-4xl mb-2 dark:text-white whitespace-nowrap" aria-hidden="true">
        {message}
      </p>
      <p className="text-muted-foreground dark:text-foreground mb-2">Thanks for playing!</p>
    </div>
  );
});
ScoreDisplay.displayName = 'ScoreDisplay';

// Countdown timer for the next daily word.
const CountdownTimer = memo(() => {
  // Formatted time-left string.
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    // Calculate time until next midnight UTC.
    const calculateTimeLeft = () => {
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const difference = midnight.getTime() - now.getTime();
      if (difference > 0) {
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } else {
        return 'New word available!';
      }
    };
    // Set initial time left.
    setTimeLeft(calculateTimeLeft());
    // Update timer every second.
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    // Cleanup interval on unmount.
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mb-2">
      <p className="text-sm text-muted-foreground dark:text-foreground">New word in:</p>
      <p className="font-mono text-lg font-semibold">{timeLeft}</p>
    </div>
  );
});
CountdownTimer.displayName = 'CountdownTimer';

// Button to start a new game or prompt payment/sign-in.
const CallToActionButton = memo(({ hasPaid, startOfflineGame, signInWithReddit, user, onPurchaseSuccess }: { hasPaid: boolean, startOfflineGame: () => void, signInWithReddit: () => void, user: any, onPurchaseSuccess: () => Promise<void> }) => {
  // Controls payment dialog visibility.
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Handles "Unlock" button click.
  const handleUnlockClick = () => {
    if (user) {
      // If signed in, show payment dialog.
      setShowPaymentDialog(true);
    } else {
      // If not signed in, show auth dialog.
      signInWithReddit();
    }
  };

  return (
    <>
      {hasPaid ? (
        // If paid, show "Play again" button.
        <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={startOfflineGame}>
          Play again
        </Button>
      ) : (
        // If not paid, show "Unlock" button.
        <Button
          className="group bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleUnlockClick}
        >
          <Lock className="mr-2 h-5 w-5 group-hover:hidden" />
          <Unlock className="mr-2 h-5 w-5 hidden group-hover:block" />
          Unlock unlimited games
        </Button>
      )}
      <PaymentDialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog} onPurchaseSuccess={onPurchaseSuccess} />
    </>
  );
});
CallToActionButton.displayName = 'CallToActionButton';

// Props for QuizResults.
type QuizResultsProps = {
  // User's final score.
  score: number;
  // Total number of questions.
  totalQuestions: number;
  // Question results.
  questionResults?: boolean[];
  // The word object for the quiz.
  word: Word;
  // Language statistics.
  languageStats: LanguageStats | null;
  // Starts a new offline game.
  startOfflineGame: () => void;
  // Word display component.
  wordDisplay: ReactNode;
  // Game mode toggle component.
  gameModeToggleSwitch: ReactNode;
  // Dark mode toggle component.
  darkModeToggleSwitch: ReactNode;
  // Is the game in offline mode.
  isOfflineGame: boolean;
};

// Displays quiz results, stats, and CTAs.
const QuizResults = ({
  score,
  totalQuestions,
  questionResults,
  word,
  languageStats,
  startOfflineGame,
  wordDisplay,
  gameModeToggleSwitch,
  darkModeToggleSwitch,
  isOfflineGame,
}: QuizResultsProps) => {
  // Auth hook for user and payment status.
  const { user, hasPaid, signInWithReddit, fetchUserProfile } = useAuth();
  const { toast } = useToast();
  const resultsRef = useRef<HTMLDivElement>(null);

  const [showShareBox, setShowShareBox] = useState(false);

  useEffect(() => {
    resultsRef.current?.focus();
  }, []);

  const shareText = questionResults ? generateShareText(score, totalQuestions, word, questionResults) : '';

  // Share button logic.
  const handleShare = async () => {
    if (!questionResults) return;

    // Toggle off if it's already open.
    if (showShareBox) {
      setShowShareBox(false);
      return;
    }

    setShowShareBox(true);

    if (navigator.share) {
      try {
        await navigator.share({ title: 'linguil score', text: shareText });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    // Try modern clipboard API.
    try {
      await navigator.clipboard.writeText(shareText);
      toast({ title: "Score copied!", description: "Results copied to clipboard." });
    } catch (_err) {
      // Open share box if clipboard is blocked (e.g., inside Reddit iframe).
      setShowShareBox(true);
    }
  };

  return (
    <Card ref={resultsRef} tabIndex={-1} className="shadow-lg animate-fade-in-up w-full outline-none">
      <CardHeader className="text-center pb-0.5">
        <LanguageStatsDisplay languageStats={languageStats} word={word} />
      </CardHeader>

      <CardContent className="text-center pt-2 relative">
        {wordDisplay}
        <div className="relative flex justify-center items-center mb-2">
          {/* Dark mode toggle slot. */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            {darkModeToggleSwitch}
          </div>
          <p className="text-lg font-semibold text-muted-foreground dark:text-foreground">
            – {word.translation} –
          </p>
          {/* Game mode toggle slot. */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            {gameModeToggleSwitch}
          </div>
        </div>

        <div className="flex justify-center items-center gap-4 w-full">
          <div className="w-full">
            <ScoreDisplay score={score} totalQuestions={totalQuestions} />
            <CountdownTimer />
          </div>
        </div>

        <div className="flex justify-center items-center gap-2">
          <CallToActionButton
            hasPaid={hasPaid}
            startOfflineGame={startOfflineGame}
            signInWithReddit={signInWithReddit}
            user={user}
            onPurchaseSuccess={fetchUserProfile}
          />

          {!isOfflineGame && (
            <>
              {/* Fallback share box */}
              {showShareBox && (
                <div className="absolute bottom-[4.5rem] right-6 z-50 bg-card text-center animate-in slide-in-from-bottom-2 fade-in duration-200">
                  <textarea
                    readOnly
                    value={shareText}
                    rows={5}
                    className="w-fit h-fit bg-card p-1 font-sans text-xs text-center dark:text-white rounded-md resize-none ring-1 ring-primary"
                    // Auto-select all text when the user clicks inside the box.
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              )}

              {/* Share button */}
              <Button
                size="icon"
                className="absolute bottom-6 right-6 rounded-full shadow-sm hover:bg-primary transition-all"
                onClick={handleShare}
                aria-label="Share score"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export { QuizResults };