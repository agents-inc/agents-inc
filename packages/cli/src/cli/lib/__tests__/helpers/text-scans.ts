/**
 * Three small text operations a prose-quality check needs and no domain object gives directly:
 * every LINE a set of patterns matches, every EXACT string from a fixed list that still appears
 * somewhere in a block of text, and the removal of the spellings a scan is licensed to ignore.
 *
 * Extracted rather than left inline in the specs that use them, because each has a loop and a
 * predicate over an arbitrary list — logic that would need its own tests to be trusted, which a
 * spec asserting on an agent's prose is not the place to carry.
 */

/** Every line of `text` that any of `patterns` matches, trimmed, in the order they appear. */
export function offendingLines(text: string, patterns: readonly RegExp[]): string[] {
  return text
    .split("\n")
    .filter((line) => patterns.some((pattern) => pattern.test(line)))
    .map((line) => line.trim());
}

/** Every string in `forms` that appears verbatim in `text`, in the order `forms` lists them. */
export function retiredFormsIn(text: string, forms: readonly string[]): string[] {
  return forms.filter((form) => text.includes(form));
}

/**
 * `text` with every string in `exemptions` deleted, leaving its line structure intact.
 *
 * What a caller reaches for when a spelling is licensed rather than forbidden — a document naming
 * the form it bans, or a rule format cited by its own name. Removing the spelling before the scan
 * runs keeps the exemption a NAMED constant at the call site; narrowing the pattern instead hides
 * the same decision inside a regex nobody reads twice.
 */
export function withExemptionsRemoved(text: string, exemptions: readonly string[]): string {
  return exemptions.reduce((remaining, exemption) => remaining.split(exemption).join(""), text);
}
