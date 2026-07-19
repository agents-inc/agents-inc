import type { TerminalSession } from "../helpers/terminal-session.js";
import { delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES } from "./constants.js";
import type { TerminalScreen } from "./terminal-screen.js";

/**
 * Closed-loop Enter retry: under parallel-suite contention, Ink's useInput
 * handler for the incoming frame may not be mounted when Enter fires,
 * dropping the keystroke silently. The raw-output cursor is snapshotted
 * before each press and `confirmPainted(cursor)` polls for sentinels that
 * appear AFTER it; if it throws, the press is retried, up to
 * INTERNAL_RETRIES.MAX_ATTEMPTS times.
 */
export async function retryEnterUntil(
  session: TerminalSession,
  screen: TerminalScreen,
  confirmPainted: (cursor: number) => Promise<void>,
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < INTERNAL_RETRIES.MAX_ATTEMPTS; i++) {
    const cursor = screen.getRawCursor();
    session.enter();
    await delay(INTERNAL_DELAYS.STEP_TRANSITION);
    try {
      await confirmPainted(cursor);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
