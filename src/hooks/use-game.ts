'use client';

import { useEffect, useCallback, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import type { ProcessedDailyData, RawDailyData, DailyScore } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getDailyWordDataClient } from '@/lib/game/data-service-client';
import { getOfflineQuizData } from '@/lib/game/data-service-offline';
import { generateQuestions } from '@/lib/game/quiz-questions';
import Cookies from 'js-cookie';

// Keys for session storage.
const GAME_MODE_KEY = 'linguil-game-mode';
const OFFLINE_GAME_DATA_KEY = 'linguil-offline-game-data';
const PENDING_SCORE_KEY = 'linguil-pending-score';

// Defines the structure of the game's state.
interface GameState {
  loading: boolean;
  isOffline: boolean;
  quizFinished: boolean;
  data: ProcessedDailyData | null;
  dailyScore: DailyScore | null;
  audio: {
    player: HTMLAudioElement | null;
    isReady: boolean;
    voices: SpeechSynthesisVoice[];
  };
}

// Defines the possible actions for the game reducer.
type GameAction =
  | { type: 'START_LOADING' }
  | { type: 'SET_ONLINE_MODE'; payload: { data: ProcessedDailyData, score: DailyScore | null } }
  | { type: 'SET_OFFLINE_MODE'; payload: ProcessedDailyData }
  | { type: 'FINISH_QUIZ'; payload: DailyScore }
  | { type: 'SET_AUDIO_PLAYER'; payload: HTMLAudioElement | null }
  | { type: 'SET_AUDIO_READY'; payload: boolean }
  | { type: 'SET_VOICES'; payload: SpeechSynthesisVoice[] }
  | { type: 'DATA_LOAD_ERROR' }
  | { type: 'RESET_GAME' };

// Initial state for the game reducer.
const initialState: GameState = {
  loading: true,
  isOffline: false,
  quizFinished: false,
  data: null,
  dailyScore: null,
  audio: {
    player: null,
    isReady: false,
    voices: [],
  },
};

// Manages game state based on dispatched actions.
const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'START_LOADING':
      return { ...state, loading: true };
    case 'SET_ONLINE_MODE':
      return {
        ...state,
        loading: false,
        isOffline: false,
        data: action.payload.data,
        dailyScore: action.payload.score,
        quizFinished: !!action.payload.score,
      };
    case 'SET_OFFLINE_MODE':
      return {
        ...state,
        loading: false,
        isOffline: true,
        data: action.payload,
        dailyScore: null,
        quizFinished: false,
      };
    case 'FINISH_QUIZ':
      return { ...state, quizFinished: true, dailyScore: action.payload };
    case 'SET_AUDIO_PLAYER':
      return { ...state, audio: { ...state.audio, player: action.payload } };
    case 'SET_AUDIO_READY':
      return { ...state, audio: { ...state.audio, isReady: action.payload } };
    case 'SET_VOICES':
      return { ...state, audio: { ...state.audio, voices: action.payload } };
    case 'DATA_LOAD_ERROR':
      return { ...state, loading: false };
    case 'RESET_GAME':
      return initialState;
    default:
      return state;
  }
};

// Custom hook to manage game logic and state.
export const useGame = (initialDailyWord: RawDailyData | null = null) => {
  const router = useRouter();
  const { toast } = useToast();
  const { user, discordClientUser, loading: authLoading, hasPaid, isInsideDiscord, addSignOutCleanup, removeSignOutCleanup } = useAuth();
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Shows an error toast.
  const showErrorToast = useCallback((title: string, description: string) => {
    toast({ title, description, variant: 'destructive' });
  }, [toast]);

  // Helper to reliably get the token even if cookies are blocked by the iframe.
  const getAuthToken = useCallback(() => {
    // Try cookie first.
    const cookieToken = Cookies.get('firebaseIdToken');
    if (cookieToken) return cookieToken;

    // Fallback to Discord session storage cache.
    const cache = sessionStorage.getItem('discord_auth_cache');
    if (cache) {
      try {
        return JSON.parse(cache).idToken;
      } catch (_e) {
        console.error("Failed to parse discord auth cache");
      }
    }
    return null;
  }, []);

  // Retrieves a pending score from session storage.
  const getPendingScore = useCallback((): (DailyScore & { wordIdentifier: string }) | null => {
    if (isInsideDiscord) return null;
    const pendingScoreJSON = sessionStorage.getItem(PENDING_SCORE_KEY);
    if (!pendingScoreJSON) return null;
    try {
      return JSON.parse(pendingScoreJSON);
    } catch {
      sessionStorage.removeItem(PENDING_SCORE_KEY);
      return null;
    }
  }, [isInsideDiscord]);

  // Fetches the user's score for a specific day.
  const getUserDailyScore = useCallback(async (wordIdentifier: string) => {
    const activeUser = user || discordClientUser;
    if (!activeUser) return null;

    if (isInsideDiscord) {
      // Backend fetch for Discord users.
      try {
        const token = getAuthToken();
        const response = await fetch(`/api/game/score?wordIdentifier=${wordIdentifier}${token ? `&token=${token}` : ''}`, {
          headers: {
            ...(token ? { 'x-auth-token': token } : {})
          }
        });
        if (response.ok) {
          const data = await response.json();
          return data;
        }
      } catch (error) {
        console.error("Failed to fetch daily score from backend", error);
      }
      return null;
    }

    // Standard Firebase Client fetch for browser users.
    const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = await getFirebaseFirestore();
    const dailyScoresRef = collection(db, 'users', activeUser.uid, 'dailyScores');
    const q = query(dailyScoresRef, where('wordIdentifier', '==', wordIdentifier));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0].data();
      return { score: doc.score, totalQuestions: doc.totalQuestions, questionResults: doc.questionResults };
    }
    return null;
  }, [user, discordClientUser, isInsideDiscord, getAuthToken]);

  // Loads data for the daily online game.
  const loadDailyData = useCallback(async () => {
    dispatch({ type: 'START_LOADING' });

    try {
      const dailyWordData = initialDailyWord || await getDailyWordDataClient(isInsideDiscord);
      if (!dailyWordData) throw new Error("Daily word data is unavailable");

      const { word, audioUrl, distractors, languageStats, date } = dailyWordData;
      const questions = generateQuestions(word, distractors);
      const processedData = { date, languageStats, questions, word, audioUrl };

      let finalScore: DailyScore | null = null;
      const activeUser = user || discordClientUser;

      if (activeUser) {
        const pendingScore = getPendingScore();
        if (pendingScore?.wordIdentifier === date) {
          const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
          const { saveUserScore: saveUserScoreToDb } = await import('@/lib/firebase/firestore');
          const db = await getFirebaseFirestore();
          await saveUserScoreToDb(db, { uid: activeUser.uid } as any, pendingScore.score, pendingScore.totalQuestions, date, pendingScore.questionResults);
          finalScore = { score: pendingScore.score, totalQuestions: pendingScore.totalQuestions, questionResults: pendingScore.questionResults };
          sessionStorage.removeItem(PENDING_SCORE_KEY);
        } else {
          finalScore = await getUserDailyScore(date);
        }
      }

      dispatch({ type: 'SET_ONLINE_MODE', payload: { data: processedData, score: finalScore } });
    } catch {
      showErrorToast("Error loading game", "Failed to load game data");
      dispatch({ type: 'DATA_LOAD_ERROR' });
    }
  }, [initialDailyWord, getUserDailyScore, user, discordClientUser, showErrorToast, isInsideDiscord, getPendingScore]);

  // Loads data for an offline game.
  const loadOfflineGame = useCallback(async (isNew: boolean = false) => {
    dispatch({ type: 'START_LOADING' });
    try {
      let dataToLoad: ProcessedDailyData | null = null;

      if (!isNew) {
        const savedData = sessionStorage.getItem(OFFLINE_GAME_DATA_KEY);
        if (savedData) {
          try {
            dataToLoad = JSON.parse(savedData);
          } catch {
            sessionStorage.removeItem(OFFLINE_GAME_DATA_KEY);
          }
        }
      }

      if (!dataToLoad) {
        const offlineData = await getOfflineQuizData();
        if (offlineData && offlineData.word && offlineData.languageStats) {
          const { questions, languageStats, word } = offlineData;
          dataToLoad = { questions, languageStats, word, audioUrl: null, date: new Date().toISOString() };
          sessionStorage.setItem(OFFLINE_GAME_DATA_KEY, JSON.stringify(dataToLoad));
        } else if (offlineData) {
          showErrorToast("Error loading game", "Failed to load game data");
          dispatch({ type: 'DATA_LOAD_ERROR' });
          return;
        }
      }

      if (dataToLoad) {
        dispatch({ type: 'SET_OFFLINE_MODE', payload: dataToLoad });
      } else {
        showErrorToast("Error loading game", "Failed to load game data");
        dispatch({ type: 'DATA_LOAD_ERROR' });
      }
    } catch {
      showErrorToast("Error loading game", "Failed to load game data");
      dispatch({ type: 'DATA_LOAD_ERROR' });
    }
  }, [showErrorToast]);

  // Determines which game mode to load.
  useEffect(() => {
    if (authLoading) return;
    const savedMode = sessionStorage.getItem(GAME_MODE_KEY);
    if (savedMode === 'offline' && hasPaid) {
      loadOfflineGame();
    } else {
      loadDailyData();
    }
  }, [authLoading, hasPaid, loadDailyData, loadOfflineGame]);

  // Registers a cleanup function on sign-out.
  useEffect(() => {
    const reset = () => {
      sessionStorage.removeItem(GAME_MODE_KEY);
      sessionStorage.removeItem(OFFLINE_GAME_DATA_KEY);
      sessionStorage.removeItem(PENDING_SCORE_KEY);
      dispatch({ type: 'RESET_GAME' });
    };
    addSignOutCleanup(reset);
    return () => removeSignOutCleanup(reset);
  }, [addSignOutCleanup, removeSignOutCleanup]);

  // Schedules a page refresh at midnight for the daily game.
  useEffect(() => {
    if (state.isOffline || !state.data?.date) return;
    const midnight = new Date(state.data.date);
    midnight.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - Date.now();
    if (msUntilMidnight <= 0) return;
    const timer = setTimeout(() => router.refresh(), msUntilMidnight);
    return () => clearTimeout(timer);
  }, [state.data?.date, state.isOffline, router]);

  // Sets up the audio player or speech synthesis.
  useEffect(() => {
    const data = state.data;
    dispatch({ type: 'SET_AUDIO_PLAYER', payload: null });
    dispatch({ type: 'SET_AUDIO_READY', payload: false });

    if (!data) return;

    if (data.audioUrl) {
      // Use pre-recorded audio if available.
      let audioSrc = data.audioUrl;

      // Proxy audio through our backend proxy to avoid CSP and cross-origin blocks.
      try {
        const url = new URL(audioSrc, window.location.origin);
        const decodedPath = decodeURIComponent(url.pathname);
        const match = decodedPath.match(/audio\/.*$/);

        if (match) {
          audioSrc = `/api/${match[0]}`;
        }
      } catch (error) {
        console.error('Failed to construct proxy audio URL:', error);
      }

      const player = new Audio(audioSrc);
      dispatch({ type: 'SET_AUDIO_PLAYER', payload: player });
      dispatch({ type: 'SET_AUDIO_READY', payload: true });
      player.onerror = () => { };
    } else {
      // Fallback to text-to-speech.
      const handleVoicesChanged = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          dispatch({ type: 'SET_VOICES', payload: voices });
          dispatch({ type: 'SET_AUDIO_READY', payload: true });
        }
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      handleVoicesChanged();
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, [state.data, isInsideDiscord]);

  // Plays the audio for the current word.
  const handlePlayAudio = useCallback(() => {
    if (!state.audio.isReady || !state.data) return;
    if (state.audio.player) {
      state.audio.player.play().catch(() => showErrorToast("Audio error", "Failed to play audio"));
    } else {
      // Use speech synthesis if no audio player is available.
      try {
        const { word } = state.data;
        const voice = state.audio.voices.find(v => v.lang.startsWith(word.langCode));
        const textToSpeak = voice ? word.nativeScript : word.transliteration;
        if (!textToSpeak) throw new Error("No text available for speech");
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.voice = voice || state.audio.voices.find(v => v.lang.startsWith('en')) || state.audio.voices[0];
        if (utterance.voice) utterance.lang = utterance.voice.lang;
        window.speechSynthesis.speak(utterance);
      } catch {
        showErrorToast("Audio error", "Failed to play audio");
      }
    }
  }, [state.audio, state.data, showErrorToast]);

  // Handles quiz completion.
  const handleQuizFinish = useCallback(async (finalScore: number, questionResults: boolean[]) => {
    if (!state.data?.date) return;
    const scoreData = { score: finalScore, totalQuestions: state.data.questions.length, questionResults };
    dispatch({ type: 'FINISH_QUIZ', payload: scoreData });

    if (state.isOffline) return;

    const scoreDataForSaving = { ...scoreData, wordIdentifier: state.data.date };

    if (discordClientUser) {
      // If in Discord Client, use the API proxy to save the score.
      try {
        const token = getAuthToken();
        const apiUrl = new URL('/api/game/score', window.location.origin);
        if (token) apiUrl.searchParams.append('token', token);

        const res = await fetch(apiUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-auth-token': token } : {})
          },
          body: JSON.stringify(scoreDataForSaving),
        });
        if (!res.ok) throw new Error('Server responded with an error');
      } catch {
        showErrorToast("Save Failed", "Could not save your score.");
      }
    } else if (user) {
      // If online in browser, save the score to the database directly.
      const { getFirebaseFirestore } = await import('@/lib/firebase/firebase');
      const { saveUserScore: saveUserScoreToDb } = await import('@/lib/firebase/firestore');
      const db = await getFirebaseFirestore();
      saveUserScoreToDb(db, user, finalScore, state.data.questions.length, state.data.date, questionResults);
    } else {
      // If logged out, store score in session storage to save later.
      sessionStorage.setItem(PENDING_SCORE_KEY, JSON.stringify(scoreDataForSaving));
    }
  }, [user, discordClientUser, state.data, state.isOffline, showErrorToast, getAuthToken]);

  // Switches between online and offline game modes.
  const handleModeToggle = (isOffline: boolean) => {
    sessionStorage.removeItem(OFFLINE_GAME_DATA_KEY);
    if (isOffline) {
      sessionStorage.setItem(GAME_MODE_KEY, 'offline');
      loadOfflineGame(true);
    } else {
      sessionStorage.setItem(GAME_MODE_KEY, 'online');
      loadDailyData();
    }
  };

  // Returns game state and handler functions.
  return {
    loading: authLoading || state.loading,
    data: state.data,
    dailyScore: state.dailyScore,
    quizFinished: state.quizFinished,
    isOfflineGame: state.isOffline,
    handleQuizFinish,
    handleModeToggle,
    startNewOfflineGame: () => handleModeToggle(true),
    hasPaid,
    isAudioReady: state.audio.isReady,
    handlePlayAudio,
  };
};