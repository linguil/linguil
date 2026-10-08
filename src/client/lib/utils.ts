import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// A utility function to merge Tailwind CSS classes conditionally.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shuffles an array using the Fisher-Yates algorithm, returning a new shuffled array.
export const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array]; // Create a shallow copy to avoid modifying the original array.
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]]; // Swap elements.
  }
  return newArray;
};

// Proxies external image URLs through our backend for Devvit compatibility.
export function getProxiedImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url) {
    return url;
  }

  // Do not proxy data URIs or relative paths (local assets or already proxied).
  if (url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }

  // In Devvit, all external URLs must be proxied.
  return `/api/user/image?url=${encodeURIComponent(url)}`;
}

// Generates the daily score share text.
export function generateShareText(
  score: number,
  totalQuestions: number,
  word: { transliteration: string; nativeScript: string },
  results: boolean[],
  challengeDate?: string
) {
  let date: string;
  if (challengeDate && /^\d{4}-\d{2}-\d{2}$/.test(challengeDate)) {
    const [yyyy, mm, dd] = challengeDate.split('-');
    date = `${dd}/${mm}/${yyyy.slice(2)}`;
  } else {
    const now = new Date();
    const day = String(now.getUTCDate()).padStart(2, '0');
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const year = String(now.getUTCFullYear()).slice(2);
    date = `${day}/${month}/${year}`;
  }

  const isPerfect = score === totalQuestions;
  const medal = isPerfect ? ' 🏅' : '';
  
  // Maps results to 1: 🟩 2: 🟥 style string.
  const squares = results
    .map((isCorrect, i) => `${i + 1}: ${isCorrect ? '🟩' : '🟥'}`)
    .join(' ');

  const bearEmojis: Record<number, string> = {
    0: "ʕノ•ᴥ•ʔノ ︵ ┻━┻",
    1: "◝ʕ •ᴥ• ʔ◜",
    2: "ʕ ᵔᴥᵔ ʔ",
    3: "ʕ　ᵔᴥᵔʔ人ʕᵔᴥᵔ　ʔ",
  };
  const bear = bearEmojis[score] || bearEmojis[0];

  return `linguil | ${date}\n${word.transliteration} | ${word.nativeScript}${medal}\n${squares}\n${score}/${totalQuestions} | ${bear}\nhttps://linguil.app`;
}