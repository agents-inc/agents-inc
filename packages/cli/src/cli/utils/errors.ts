import { stripTerminalControls } from "./string";

/**
 * Extract a human-readable message from an unknown error value.
 *
 * Human-readable is the whole reason the sanitising is here: every caller of this is on its way to
 * a terminal, so this is the last point at which the text is still a value rather than output.
 *
 * The message is treated as foreign because it usually is, which is the part that is easy to get
 * backwards. The `Error` was constructed by Node or by a library, so it LOOKS like the CLI's own
 * text — but a parser writes the input that broke it into the message it throws. `JSON.parse`
 * answers `Unexpected token '<ESC>', "{"a":<ESC>[2K}" is not valid JSON`, quoting the bytes
 * verbatim, and those bytes came from a marketplace's `metadata.yaml`, a plugin manifest or a
 * pipe. Provenance follows the input, not the object.
 *
 * Newlines survive, so a multi-line message stays multi-line — see `stripTerminalControls`.
 */
export function getErrorMessage(error: unknown): string {
  return stripTerminalControls(error instanceof Error ? error.message : String(error));
}
