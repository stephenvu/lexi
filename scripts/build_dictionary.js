import fs from "fs";
import readline from "readline";
import { GoogleGenAI, Type } from "@google/genai";
import pLimit from "p-limit";

// Configuration
const INPUT_FILE = "oxford-3000.txt";
const OUTPUT_FILE = "oxford-3000.json";
const BATCH_SIZE = 100; // Number of words per API prompt
const CONCURRENCY_LIMIT = 3; // Number of parallel API requests

const ai = new GoogleGenAI();

// Define schema for strict JSON structure output
const entrySchema = {
  type: Type.OBJECT,
  properties: {
    partOfSpeech: { type: Type.STRING },
    definition: { type: Type.STRING, description: "One-sentence definition" },
    example: { type: Type.STRING, description: "One natural example sentence" },
    synonyms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 3 synonyms (empty array if none fit naturally)",
    },
    antonyms: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 3 antonyms (empty array if none fit naturally)",
    },
    usageNote: {
      type: Type.STRING,
      nullable: true,
      description: 'e.g. "formal", "informal" or null',
    },
  },
  required: [
    "partOfSpeech",
    "definition",
    "example",
    "synonyms",
    "antonyms",
    "usageNote",
  ],
};

const wordObjectSchema = {
  type: Type.OBJECT,
  properties: {
    word: { type: Type.STRING },
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    entries: { type: Type.ARRAY, items: entrySchema },
    ipa: { type: Type.STRING, nullable: true },
    syllables: {
      type: Type.STRING,
      nullable: true,
      description: "Syllables separated by middle dots (·) or null",
    },
    cefrLevel: {
      type: Type.STRING,
      nullable: true,
      description: "A1-C2 or null",
    },
  },
  required: ["word", "tags", "entries", "ipa", "syllables", "cefrLevel"],
};

const batchResponseSchema = {
  type: Type.ARRAY,
  items: wordObjectSchema,
};

async function readWords(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  const words = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) words.push(trimmed);
  }
  return words;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function processBatch(batch, batchIndex, totalBatches) {
  console.log(
    `[Processing] Batch ${batchIndex + 1}/${totalBatches} (${batch.length} words)...`,
  );

  const prompt = `You are a precise, accurate dictionary. Process the following English words into dictionary entries.
  
  Set the "tags" field strictly to ["Oxford-3000"] for every word.
  Maintain exact order and headword casing.
  
  Words to process:
  ${batch.join("\n")}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: batchResponseSchema,
        temperature: 0.1,
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error(
      `[Error] Failed to process batch ${batchIndex + 1}:`,
      error.message,
    );
    // Return dummy entries for failed batches to prevent total output corruption
    return batch.map((w) => ({
      word: w,
      tags: ["Oxford-3000"],
      entries: [],
      ipa: null,
      syllables: null,
      cefrLevel: null,
    }));
  }
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Could not find input file "${INPUT_FILE}".`);
    process.exit(1);
  }

  const words = await readWords(INPUT_FILE);
  console.log(`Loaded ${words.length} words from ${INPUT_FILE}.`);

  const batches = chunkArray(words, BATCH_SIZE);
  const limit = pLimit(CONCURRENCY_LIMIT);

  const batchPromises = batches.map((batch, index) =>
    limit(() => processBatch(batch, index, batches.length)),
  );

  const results = await Promise.all(batchPromises);
  const finalDictionary = results.flat();

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(finalDictionary, null, 2),
    "utf-8",
  );
  console.log(
    `\nSuccessfully processed ${finalDictionary.length} entries to ${OUTPUT_FILE}.`,
  );
}

main();
