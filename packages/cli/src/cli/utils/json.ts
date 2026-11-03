/** Text that is not JSON answers `undefined`, for a schema's `safeParse` to refuse with the rest. */
export function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
