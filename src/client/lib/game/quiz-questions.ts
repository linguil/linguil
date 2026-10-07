import type { Question, Word, Distractors } from '@/shared/types';
import { shuffleArray } from '@/client/lib/utils';

// Defines the configuration for generating each type of quiz question.
const questionConfigs = [
  {
    type: 'family',
    prompt: 'Which language family is this word from?',
    correctAnswerKey: 'family',
    distractorsKey: 'family',
  },
  {
    type: 'language',
    prompt: (family: string) => `Which ${family} language is this word from?`,
    correctAnswerKey: 'language',
    distractorsKey: 'language',
  },
  {
    type: 'translation',
    prompt: (language: string) => `What does this ${language} word mean in English?`,
    correctAnswerKey: 'translation',
    distractorsKey: 'translation',
  },
];

// Generates a set of quiz questions based on a word and distractor options.
export const generateQuestions = (
  word: Word,
  distractors: Distractors,
): Question[] => {
  return questionConfigs.map((config) => {
    const correctAnswer = word[config.correctAnswerKey as keyof Word] as string; // Get the correct answer from the word object.
    const distractorOptions = distractors[config.distractorsKey as keyof Distractors]; // Get the distractor options.
    
    // Generate the prompt text, using the dynamic prompt function if available.
    const promptText = typeof config.prompt === 'function' 
      ? config.prompt(config.type === 'language' ? word.family : word.language) 
      : config.prompt;

    return { // Return the formatted question object.
      type: config.type as Question['type'],
      prompt: promptText,
      correctAnswer: correctAnswer,
      options: shuffleArray([...new Set([correctAnswer, ...distractorOptions])]), // Combine, deduplicate, and shuffle the correct answer and distractors.
    };
  });
};