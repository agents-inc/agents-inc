import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The design's type scale, from the `--text-*` tokens in styles/globals.css.
const FONT_SIZES = [
  "7",
  "7_5",
  "8",
  "8_5",
  "9",
  "9_5",
  "10",
  "10_5",
  "11",
  "11_5",
  "12",
  "12_5",
  "13",
  "13_5",
  "15",
  "25",
]

// tailwind-merge only knows Tailwind's stock scale, so it guesses at custom utilities — and it
// guesses wrong for numeric ones in two ways that both show up on screen:
//
// twMerge("text-sm", "text-12")               → "text-sm text-12"   both kept, CSS order decides
// twMerge("text-muted-foreground", "text-12") → "text-12"           colour silently dropped
//
// Teaching it the scale makes `text-12` win over a component's built-in `text-sm` and stop
// colliding with text colours.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
