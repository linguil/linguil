'use client';

import type { Question, LanguageStats, Word } from '@/shared/types';
import type { CachedData } from '@/client/lib/game/offline-data-service';

type ScoreMessages = Record<number, string>;
const LOCAL_STORAGE_KEY = 'offlineGameData';

// Caches the results of expensive, pure functions.
const memoize = <T extends (...args: any[]) => any>(fn: T): T => {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
};

// Creates a deterministic, seeded random number generator.
const createSeededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
};

// Shuffles an array deterministically based on a seed.
const _deterministicShuffle = <T>(array: T[], seed: number): T[] => {
  const random = createSeededRandom(seed);
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  while (currentIndex !== 0) {
    const randomIndex = Math.floor(random() * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }
  return shuffled;
};
// Creates a memoized version of the deterministic shuffle function.
const deterministicShuffle = memoize(_deterministicShuffle);

// Gets a specified number of unique random items from an array.
const getUniqueRandomItems = <T>(
  array: T[],
  count: number,
  exclude: T[] = [],
  seed: number
): T[] => {
  const excludeSet = new Set(exclude);
  // Create a unique set of available items first.
  const availableItems = [...new Set(array.filter(item => !excludeSet.has(item)))];
  const shuffled = deterministicShuffle(availableItems, seed);
  return shuffled.slice(0, count);
};

// Serializes a Map into a JSON-compatible object.
const replacer = (key: any, value: any) => {
  if (value instanceof Map) {
    return { __type: 'Map', value: Array.from(value.entries()) };
  }
  return value;
};

// Deserializes a JSON object back into a Map.
const reviver = (key: any, value: any) => {
  if (typeof value === 'object' && value !== null && value.__type === 'Map') {
    return new Map(value.value);
  }
  return value;
};

let cachedData: CachedData | null = null;
let dataLoadingPromise: Promise<CachedData> | null = null;

// Loads, processes, and caches all data required for the offline quiz.
const loadAndProcessData = (): Promise<CachedData> => {
  if (cachedData) return Promise.resolve(cachedData);

  try {
    const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedData) {
      cachedData = JSON.parse(storedData, reviver);
      if (cachedData) return Promise.resolve(cachedData);
    }
  } catch {
    // Silently fail if localStorage is corrupt or inaccessible.
  }

  if (dataLoadingPromise) return dataLoadingPromise;

  dataLoadingPromise = (async (): Promise<CachedData> => {
    try {
      // Dynamically import the data processing module.
      const { processAndCacheData } = await import('@/client/lib/game/offline-data-service');
      const processed = await processAndCacheData();

      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(processed, replacer));
      } catch {
        // Silently fail if localStorage is full or unavailable.
      }

      cachedData = processed;
      return processed;
    } catch {
      throw new Error('Failed to start offline mode');
    }
  })();

  return dataLoadingPromise;
};

const MAX_RETRIES = 3;

// Generates a full quiz dataset for an offline game session.
export const getOfflineQuizData = async (retries = MAX_RETRIES): Promise<{ 
  questions: Question[], 
  languageStats: LanguageStats | null, 
  scoreMessages: ScoreMessages, 
  seed: number, 
  word?: Word 
}> => {
  const data = await loadAndProcessData();
  const seed = Math.floor(Math.random() * 1000000000);

  const wordCount = data.words.length; // Select a random word to base the quiz on.
  if (wordCount === 0) {
      return { questions: [], languageStats: null, scoreMessages: {}, seed };
  }
  const randomWord = data.words[Math.floor(Math.random() * wordCount)]!;

  // Gather all necessary metadata for the chosen word.
  const familyRecord = data.familiesMap.get(randomWord.language);
  const langCodeRecord = data.langCodesMap.get(randomWord.language);
  const langStatsRecord = data.langStatsMap.get(randomWord.language);
  const languageRegion = data.regionsByLanguage.get(randomWord.language);

  // Safeguard against corrupt or inconsistent CSV data.
  if (!familyRecord || !langCodeRecord) {
    if (retries > 0) {
      return getOfflineQuizData(retries - 1); // Retry generation on data inconsistency.
    } else {
      return { questions: [], languageStats: null, scoreMessages: {}, seed };
    }
  }

  const { family: correctFamily, language: correctLanguage } = familyRecord;
  const { langCode: correctLangCode } = langCodeRecord;
  const { translation: correctTranslation } = randomWord;

  const fullWord: Word = {
    family: correctFamily,
    language: correctLanguage,
    translation: correctTranslation,
    nativeScript: randomWord.nativeScript,
    transliteration: randomWord.transliteration,
    langCode: correctLangCode,
  };

  // Identify other languages that use the exact same word (transliteration and native script).
  const targetTranslit = (randomWord.transliteration || '').trim().toLowerCase();
  const targetNative = (randomWord.nativeScript || '').trim().toLowerCase();

  const conflictingFamilies = new Set<string>();
  const duplicateWordSameFamilyLangs = new Set<string>();
  const conflictingTranslations = new Set<string>([correctTranslation]);

  data.words.forEach(w => {
    const wTranslit = (w.transliteration || '').trim().toLowerCase();
    const wNative = (w.nativeScript || '').trim().toLowerCase();
    const isMatch =
      wNative === targetNative &&
      wTranslit === targetTranslit;

    if (isMatch) {
      if (w.language === correctLanguage) {
        if (w.translation) conflictingTranslations.add(w.translation);
      } else {
        const otherFamily = data.familiesMap.get(w.language)?.family;
        if (otherFamily) {
          if (otherFamily === correctFamily) {
            duplicateWordSameFamilyLangs.add(w.language);
          } else {
            conflictingFamilies.add(otherFamily);
          }
        }
      }
    }
  });

  // Generate distractor options for question 1 (language family), prioritising same region, avoiding cross-language homonyms.
  const sameRegionFamilies = languageRegion ? data.familiesByRegion.get(languageRegion) || [] : [];
  const eligibleSameRegion = sameRegionFamilies.filter(f => f !== correctFamily && !conflictingFamilies.has(f));
  const shuffledSameRegion = deterministicShuffle([...new Set(eligibleSameRegion)], seed + 1);
  const familyDistractors = shuffledSameRegion.slice(0, 3);

  if (familyDistractors.length < 3) {
    const usedFamilies = new Set([correctFamily, ...conflictingFamilies, ...familyDistractors]);
    const eligibleOther = data.allFamilies.filter(f => !usedFamilies.has(f));
    const shuffledOther = deterministicShuffle([...new Set(eligibleOther)], seed + 1.1);
    familyDistractors.push(...shuffledOther.slice(0, 3 - familyDistractors.length));
  }

  if (familyDistractors.length < 3) {
    const fallbackFamilies = data.allFamilies.filter(f => f !== correctFamily && !familyDistractors.includes(f));
    const shuffledFallback = deterministicShuffle([...new Set(fallbackFamilies)], seed + 1.2);
    familyDistractors.push(...shuffledFallback.slice(0, 3 - familyDistractors.length));
  }

  const familyOptions = [correctFamily, ...familyDistractors];
  const question1: Question = {
    type: 'family',
    prompt: 'Which language family is this word from?',
    correctAnswer: correctFamily,
    options: deterministicShuffle([...new Set(familyOptions)], seed + 2),
  };

  // Generate distractor options for question 2 (language), prioritising same family and region, avoiding cross-language homonyms in the same family.
  const usedLangs = new Set<string>([correctLanguage, ...duplicateWordSameFamilyLangs]);
  const langDistractors: string[] = [];

  // Tier 1: Same family
  const sameFamilyLangs = (data.languagesByFamilyMap.get(correctFamily) || []).filter(l => !usedLangs.has(l));
  const shuffledSameFamily = deterministicShuffle([...new Set(sameFamilyLangs)], seed + 3);
  for (const lang of shuffledSameFamily) {
    if (langDistractors.length >= 3) break;
    langDistractors.push(lang);
    usedLangs.add(lang);
  }

  // Tier 2: Same region
  if (langDistractors.length < 3) {
    const sameRegionLangs = (languageRegion ? data.languagesByRegion.get(languageRegion) || [] : []).filter(l => !usedLangs.has(l));
    const shuffledSameRegion = deterministicShuffle([...new Set(sameRegionLangs)], seed + 3.1);
    for (const lang of shuffledSameRegion) {
      if (langDistractors.length >= 3) break;
      langDistractors.push(lang);
      usedLangs.add(lang);
    }
  }

  // Tier 3: Other families
  if (langDistractors.length < 3) {
    const otherLangs = data.allLanguages.filter(l => !usedLangs.has(l));
    const shuffledOther = deterministicShuffle([...new Set(otherLangs)], seed + 3.2);
    for (const lang of shuffledOther) {
      if (langDistractors.length >= 3) break;
      langDistractors.push(lang);
      usedLangs.add(lang);
    }
  }

  if (langDistractors.length < 3) {
    const fallbackLangs = data.allLanguages.filter(l => l !== correctLanguage && !langDistractors.includes(l));
    const shuffledFallback = deterministicShuffle([...new Set(fallbackLangs)], seed + 3.3);
    for (const lang of shuffledFallback) {
      if (langDistractors.length >= 3) break;
      langDistractors.push(lang);
    }
  }

  const languageOptions = [correctLanguage, ...langDistractors];
  const question2: Question = {
    type: 'language',
    prompt: `Which ${correctFamily} language is this word from?`,
    correctAnswer: correctLanguage,
    options: deterministicShuffle([...new Set(languageOptions)], seed + 5),
  };

  // Generate distractor options for question 3 (English translation), avoiding homonyms.
  const eligibleTranslations = data.allTranslations.filter(t => !conflictingTranslations.has(t));
  const translationDistractors = getUniqueRandomItems(eligibleTranslations, 3, [], seed + 6);
  if (translationDistractors.length < 3) {
    const fallbackTranslations = data.allTranslations.filter(t => t !== correctTranslation && !translationDistractors.includes(t));
    const extraTranslations = getUniqueRandomItems(fallbackTranslations, 3 - translationDistractors.length, [], seed + 6.1);
    translationDistractors.push(...extraTranslations);
  }
  const translationOptions = [correctTranslation, ...translationDistractors];
  const question3: Question = {
    type: 'translation',
    prompt: 'What is the English translation of this word?',
    correctAnswer: correctTranslation,
    options: deterministicShuffle([...new Set(translationOptions)], seed + 7),
  };

  // Validate that there are enough options for each question.
  if (
    [...new Set(familyOptions)].length < 2 ||
    [...new Set(languageOptions)].length < 2 ||
    [...new Set(translationOptions)].length < 2
  ) {
    if (retries > 0) {
      return getOfflineQuizData(retries - 1);
    }
  }

  // Compile the final language statistics object.
  const languageStats = langStatsRecord ? { 
    family: correctFamily,
    language: langStatsRecord.language,
    totalSpeakers: langStatsRecord.totalSpeakers,
    countryWithMostSpeakers: langStatsRecord.highestNumberSpeakers,
    speakersInCountry: langStatsRecord.countrySpeakers,
  } : null;

  return { questions: [question1, question2, question3], languageStats, scoreMessages: data.scoreMessages, seed, word: fullWord };
};