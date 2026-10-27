// An account holds each stack name once, compared trimmed and in any case.
export const sameStackName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()
