import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// A function to Capitalize the first letter of a string
export function capitalizeFirstLetter(string?: string) {
  if (!string) return ""
  return string.charAt(0).toUpperCase() + string.slice(1)
}

// A function to resolve the Oxford Learner's Dictionaries audio URL for a given word
// example url: https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/r/res/resil/resilience__gb_1.mp3
export function getOxfordAudioUrl(word: string) {
  const sanitizedWord = word.trim().toLowerCase().replace(/\s+/g, "_")
  const fileName = `${sanitizedWord}__gb_1.mp3`
  const firstLetter = fileName.charAt(0).toLowerCase()
  const firstThreeLetters = fileName.slice(0, 3).toLowerCase()
  const firstFiveLetters = fileName.slice(0, 5).toLowerCase()

  return `https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/${firstLetter}/${firstThreeLetters}/${firstFiveLetters}/${fileName}`
}