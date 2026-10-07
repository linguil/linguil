// Import Node.js filesystem module, a CSV parser, and Firebase logger.
import * as fs from "fs";
import * as Papa from "papaparse";
import * as logger from "firebase-functions/logger";

// Define a type for a row in a CSV file, which is an object with string keys and values.
export type CsvRow = { [key: string]: string };

// Configuration object for the Papa Parse CSV parser.
const papaParseConfig = {
  header: true, // Treat the first row as headers.
  skipEmptyLines: true, // Ignore empty lines in the CSV file.
  transformHeader: (h: string) => h.trim(), // Trim whitespace from header names.
};

// Parses an entire CSV file from a given file path and returns it as an array of objects.
export function parseCsvFile(filePath: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const data: CsvRow[] = [];
    fs.createReadStream(filePath, "utf8") // Create a readable stream from the file.
      .pipe(Papa.parse(Papa.NODE_STREAM_INPUT, papaParseConfig)) // Pipe the stream into the CSV parser.
      .on("data", (chunk) => data.push(chunk)) // Accumulate parsed data chunks.
      .on("end", () => resolve(data)) // Resolve the promise with the full data on completion.
      .on("error", (error) => reject(error)); // Reject the promise if an error occurs.
  });
}

// Finds the first row in a CSV file that satisfies a given predicate function, streaming the file for efficiency.
export function findRowInCsv(filePath: string, predicate: (row: CsvRow) => boolean): Promise<CsvRow | null> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, "utf8")
      .pipe(Papa.parse(Papa.NODE_STREAM_INPUT, papaParseConfig))
      .on("data", (row: CsvRow) => {
        // If the predicate returns true for the current row, destroy the stream and resolve.
        if (predicate(row)) {
          stream.destroy();
          resolve(row);
        }
      });

    stream.on("end", () => resolve(null)); // If the end of the stream is reached without finding a match, resolve with null.
    stream.on("error", (error) => { // Handle any stream or parsing errors.
      logger.error(`Failed to read or parse CSV file at: ${filePath}`, { error });
      reject(error);
    });
  });
}

// Parses a word string that may contain a native script and a transliteration in parentheses.
export function parseWord(wordString: string): { nativeScript: string; transliteration: string } {
  // Return empty strings if the input is falsy.
  if (!wordString) {
    return { nativeScript: "", transliteration: "" };
  }
  // Use regex to find content inside and outside parentheses.
  const match = wordString.match(/^(.+?)\s*\((.+?)\)\s*$/);
  if (match && match[1] && match[2]) {
    // If a match is found, return the trimmed native script and transliteration.
    return { nativeScript: match[1].trim(), transliteration: match[2].trim() };
  }
  // If no parentheses are found, assume the whole string is both the native script and transliteration.
  const trimmedWord = wordString.trim();
  return { nativeScript: trimmedWord, transliteration: trimmedWord };
}

// Hash a string into a 32-bit unsigned integer using cyrb53.
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c64e6d ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

// Creates a deterministic pseudo-random number generator (Mulberry32).
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveRng(rngOrSeed: number | (() => number)): () => number {
  if (typeof rngOrSeed === "function") {
    return rngOrSeed;
  }
  return createSeededRandom(rngOrSeed);
}

// Shuffles an array in a deterministic way using a given PRNG or seed.
export function shuffleArray<T>(array: T[], rngOrSeed: number | (() => number)): T[] {
  const rng = resolveRng(rngOrSeed);
  const shuffled = [...array]; // Create a shallow copy of the array.
  // Use the Fisher-Yates shuffle algorithm with the seeded random number generator.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Selects a random item from an array in a deterministic way using a given PRNG or seed.
export function getRandomItem<T>(data: T[], rngOrSeed: number | (() => number)): T | undefined {
  if (!data || data.length === 0) return undefined;
  const rng = resolveRng(rngOrSeed);
  const randomIndex = Math.floor(rng() * data.length);
  return data[randomIndex];
}