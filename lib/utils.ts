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