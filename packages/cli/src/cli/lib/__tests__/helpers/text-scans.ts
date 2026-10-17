export function offendingLines(text: string, patterns: readonly RegExp[]): string[] {
  return text
    .split("\n")
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim());
}

export function retiredFormsIn(text: string, forms: readonly string[]): string[] {
  return forms.filter((form) => text.includes(form));
}

/** Strips licensed spellings before a scan, so exemptions stay named at the call site. */
export function withExemptionsRemoved(text: string, exemptions: readonly string[]): string {
  return exemptions.reduce((remaining, exemption) => remaining.split(exemption).join(""), text);
}
