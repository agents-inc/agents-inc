import { stripTerminalControls } from "./string";

/**
 * Sanitised because parsers quote the offending input into their messages, so an Error from
 * Node can still carry foreign terminal escapes.
 */
export function getErrorMessage(error: unknown): string {
  return stripTerminalControls(error instanceof Error ? error.message : String(error));
}
