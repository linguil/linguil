'use client';

import { memo, useRef, useEffect } from 'react';
import { Button } from '@/client/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/client/lib/utils';
import type { Word } from '@/shared/types';

// Props for WordDisplay.
type WordDisplayProps = {
  // The word object to display; null renders a placeholder.
  word: Word | null;
  // True if the game is in offline mode (disables audio).
  isOfflineGame: boolean;
  // True if the word's audio is ready to play.
  isAudioReady: boolean;
  // Callback to play the word's audio.
  onPlayAudio: () => void;
};

// Displays the word, its transliteration, and a pronunciation button.
const WordDisplay = memo<WordDisplayProps>(({ word, isOfflineGame, isAudioReady, onPlayAudio }) => {

  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Shrinks text if it overflows the container.
  const adjustFontSize = () => {
    const container = containerRef.current;
    const text = textRef.current;
    const button = buttonRef.current;

    // Ensures all elements are rendered before calculating.
    if (!container || !text || !button) return;

    // Resets text size to measure its natural size.
    text.style.fontSize = '';
    const initialFontSize = parseFloat(getComputedStyle(text).fontSize);

    // Calculates the space taken by the button to prevent overlap.
    const buttonWidth = button.offsetWidth;
    const safeGap = 16; // 1rem gap.

    // Reserve space on both sides to keep the text centered.
    const reservedSpace = (buttonWidth + 8 + safeGap) * 2;
    const availableWidth = container.clientWidth - reservedSpace;
    const textWidth = text.scrollWidth;

    // Shrink text on overflow.
    if (textWidth > availableWidth) {
      const newSize = (initialFontSize * availableWidth) / textWidth;
      text.style.fontSize = `${newSize}px`;
    }
  };

  // Adjust font on render, word changes, and window resize.
  useEffect(() => {
    // A small timeout ensures the DOM is fully updated before we measure.
    const timer = setTimeout(() => adjustFontSize(), 0);
    return () => clearTimeout(timer);
  }, [word]);

  useEffect(() => {
    window.addEventListener('resize', adjustFontSize);
    return () => window.removeEventListener('resize', adjustFontSize);
  }, []);

  // Placeholder to prevent layout shift if the word isn't available.
  if (!word) {
    return <div className="h-[84px] w-full"></div>;
  }

  // Selects the audio icon based on game mode and audio readiness.
  const AudioIcon = isOfflineGame
    ? <VolumeX className="h-6 w-6 text-muted-foreground" /> // Muted icon for offline mode.
    : <Volume2 className={cn("h-6 w-6", isAudioReady ? "text-primary-foreground" : "text-muted-foreground")} />; // Regular or muted icon.

  return (
    <div ref={containerRef} className="relative bg-muted p-4 rounded-lg mb-4 flex items-center justify-center">
      {/* Displays the word in transliteration and native script. */}
      <div
        ref={textRef}
        className="grid grid-cols-[1fr_auto_1fr] items-center justify-center gap-4 w-full font-code text-3xl font-semibold text-primary-foreground tracking-wider whitespace-nowrap"
      >
        <span className="text-right">{word.transliteration}</span>
        <span className="text-center text-muted-foreground">|</span>
        <span className="text-left">{word.nativeScript}</span>
      </div>
      {/* Button to play the word's audio. */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={onPlayAudio}
        disabled={isOfflineGame || !isAudioReady}
        className="absolute right-2"
        aria-label="Play word audio"
      >
        {AudioIcon}
      </Button>
    </div>
  );
});

WordDisplay.displayName = 'WordDisplay';

export { WordDisplay };