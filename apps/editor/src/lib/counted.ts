/** `1 skill`, `3 skills`: for nouns whose plural only adds an `s`. */
export const counted = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`
