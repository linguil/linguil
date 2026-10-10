import type { Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';

// Saves a user's daily quiz score to a private subcollection in Firestore.
export const saveUserScore = async (
  db: Firestore, 
  user: User, 
  score: number, 
  totalQuestions: number,
  wordIdentifier: string,
  questionResults: boolean[]
): Promise<void> => {
  // Dynamically import Firestore functions.
  const { doc, setDoc, getDoc, Timestamp } = await import('firebase/firestore');

  // Path to the user's private daily score document.
  const dailyScoreDocRef = doc(db, 'users', user.uid, 'dailyScores', wordIdentifier);

  try {
    const dailyScoreDoc = await getDoc(dailyScoreDocRef); // Check if score already exists.
    if (dailyScoreDoc.exists()) {
      console.log(`Score for ${wordIdentifier} has already been saved.`);
      return; 
    }

    // Set the new daily score; a backend function handles aggregation.
    await setDoc(dailyScoreDocRef, {
      wordIdentifier: wordIdentifier,
      score: score,
      totalQuestions: totalQuestions,
      questionResults: questionResults,
      timestamp: Timestamp.now(),
    });

    // Notify backend endpoint to ensure score mirroring if user has a linked Discord account.
    fetch('/api/game/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, totalQuestions, wordIdentifier, questionResults }),
    }).catch(() => {});
  } catch (error) {
    console.error('Failed to save your score:', error);
    throw new Error('Failed to save your score'); // Re-throw for the UI to handle.
  }
};