import { MIN_TERMINAL_SIZE } from "../consts.js";

/** Clears screen and scrollback. */
export function clearTerminalScreen(): void {
  process.stdout.write("\x1b[H\x1b[2J\x1b[3J");
}

export function isTerminalLargeEnough(columns: number, rows: number): boolean {
  return columns >= MIN_TERMINAL_SIZE.COLS && rows >= MIN_TERMINAL_SIZE.ROWS;
}

/**
 * E2E `STEP_TEXT.TOO_NARROW` / `TOO_SHORT` key off this text. Precondition: the terminal is too
 * small; width is reported first, so not-too-narrow means too-short.
 */
export function formatTerminalTooSmallMessage(columns: number): string {
  const issue =
    columns < MIN_TERMINAL_SIZE.COLS
      ? `too narrow (need ${MIN_TERMINAL_SIZE.COLS})`
      : `too short (need ${MIN_TERMINAL_SIZE.ROWS})`;
  return `Terminal ${issue}. Please resize.`;
}
