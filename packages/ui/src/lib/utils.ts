import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

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

// Teaches tailwind-merge the custom type scale; otherwise `text-12` survives beside `text-sm` and
// silently drops a `text-*` colour.
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
