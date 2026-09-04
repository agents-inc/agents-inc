/**
 * Two small text scans a prose-quality check needs and no domain object gives directly: every
 * LINE a set of patterns matches, and every EXACT string from a fixed list that still appears
 * somewhere in a block of text.
 *
 * Extracted rather than left inline in the spec that uses them, because each has a loop and a
 * predicate over an arbitrary pattern list — logic that would need its own tests to be trusted,
 * which a spec asserting on a rendered agent's prose is not the place to carry.
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
