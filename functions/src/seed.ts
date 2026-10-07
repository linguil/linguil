// Import necessary Firebase and Google Cloud modules.
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { GoogleGenAI } from "@google/genai";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { spawn } from "child_process";

// Import utility functions and custom error classes.
import { CsvRow, parseCsvFile, findRowInCsv, parseWord, shuffleArray, getRandomItem, hashString, createSeededRandom } from "./utils";
import { CsvParsingError, DataValidationError, TtsError as _TtsError } from "./error";

// Latin-script languages with alternative nativeScripts.
const LATIN_PREF_LANGS = new Set([
  "Vietnamese",
  "Tagalog",
  "Javanese",
  "Sundanese",
  "Hmong",
  "Turkish",
  "Hungarian",
  "Hausa",
  "Swahili",
  "Yoruba",
  "Malay",
  "Northern Uzbek",
  "Mongolian",
]);

// Languages supported by Gemini Live API but not Gemini TTS API (direct route).
const LIVE_API_DIRECT_LANGS = new Set(["Ukrainian", "Urdu", "Yoruba"]);

// Languages unsupported by Gemini Live API (do not route).
const UNSUPPORTED_BY_LIVE = new Set([
  "Saraiki",
  "Hmong",
  "Sundanese",
  "Bhojpuri",
  "Wu",
  "Jin",
  "Hakka",
  "Xiang",
  "Min Nan",
  "Yue",
  "Javanese",
  "Lingala",
  "Igbo",
]);

// Defines the structure for the cached language data.
let languageDataCache: {
  families: CsvRow[];
  swadesh: CsvRow[];
  regions: CsvRow[];
  familyRegions: CsvRow[];
  familiesByLanguage: Map<string, CsvRow>;
  languagesByFamily: Map<string, string[]>;
  regionsByLanguage: Map<string, string>;
  languagesByRegion: Map<string, string[]>;
  regionsByFamily: Map<string, string[]>;
  familiesByRegion: Map<string, string[]>;
  allFamilies: string[];
  allEnglishWords: string[];
} | null = null;

// Asynchronously loads, parses, and pre-computes core language data from CSV files.
async function getCoreLanguageData() {
  // Return the cached data if it's already been loaded to avoid redundant file I/O.
  if (languageDataCache) {
    logger.info("Using cached language data");
    return languageDataCache;
  }

  logger.info("Parsing and pre-computing language data from files...");
  const dataPath = path.join(__dirname, "..", "data");

  try {
    // Concurrently parse the language families and Swadesh list CSVs for efficiency.
    const [families, swadesh, regions, familyRegions] = await Promise.all([
      parseCsvFile(path.join(dataPath, "MultiLangFamilies.csv")),
      parseCsvFile(path.join(dataPath, "MultiLangSwadesh.csv")),
      parseCsvFile(path.join(dataPath, "MultiLangRegions.csv")),
      parseCsvFile(path.join(dataPath, "LangFamilyRegions.csv")),
    ]);

    // Create maps for efficient lookups: language name to family info, and family name to language list.
    const familiesByLanguage = new Map<string, CsvRow>();
    const languagesByFamily = new Map<string, string[]>();

    // Populate the lookup maps with data from the parsed families file.
    for (const family of families) {
      const lang = family.Language?.trim();
      const fam = family.Language_Family?.trim();
      if (lang) {
        familiesByLanguage.set(lang, family);
        if (fam) {
          if (!languagesByFamily.has(fam)) {
            languagesByFamily.set(fam, []);
          }
          languagesByFamily.get(fam)!.push(lang);
        }
      }
    }

    // Create maps for efficient lookups: language name to region, and region to language list.
    const regionsByLanguage = new Map<string, string>();
    const languagesByRegion = new Map<string, string[]>();

    for (const region of regions) {
      const lang = region.Language?.trim();
      const reg = region.Region?.trim();
      if (lang && reg) {
        regionsByLanguage.set(lang, reg);
        if (!languagesByRegion.has(reg)) {
          languagesByRegion.set(reg, []);
        }
        languagesByRegion.get(reg)!.push(lang);
      }
    }

    const regionsByFamily = new Map<string, string[]>();
    const familiesByRegion = new Map<string, string[]>();

    for (const familyRegion of familyRegions) {
      const fam = familyRegion.Language_Family?.trim();
      const reg = familyRegion.Region?.trim();
      if (fam && reg) {
        if (!regionsByFamily.has(fam)) {
          regionsByFamily.set(fam, []);
        }
        regionsByFamily.get(fam)!.push(reg);

        if (!familiesByRegion.has(reg)) {
          familiesByRegion.set(reg, []);
        }
        familiesByRegion.get(reg)!.push(fam);
      }
    }

    // Create convenient arrays of all unique family names and English words.
    const allFamilies = [...languagesByFamily.keys()];
    const allEnglishWords = [...new Set(swadesh.map(s => s.English_Word).filter(Boolean))];

    // Store the processed data in the cache.
    languageDataCache = { families, swadesh, regions, familyRegions, familiesByLanguage, languagesByFamily, allFamilies, allEnglishWords, regionsByLanguage, languagesByRegion, regionsByFamily, familiesByRegion };
    logger.info("Successfully parsed and cached language data");
    return languageDataCache;
  } catch (error) {
    // Throw a specific error if loading or parsing fails.
    throw new CsvParsingError(`Failed to load or parse core language data: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Build standard 44-byte RIFF/WAV header for raw PCM audio.
function pcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitDepth = 16): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcmBuffer.length;
  const fileSize = dataSize + 36;
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Convert standard WAV (audio/wav, 24kHz 16-bit mono) from Gemini TTS to MP3, with WAV fallback if ffmpeg is not installed.
async function convertWavToMp3(wavBuffer: Buffer): Promise<Buffer> {
  const tempWavPath = path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  const tempMp3Path = path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  fs.writeFileSync(tempWavPath, wavBuffer);

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", tempWavPath,
      "-y", tempMp3Path
    ]);

    ffmpeg.on("close", (code) => {
      try { if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath); } catch { }
      if (code === 0 && fs.existsSync(tempMp3Path)) {
        try {
          const mp3Buffer = fs.readFileSync(tempMp3Path);
          try { fs.unlinkSync(tempMp3Path); } catch { }
          resolve(mp3Buffer);
          return;
        } catch { }
      }
      try { if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path); } catch { }
      resolve(wavBuffer);
    });

    ffmpeg.on("error", (err) => {
      try { if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath); } catch { }
      try { if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path); } catch { }
      logger.warn("ffmpeg not available, preserving original WAV format", err);
      resolve(wavBuffer);
    });
  });
}

// Convert raw PCM (24kHz, 16-bit, mono) from Gemini Live API to MP3, with WAV fallback if ffmpeg is not installed.
async function convertPcmToMp3(pcmBuffer: Buffer): Promise<Buffer> {
  const tempPcmPath = path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.pcm`);
  const tempMp3Path = path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  fs.writeFileSync(tempPcmPath, pcmBuffer);

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f", "s16le",
      "-ar", "24000",
      "-ac", "1",
      "-i", tempPcmPath,
      "-y", tempMp3Path
    ]);

    ffmpeg.on("close", (code) => {
      try { if (fs.existsSync(tempPcmPath)) fs.unlinkSync(tempPcmPath); } catch { }
      if (code === 0 && fs.existsSync(tempMp3Path)) {
        try {
          const mp3Buffer = fs.readFileSync(tempMp3Path);
          try { fs.unlinkSync(tempMp3Path); } catch { }
          resolve(mp3Buffer);
          return;
        } catch { }
      }
      try { if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path); } catch { }
      resolve(pcmToWav(pcmBuffer));
    });

    ffmpeg.on("error", (err) => {
      try { if (fs.existsSync(tempPcmPath)) fs.unlinkSync(tempPcmPath); } catch { }
      try { if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path); } catch { }
      logger.warn("ffmpeg not available, packaging PCM into standard WAV container", err);
      resolve(pcmToWav(pcmBuffer));
    });
  });
}

// Default Text-to-Speech voice parameters across all languages.
const DEFAULT_TTS_VOICE = "Aoede";
const DEFAULT_TTS_GENDER = "female";
const DEFAULT_TTS_PITCH = "medium";
const DEFAULT_TTS_PERSONA = "clear";

// In-memory cache for resolved Extended Voice Library IDs.
const voiceCache = new Map<string, string>();

// Resolve voice using Gemini TTS Extended Voice Library filters (language_code, region_code, accent, gender, pitch, persona).
async function resolveVoice(
  apiKey: string,
  genAI: GoogleGenAI,
  langCode: string,
  regionCode?: string,
  accent?: string,
  gender: string = DEFAULT_TTS_GENDER,
  pitch: string = DEFAULT_TTS_PITCH,
  persona: string = DEFAULT_TTS_PERSONA,
  defaultVoice: string = DEFAULT_TTS_VOICE
): Promise<string> {
  const cacheKey = `${langCode}_${regionCode || ""}_${accent || ""}_${gender}_${pitch}_${persona}`;
  if (voiceCache.has(cacheKey)) {
    return voiceCache.get(cacheKey)!;
  }

  // If dialect/region attributes are specified (e.g. for Arabic dialects), query Extended Voice Library.
  if (regionCode || accent) {
    const langCodes = (langCode === "ar-XA" || langCode === "ar")
      ? ["ar-XA", "ar"]
      : (langCode === "yue-HK" || langCode === "yue")
        ? ["yue-HK", "yue"]
        : [langCode];

    // 1. Try SDK if available.
    try {
      if ((genAI as any).voices?.list) {
        const response = await (genAI as any).voices.list({
          language_code: langCodes,
          region_code: regionCode ? [regionCode] : undefined,
          accent: accent ? [accent] : undefined,
          gender: [gender],
          pitch: [pitch],
          persona: [persona],
        });
        const candidate = response.voices?.[0];
        const voiceId = candidate?.id || candidate?.display_name;
        if (voiceId) {
          logger.info(`Resolved extended voice via SDK for ${cacheKey}: ${voiceId}`);
          voiceCache.set(cacheKey, voiceId);
          return voiceId;
        }
      }
    } catch (err) {
      logger.warn(`SDK voice list failed for ${cacheKey}`, err);
    }

    // 2. Query Extended Voice Library via REST GET /v1beta/voices
    try {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/voices");
      for (const lc of langCodes) {
        url.searchParams.append("language_code", lc);
      }
      if (regionCode) url.searchParams.append("region_code", regionCode);
      if (accent) url.searchParams.append("accent", accent);
      url.searchParams.append("gender", gender);
      url.searchParams.append("pitch", pitch);
      url.searchParams.append("persona", persona);
      url.searchParams.append("type", "prebuilt");
      url.searchParams.append("page_size", "20");

      const res = await fetch(url.toString(), {
        headers: { "x-goog-api-key": apiKey },
      });

      if (res.ok) {
        const data: any = await res.json();
        const candidate = data.voices?.[0];
        if (candidate) {
          const voiceId = candidate.id || candidate.display_name || candidate.name;
          if (voiceId) {
            logger.info(`Resolved extended voice via REST for ${cacheKey}: ${voiceId}`);
            voiceCache.set(cacheKey, voiceId);
            return voiceId;
          }
        }
      }
    } catch (err) {
      logger.warn(`Could not fetch exact extended voice for ${cacheKey}`, err);
    }

    // 3. Try broader search with language_code + region_code/accent + gender.
    try {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/voices");
      for (const lc of langCodes) {
        url.searchParams.append("language_code", lc);
      }
      if (regionCode) url.searchParams.append("region_code", regionCode);
      if (accent) url.searchParams.append("accent", accent);
      url.searchParams.append("gender", gender);
      url.searchParams.append("type", "prebuilt");
      url.searchParams.append("page_size", "20");

      const res = await fetch(url.toString(), {
        headers: { "x-goog-api-key": apiKey },
      });

      if (res.ok) {
        const data: any = await res.json();
        const candidate = data.voices?.[0];
        if (candidate) {
          const voiceId = candidate.id || candidate.display_name || candidate.name;
          if (voiceId) {
            logger.info(`Resolved relaxed extended voice for ${cacheKey}: ${voiceId}`);
            voiceCache.set(cacheKey, voiceId);
            return voiceId;
          }
        }
      }
    } catch (err) {
      logger.warn(`Broader extended voice search failed for ${cacheKey}`, err);
    }
  }

  voiceCache.set(cacheKey, defaultVoice);
  return defaultVoice;
}

// Synthesize speech using Gemini 3.8 Flash TTS (gemini-3.8-flash-tts) with standard verbatim transcript.
async function synthesizeWithGeminiTts(
  apiKey: string,
  genAI: GoogleGenAI,
  voiceName: string,
  langCode: string,
  wordToSay: string,
  languageName?: string,
  accent?: string
): Promise<Buffer> {
  const styleInstruction = languageName
    ? `natural, authentic native ${accent ? `${accent} ` : ""}${languageName} pronunciation, clear and accurate`
    : "clear and natural pronunciation";

  // 1. Try Gemini 3.8 TTS official Interactions API (POST /v1beta/interactions) with Flash and Flash-Lite fallback.
  for (const modelName of ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: [
            {
              type: "user_input",
              content: [
                {
                  type: "text",
                  text: wordToSay,
                  annotations: [
                    {
                      type: "speech_metadata",
                      style: styleInstruction,
                    },
                  ],
                },
              ],
            },
          ],
          response_format: {
            type: "audio",
            mime_type: "audio/wav",
            sample_rate: 24000,
          },
          generation_config: {
            speech_config: [
              {
                voice: voiceName,
                language: langCode,
              },
            ],
          },
        }),
      });

      if (res.ok) {
        const json: any = await res.json();
        let base64Audio = json.output_audio?.data;
        if (!base64Audio && json.steps) {
          for (const step of json.steps) {
            if (step.type === "model_output" && step.content) {
              for (const item of step.content) {
                if (item.type === "audio" && item.data) {
                  base64Audio = item.data;
                  break;
                }
              }
            }
            if (base64Audio) break;
          }
        }

        if (base64Audio) {
          return Buffer.from(base64Audio, "base64");
        }
      } else {
        const errText = await res.text();
        logger.warn(`Interactions endpoint with ${modelName} returned status ${res.status}: ${errText}`);
      }
    } catch (err) {
      logger.warn(`Gemini Interactions API call with ${modelName} failed`, err);
    }
  }

  // 2. Fallback to generateContent with AUDIO response modality.
  const ttsResponse = await genAI.models.generateContent({
    model: "gemini-3.8-flash-tts",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: wordToSay,
            speechMetadata: {
              style: styleInstruction,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName,
          },
        },
        languageCode: langCode,
      },
    },
  });

  const parts = ttsResponse.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }
  }

  throw new Error("No inline audio data returned in Gemini TTS response");
}

// Resolve GEMINI_API_KEY from environment, ignoring empty values or placeholder strings.
function getGeminiApiKey(): string | undefined {
  const envVal = process.env.GEMINI_API_KEY?.trim();
  if (!envVal || envVal === "YOUR_GEMINI_API_KEY" || envVal.startsWith("YOUR_")) {
    return undefined;
  }
  return envVal;
}

// Synthesize audio using Gemini 3.8 Live API with consistent female, medium-pitch, clear voice.
async function synthesizeWithGeminiLive(
  genAI: GoogleGenAI,
  languageName: string,
  wordToSay: string
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let socketError: any = null;
  let resolveDone: () => void;
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const session = await genAI.live.connect({
    model: "gemini-3.8-live",
    config: {
      responseModalities: ["AUDIO"] as any,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Aoede", // Consistent female, medium pitch, clear and natural voice.
          },
        },
      } as any,
      systemInstruction: {
        parts: [
          {
            text: `You are a native ${languageName} speaker and authentic linguistic pronunciation specialist.
Speak with 100% authentic native ${languageName} phonetics, natural intonation, and native accent.
Do NOT use an American or English accent.
Pronounce ONLY the single target word provided in ${languageName}.
Never say greetings, translations, confirmations, or explanations. Maintain a clear, natural, medium-pitch delivery.`
          }
        ]
      } as any,
    },
    callbacks: {
      onmessage: (message: any) => {
        const parts = message.serverContent?.modelTurn?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData?.data) {
              chunks.push(Buffer.from(part.inlineData.data, "base64"));
            }
          }
        }
        if ((message.serverContent?.turnComplete || message.serverContent?.generationComplete) && chunks.length > 0) {
          resolveDone();
        }
      },
      onerror: (err: any) => {
        socketError = err;
        resolveDone();
      }
    }
  });

  try {
    session.sendRealtimeInput({
      text: `Target word in ${languageName}: "${wordToSay}". Pronounce this exact word in native ${languageName} phonetics now. Pronounce ONLY this word.`
    });

    // Wait for turn completion or safety timeout (5s).
    await Promise.race([
      donePromise,
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  } finally {
    try {
      session.close();
    } catch { }
  }

  if (socketError) {
    throw new Error(`Gemini Live socket error for ${languageName}: ${socketError instanceof Error ? socketError.message : JSON.stringify(socketError)}`);
  }

  if (chunks.length === 0) {
    throw new Error(`Gemini Live API returned no audio chunks for ${languageName}`);
  }

  const rawPcm = Buffer.concat(chunks);
  return await convertPcmToMp3(rawPcm);
}

// Scheduled Cloud Function that runs daily to generate and save a new daily word challenge.
export const seedDailyWord = onSchedule(
  { schedule: "every day 00:00", timeoutSeconds: 540, memory: "512MiB", region: "europe-west2", secrets: ["GEMINI_API_KEY"] },
  async () => {
    // Initialize Firestore and Google GenAI client.
    const db = getFirestore();
    const resolvedKey = getGeminiApiKey();
    if (!resolvedKey) {
      throw new Error("GEMINI_API_KEY is not available in environment or configuration.");
    }
    const genAI = new GoogleGenAI({ apiKey: resolvedKey });
    const today = new Date();
    const docId = today.toISOString().slice(0, 10); // Use YYYY-MM-DD as the document ID.
    const dailyWordRef = db.collection("dailyWords").doc(docId);

    // Check if the daily word for today has already been generated.
    const docSnap = await dailyWordRef.get();
    if (docSnap.exists) {
      logger.info(`Daily word for ${docId} already exists. Exiting function.`);
      return;
    }

    logger.info(`Seeding daily word for ${docId}...`);

    try {
      // Load the necessary language data, using the cache if available.
      const { swadesh, familiesByLanguage, languagesByFamily, allFamilies, allEnglishWords, regionsByLanguage, languagesByRegion, familiesByRegion } = await getCoreLanguageData();
      if (!swadesh?.length) {
        throw new DataValidationError("CRITICAL: Swadesh data source is empty or failed to load");
      }

      const dataPath = path.join(__dirname, "..", "data");
      // Create a deterministic stateful PRNG for today based on the date ID.
      const rng = createSeededRandom(hashString(`daily-word-${docId}`));

      // Fetch the past 14 days of seeded words to enforce cooldown on recently used languages.
      const recentDays = 14;
      const recentLanguages = new Set<string>();
      const pastDocPromises: Promise<FirebaseFirestore.DocumentSnapshot>[] = [];
      for (let i = 1; i <= recentDays; i++) {
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - i);
        const pastDocId = pastDate.toISOString().slice(0, 10);
        pastDocPromises.push(db.collection("dailyWords").doc(pastDocId).get());
      }
      try {
        const pastDocs = await Promise.all(pastDocPromises);
        for (const snap of pastDocs) {
          if (snap.exists) {
            const pastData = snap.data();
            const pastLang = pastData?.word?.language;
            if (pastLang) recentLanguages.add(pastLang.trim());
          }
        }
        if (recentLanguages.size > 0) {
          logger.info(`Excluding ${recentLanguages.size} recent languages from past 14 days: ${[...recentLanguages].join(", ")}`);
        }
      } catch (historyErr) {
        logger.warn("Could not retrieve past daily words for cooldown check; proceeding without history filtering.", historyErr);
      }

      // Filter the Swadesh list to only include rows that have at least one translation.
      const validRows = swadesh.filter(r => Object.keys(r).some(k => k !== "English_Word" && r[k]));
      if (validRows.length === 0) throw new DataValidationError("CRITICAL: No valid rows in Swadesh list");

      // Prefer rows that have languages outside recentLanguages.
      const rowsWithFreshLangs = validRows.filter(r =>
        Object.keys(r).some(k => k !== "English_Word" && r[k] && !recentLanguages.has(k.replace(/_/g, " ")))
      );
      const eligibleRows = rowsWithFreshLangs.length > 0 ? rowsWithFreshLangs : validRows;

      // Select a random row and language column from the valid data using the stateful PRNG.
      const row = getRandomItem(eligibleRows, rng);
      if (!row) throw new DataValidationError("Failed to get a random row");

      const availableCols = Object.keys(row).filter(k => k !== "English_Word" && row[k]);
      const freshCols = availableCols.filter(k => !recentLanguages.has(k.replace(/_/g, " ")));
      const candidateCols = freshCols.length > 0 ? freshCols : availableCols;

      const languageCol = getRandomItem(candidateCols, rng);
      if (!languageCol) throw new DataValidationError("Failed to get a random language column");

      const languageName = languageCol.replace(/_/g, " ");

      logger.info(`Processing daily word for language: ${languageName}`);

      // Extract and parse the word, and get its English translation.
      const rawWord = row[languageCol];
      const parsedWord = parseWord(rawWord);
      const englishWord = row["English_Word"];

      // Find the language family for the selected language.
      const langInfo = familiesByLanguage.get(languageName);
      if (!langInfo || !langInfo.Language_Family) {
        throw new DataValidationError(`Data mismatch: Language info missing for '${languageName}'`);
      }
      const { Language_Family: languageFamily } = langInfo;

      const languageRegion = regionsByLanguage.get(languageName);
      const sameRegionFamilies = languageRegion ? familiesByRegion.get(languageRegion) || [] : [];
      const sameRegionLanguages = languageRegion ? languagesByRegion.get(languageRegion) || [] : [];


      // Find the language code and TTS voice info from the language codes CSV.
      const codeInfo = await findRowInCsv(path.join(dataPath, "LanguageCodes.csv"), c => !!c.Language && c.Language.trim() === languageName.trim());
      if (!codeInfo || !codeInfo.langCode) {
        throw new DataValidationError(`Data mismatch: Language code missing for '${languageName}'`);
      }
      const { langCode, regionCode, accent } = codeInfo;
      const configuredVoice = codeInfo.voice || codeInfo.googleTtsVoice || DEFAULT_TTS_VOICE;
      const gender = codeInfo.gender || DEFAULT_TTS_GENDER;
      const pitch = codeInfo.pitch || DEFAULT_TTS_PITCH;
      const persona = codeInfo.persona || DEFAULT_TTS_PERSONA;

      // Select script to pronounce: modern Latin orthography for languages with historical/non-standard scripts in nativeScript, otherwise nativeScript.
      const wordToSay = LATIN_PREF_LANGS.has(languageName)
        ? (parsedWord.transliteration || parsedWord.nativeScript)
        : (parsedWord.nativeScript || parsedWord.transliteration);

      if (!wordToSay) {
        throw new DataValidationError(`Missing word text for '${languageName}'`);
      }

      let audioUrl = null;
      let audioContent: Buffer | null = null;

      // 1. Direct routing to Gemini Live API for Ukrainian, Urdu, and Yoruba (supported by Live API, unsupported by Gemini TTS).
      if (LIVE_API_DIRECT_LANGS.has(languageName)) {
        logger.info(`Routing ${languageName} directly to Gemini Live API (gemini-3.8-live)`);
        try {
          audioContent = await synthesizeWithGeminiLive(genAI, languageName, wordToSay);
        } catch (err) {
          logger.error(`Gemini Live API failed for ${languageName}`, err);
          throw new _TtsError(`Gemini Live API failed for ${languageName}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      } else {
        // 2. Default route: Gemini TTS (gemini-3.8-flash-tts) API with Extended Voice Library support.
        logger.info(`Synthesizing speech for ${languageName} using Gemini TTS (gemini-3.8-flash-tts)`);
        try {
          const selectedVoice = await resolveVoice(
            process.env.GEMINI_API_KEY!,
            genAI,
            langCode,
            regionCode,
            accent,
            gender,
            pitch,
            persona,
            configuredVoice
          );

          const wavBytes = await synthesizeWithGeminiTts(
            process.env.GEMINI_API_KEY!,
            genAI,
            selectedVoice,
            langCode,
            wordToSay,
            languageName,
            accent
          );

          audioContent = await convertWavToMp3(wavBytes);
          logger.info(`Successfully generated and converted Gemini TTS audio for ${languageName}`);
        } catch (ttsErr) {
          logger.error(`Gemini TTS failed for ${languageName}`, ttsErr);

          // If the language is supported by Gemini Live API, try Live API as fallback.
          if (!UNSUPPORTED_BY_LIVE.has(languageName)) {
            logger.info(`Attempting Gemini Live API fallback for ${languageName}`);
            try {
              audioContent = await synthesizeWithGeminiLive(genAI, languageName, wordToSay);
            } catch (liveErr) {
              logger.error(`Gemini Live fallback also failed for ${languageName}`, liveErr);
            }
          } else {
            logger.warn(`Skipping Gemini Live API fallback for ${languageName} as it is unsupported by Live API`);
          }

          if (!audioContent) {
            throw new _TtsError(`Failed to generate TTS audio for ${languageName}: ${ttsErr instanceof Error ? ttsErr.message : "Unknown error"}`);
          }
        }
      }

      // 3. Save the audio content.
      if (audioContent) {
        const bucket = getStorage().bucket();
        const fileName = `audio/${docId}/${parsedWord.transliteration || "audio"}.mp3`;
        const file = bucket.file(fileName);
        await file.save(audioContent, { metadata: { contentType: "audio/mpeg" }, public: true });
        audioUrl = file.publicUrl(); // Get the public URL of the saved audio file.
        logger.info(`Successfully stored audio at ${audioUrl}`);
      } else {
        throw new _TtsError(`TTS response for "${languageName}" did not contain audio content`);
      }

      // Identify other languages that use the exact same word (transliteration and native script).
      const rawLower = rawWord.trim().toLowerCase();
      const transLower = (parsedWord.transliteration || "").trim().toLowerCase();
      const nativeLower = (parsedWord.nativeScript || "").trim().toLowerCase();

      const conflictingFamilies = new Set<string>();
      const duplicateWordSameFamilyLangs = new Set<string>();
      const conflictingTranslations = new Set<string>([englishWord]);

      for (const sRow of swadesh) {
        for (const col of Object.keys(sRow)) {
          if (col === "English_Word") continue;
          const cellVal = sRow[col];
          if (!cellVal) continue;
          const p = parseWord(cellVal);
          const isMatch =
            cellVal.trim().toLowerCase() === rawLower ||
            (p.nativeScript.trim().toLowerCase() === nativeLower &&
              p.transliteration.trim().toLowerCase() === transLower);

          if (isMatch) {
            const colLang = col.replace(/_/g, " ");
            if (colLang === languageName) {
              const trans = sRow["English_Word"]?.trim();
              if (trans) conflictingTranslations.add(trans);
            } else {
              const otherFam = familiesByLanguage.get(colLang)?.Language_Family;
              if (otherFam) {
                if (otherFam === languageFamily) {
                  duplicateWordSameFamilyLangs.add(colLang);
                } else {
                  conflictingFamilies.add(otherFam);
                }
              }
            }
          }
        }
      }

      // Generate distractor options for question 1 (language family), prioritising same region, avoiding cross-language homonyms.
      const eligibleSameRegionFamilies = sameRegionFamilies.filter(f => f !== languageFamily && !conflictingFamilies.has(f));
      const shuffledSameRegionFamilies = shuffleArray([...new Set(eligibleSameRegionFamilies)], rng);
      const familyDistractors = shuffledSameRegionFamilies.slice(0, 3);

      if (familyDistractors.length < 3) {
        const usedFamilies = new Set([languageFamily, ...conflictingFamilies, ...familyDistractors]);
        const eligibleOtherFamilies = allFamilies.filter(f => !usedFamilies.has(f));
        const shuffledOtherFamilies = shuffleArray([...new Set(eligibleOtherFamilies)], rng);
        familyDistractors.push(...shuffledOtherFamilies.slice(0, 3 - familyDistractors.length));
      }

      if (familyDistractors.length < 3) {
        const fallbackFamilies = allFamilies.filter(f => f !== languageFamily && !familyDistractors.includes(f));
        const shuffledFallback = shuffleArray([...new Set(fallbackFamilies)], rng);
        familyDistractors.push(...shuffledFallback.slice(0, 3 - familyDistractors.length));
      }

      // Generate distractor options for question 2 (language), prioritising same family and region, avoiding cross-language homonyms in the same family.
      const usedLangs = new Set<string>([languageName, ...duplicateWordSameFamilyLangs]);
      const langDistractors: string[] = [];

      // Tier 1: Same family
      const sameFamilyLangs = (languagesByFamily.get(languageFamily) || []).filter(lang => !usedLangs.has(lang));
      const shuffledSameFamily = shuffleArray([...new Set(sameFamilyLangs)], rng);
      for (const lang of shuffledSameFamily) {
        if (langDistractors.length >= 3) break;
        langDistractors.push(lang);
        usedLangs.add(lang);
      }

      // Tier 2: Same region
      if (langDistractors.length < 3) {
        const sameRegionLangs = sameRegionLanguages.filter(lang => !usedLangs.has(lang));
        const shuffledSameRegion = shuffleArray([...new Set(sameRegionLangs)], rng);
        for (const lang of shuffledSameRegion) {
          if (langDistractors.length >= 3) break;
          langDistractors.push(lang);
          usedLangs.add(lang);
        }
      }

      // Tier 3: Other families
      if (langDistractors.length < 3) {
        const otherFamilyLangs = allFamilies
          .flatMap(fam => languagesByFamily.get(fam) || [])
          .filter(lang => !usedLangs.has(lang));
        const shuffledOther = shuffleArray([...new Set(otherFamilyLangs)], rng);
        for (const lang of shuffledOther) {
          if (langDistractors.length >= 3) break;
          langDistractors.push(lang);
          usedLangs.add(lang);
        }
      }

      if (langDistractors.length < 3) {
        const fallbackLangs = allFamilies
          .flatMap(fam => languagesByFamily.get(fam) || [])
          .filter(lang => lang !== languageName && !langDistractors.includes(lang));
        const shuffledFallback = shuffleArray([...new Set(fallbackLangs)], rng);
        for (const lang of shuffledFallback) {
          if (langDistractors.length >= 3) break;
          langDistractors.push(lang);
        }
      }

      // Generate distractor options for question 3 (English translation), avoiding homonyms.
      const eligibleEnglishWords = allEnglishWords.filter(w => !conflictingTranslations.has(w));
      const translationDistractors = shuffleArray([...new Set(eligibleEnglishWords)], rng).slice(0, 3);

      if (translationDistractors.length < 3) {
        const fallbackWords = allEnglishWords.filter(w => w !== englishWord && !translationDistractors.includes(w));
        const shuffledFallback = shuffleArray([...new Set(fallbackWords)], rng);
        translationDistractors.push(...shuffledFallback.slice(0, 3 - translationDistractors.length));
      }

      // Validate that there are enough options for each question.
      if ([...new Set([languageFamily, ...familyDistractors])].length < 2 ||
        [...new Set([languageName, ...langDistractors])].length < 2 ||
        [...new Set([englishWord, ...translationDistractors])].length < 2) {
        throw new DataValidationError(`Insufficient distractors generated for language '${languageName}'`);
      }

      // Retrieve statistics for the chosen language, like speaker counts.
      const langStats = await findRowInCsv(path.join(dataPath, "LangStats.csv"), s => !!s.Language && s.Language.trim() === languageName.trim()) || {};

      // Set the final data for the daily word document in Firestore.
      await dailyWordRef.set({
        date: docId,
        word: { ...parsedWord, translation: englishWord, family: languageFamily, language: languageName, langCode: langCode },
        audioUrl,
        distractors: { family: familyDistractors, language: langDistractors, translation: translationDistractors },
        languageStats: { totalSpeakers: langStats["Total_Speakers"] || 0, countryWithMostSpeakers: langStats["Highest_Number_Speakers"] || "", speakersInCountry: langStats["Country_Speakers"] || 0 },
      });

      logger.info(`SUCCESS: Daily word for ${docId} has been seeded correctly`);
    } catch (error) {
      // Log any fatal errors that occurred during the seeding process.
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`FATAL ERROR in seedDailyWord: ${message}`, { fullError: error });
    }
  }
);