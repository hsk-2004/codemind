import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The fluid design tokens in globals.css (text-fluid-*, p-fluid-*, aspect-chart…).
// tailwind-merge must know them, otherwise it reads `text-fluid-sm` as a text
// colour and silently removes the real colour class next to it.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["fluid-xs", "fluid-sm", "fluid-base", "fluid-lg", "fluid-xl"],
      spacing: ["fluid-xs", "fluid-sm", "fluid-md", "fluid-lg"],
      aspect: ["chart", "card"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
