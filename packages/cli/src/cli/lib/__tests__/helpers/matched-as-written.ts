/** A pattern source matching `text` exactly as written: every regex syntax character is escaped. */
export function matchedAsWritten(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
