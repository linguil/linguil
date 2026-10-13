import { requestExpandedMode } from '@devvit/web/client';

function updateThemeUI(isDark) {
  const toggleBtn = document.getElementById('dark-mode-toggle');
  const toggleThumb = document.getElementById('dark-mode-thumb');
  if (isDark) {
    document.documentElement.classList.add('dark');
    if (toggleBtn) {
      toggleBtn.setAttribute('data-state', 'checked');
      toggleBtn.setAttribute('aria-checked', 'true');
    }
    if (toggleThumb) {
      toggleThumb.setAttribute('data-state', 'checked');
      toggleThumb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon h-4 w-4 text-primary" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    }
  } else {
    document.documentElement.classList.remove('dark');
    if (toggleBtn) {
      toggleBtn.setAttribute('data-state', 'unchecked');
      toggleBtn.setAttribute('aria-checked', 'false');
    }
    if (toggleThumb) {
      toggleThumb.setAttribute('data-state', 'unchecked');
      toggleThumb.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun h-4 w-4 text-muted-foreground" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
    }
  }
}

// Detect system/Reddit colour scheme for dark theme support.
const savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialDark = savedTheme ? savedTheme === 'dark' : prefersDark;
updateThemeUI(initialDark);

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    updateThemeUI(e.matches);
  }
});

let audioUrl = null;
let currentAudio = null;
let currentDailyData = null;
let voices = [];

function loadVoices() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    voices = window.speechSynthesis.getVoices() || [];
  }
}
loadVoices();
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function speakWordFallback() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    if (!voices || voices.length === 0) {
      voices = window.speechSynthesis.getVoices() || [];
    }

    const word = currentDailyData?.word;
    const translit = word?.transliteration || document.getElementById('word-translit')?.textContent?.trim() || 'əne';
    const native = word?.nativeScript || document.getElementById('word-native')?.textContent?.trim() || translit;
    const langCode = word?.langCode || 'am';

    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(langCode.toLowerCase()));
    const textToSpeak = voice ? native : translit;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      const enVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en')) || voices[0];
      if (enVoice) {
        utterance.voice = enVoice;
        utterance.lang = enVoice.lang;
      }
    }
    utterance.rate = 0.9;

    const audioBtn = document.getElementById('audio-button');
    if (audioBtn) {
      audioBtn.classList.add('text-primary', 'animate-pulse');
      utterance.onend = () => audioBtn.classList.remove('text-primary', 'animate-pulse');
      utterance.onerror = () => audioBtn.classList.remove('text-primary', 'animate-pulse');
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Splash TTS error:', err);
  }
}

function playWordAudio() {
  const audioBtn = document.getElementById('audio-button');
  if (audioUrl) {
    try {
      if (currentAudio) {
        currentAudio.pause();
      }
      let audioSrc = audioUrl;
      try {
        const url = new URL(audioSrc);
        const decodedPath = decodeURIComponent(url.pathname);
        const match = decodedPath.match(/audio\/.*$/);
        if (match) {
          audioSrc = `/api/${match[0]}`;
        }
      } catch { }

      currentAudio = new Audio(audioSrc);
      if (audioBtn) {
        audioBtn.classList.add('text-primary', 'animate-pulse');
        currentAudio.onended = () => audioBtn.classList.remove('text-primary', 'animate-pulse');
        currentAudio.onerror = () => {
          audioBtn.classList.remove('text-primary', 'animate-pulse');
          speakWordFallback();
        };
      }
      currentAudio.play().catch(() => {
        if (audioBtn) audioBtn.classList.remove('text-primary', 'animate-pulse');
        speakWordFallback();
      });
      return;
    } catch {
      speakWordFallback();
      return;
    }
  }
  speakWordFallback();
}

// Deterministic shuffle based on string seed.
function deterministicShuffle(array, seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) % 2147483647;
  }
  const result = [...array];
  let m = result.length;
  let t;
  let i;
  while (m) {
    seed = (seed * 16807) % 2147483647;
    i = Math.floor((seed / 2147483647) * m--);
    t = result[m];
    result[m] = result[i];
    result[i] = t;
  }
  return result;
}

// Transition into the game page in expanded mode.
function launchGame(event, selectedOption) {
  event.preventDefault();
  event.stopPropagation();
  try {
    sessionStorage.setItem('targetRoute', '/game');
    localStorage.setItem('targetRoute', '/game');

    if (selectedOption) {
      sessionStorage.setItem('initialSelectedAnswer', selectedOption);
      localStorage.setItem('initialSelectedAnswer', selectedOption);

      if (currentDailyData?.word) {
        const isCorrect = currentDailyData.word.family === selectedOption;
        const dateKey = currentDailyData.date || new Date().toISOString().slice(0, 10);
        const quizStateKey = 'linguil-quiz-state-' + dateKey;
        const gameState = {
          currentQuestionIndex: 0,
          score: isCorrect ? 1 : 0,
          selectedAnswer: selectedOption,
          answerStatus: isCorrect ? 'correct' : 'incorrect',
          questionResults: [isCorrect],
        };
        sessionStorage.setItem(quizStateKey, JSON.stringify(gameState));
        localStorage.setItem(quizStateKey, JSON.stringify(gameState));
      }
    }
  } catch (err) {
    console.warn('Splash storage error:', err);
  }
  requestExpandedMode(event, 'game');
}

// Shrinks transliterated/native word if it overflows the display box.
function adjustWordFontSize() {
  const container = document.getElementById('word-container');
  const text = document.getElementById('word-text');
  const button = document.getElementById('audio-button');
  if (!container || !text || !button) return;

  // Reset font size to measure natural scroll width.
  text.style.fontSize = '';
  const initialFontSize = parseFloat(getComputedStyle(text).fontSize) || 30;

  // Calculate the space taken by the button to prevent overlap.
  const buttonWidth = button.offsetWidth || 36;
  const safeGap = 16; // 1rem gap

  // Reserve space on both sides to keep the text centered.
  const reservedSpace = (buttonWidth + 8 + safeGap) * 2;
  const availableWidth = container.clientWidth - reservedSpace;
  const textWidth = text.scrollWidth;

  // Shrink text on overflow.
  if (availableWidth > 0 && textWidth > availableWidth) {
    const newSize = (initialFontSize * availableWidth) / textWidth;
    text.style.fontSize = `${newSize}px`;
  }
}

// Adjusts the layout if needed so that content fits without vertical scrollbars.
function fitLayout() {
  adjustWordFontSize();

  const mainWrapper = document.getElementById('main-wrapper');
  const headerLogo = document.getElementById('header-logo');
  const logoImg = document.getElementById('logo-img');
  if (!mainWrapper || !headerLogo || !logoImg) return;

  // Normal view (>= 640px).
  if (window.innerWidth >= 640) {
    headerLogo.style.display = '';
    logoImg.style.height = '';
    logoImg.style.width = '';
    return;
  }

  // Small view (< 640px): restore logo visibility to measure natural layout.
  headerLogo.style.display = '';
  logoImg.style.height = '';
  logoImg.style.width = '';

  // Measure actual height of the main content wrapper.
  const wrapperHeight = mainWrapper.offsetHeight;
  // Available height allowing for vertical body padding.
  const availableHeight = window.innerHeight - 16;
  const overflow = wrapperHeight - availableHeight;

  // On viewports where the content fits comfortably with the logo, keep it visible.
  if (overflow <= 0) {
    return;
  }

  // If it still overflows on small mobile screens, remove the logo so the card fits cleanly.
  headerLogo.style.display = 'none';
}

function renderOptions(options) {
  const grid = document.getElementById('options-grid');
  if (!grid) return;
  grid.innerHTML = '';

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'inline-flex items-center justify-center gap-2 whitespace-normal rounded-md text-sm sm:text-base font-medium ring-offset-background transition-all duration-300 transform hover:scale-105 bg-primary text-primary-foreground hover:bg-primary/90 h-auto p-4 cursor-pointer text-center';
    btn.textContent = opt;
    btn.addEventListener('click', (e) => {
      launchGame(e, opt);
    });
    grid.appendChild(btn);
  });
  fitLayout();
}

function renderWordData(data) {
  currentDailyData = data;
  const word = data.word;
  const translitEl = document.getElementById('word-translit');
  const nativeEl = document.getElementById('word-native');
  if (translitEl) translitEl.textContent = word.transliteration || '';
  if (nativeEl) nativeEl.textContent = word.nativeScript || '';

  audioUrl = data.audioUrl || null;
  const audioBtn = document.getElementById('audio-button');
  if (audioBtn) {
    audioBtn.style.opacity = '1';
  }

  const correctFamily = word.family;
  const distractors = data.distractors?.family || [];
  const distinctOptions = [...new Set([correctFamily, ...distractors.slice(0, 3)])];
  const dateSeed = data.date || new Date().toISOString().slice(0, 10);
  const shuffled = deterministicShuffle(distinctOptions, dateSeed);

  renderOptions(shuffled);
  fitLayout();
}

function renderFallbackData() {
  const today = new Date().toISOString().slice(0, 10);
  currentDailyData = {
    word: {
      transliteration: 'əne',
      nativeScript: 'እኔ',
      family: 'Afro-Asiatic',
      language: 'Amharic',
      langCode: 'am',
    },
    date: today,
    distractors: {
      family: ['Indo-European', 'Sino-Tibetan', 'Austronesian'],
    },
  };

  const translitEl = document.getElementById('word-translit');
  const nativeEl = document.getElementById('word-native');
  if (translitEl) translitEl.textContent = 'əne';
  if (nativeEl) nativeEl.textContent = 'እኔ';

  const audioBtn = document.getElementById('audio-button');
  if (audioBtn) {
    audioBtn.style.opacity = '1';
  }

  const fallbackFamilies = ['Afro-Asiatic', 'Indo-European', 'Sino-Tibetan', 'Austronesian'];
  const shuffled = deterministicShuffle(fallbackFamilies, today);
  renderOptions(shuffled);
  fitLayout();
}

async function loadDailyData() {
  try {
    const res = await fetch('/api/daily-word');
    if (!res.ok) throw new Error('Daily word response was not OK');
    const data = await res.json();
    if (data?.word) {
      renderWordData(data);
      return;
    }
  } catch (err) {
    console.warn('Splash: Failed to fetch daily word from backend:', err);
  }
  renderFallbackData();
}

document.addEventListener('DOMContentLoaded', () => {
  // Synchronize toggle UI state once DOM elements are ready.
  updateThemeUI(document.documentElement.classList.contains('dark'));

  const headerLogo = document.getElementById('header-logo');
  headerLogo?.addEventListener('click', (e) => {
    launchGame(e);
  });

  const darkModeToggle = document.getElementById('dark-mode-toggle');
  darkModeToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isDark = !document.documentElement.classList.contains('dark');
    updateThemeUI(isDark);
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch { }
  });

  const card = document.getElementById('question-card');
  card?.addEventListener('click', (e) => {
    if (e.target.closest('#audio-button') || e.target.closest('button')) return;
    launchGame(e);
  });

  const audioBtn = document.getElementById('audio-button');
  audioBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    playWordAudio();
  });

  const logoImg = document.getElementById('logo-img');
  logoImg?.addEventListener('load', fitLayout);

  window.addEventListener('resize', () => {
    requestAnimationFrame(fitLayout);
  });

  if (document.fonts) {
    document.fonts.ready.then(() => {
      fitLayout();
    });
  }

  loadDailyData();
  fitLayout();
});