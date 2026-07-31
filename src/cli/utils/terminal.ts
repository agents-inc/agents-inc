import { MIN_TERMINAL_SIZE } from "../consts.js";

/**
 * Clears the terminal screen and scrollback, moving the cursor to the top.
 * Shared by BaseCommand.clearTerminal and the init dashboard.
 */
export function clearTerminalScreen(): void {
  process.stdout.write("\x1b[H\x1b[2J\x1b[3J");
}

/** Whether the terminal clears {@link MIN_TERMINAL_SIZE} in BOTH dimensions. */
export function isTerminalLargeEnough(columns: number, rows: number): boolean {
  return columns >= MIN_TERMINAL_SIZE.COLS && rows >= MIN_TERMINAL_SIZE.ROWS;
}

/**
 * The one resize prompt, worded in one place because two gates print it and they
 * must not drift: `BaseCommand.ensureTerminalSize` blocks a command from
 * launching too small, and `WizardLayout` replaces the wizard tree when the
 * terminal shrinks under a session already running. The E2E constants
 * `STEP_TEXT.TOO_NARROW` / `TOO_SHORT` key off this text, so a second wording
 * would leave one of the two gates unassertable.
 *
 * Precondition: {@link isTerminalLargeEnough} is false. Width is reported in
 * preference to height, so "not too narrow" here means "too short" — which is
 * why the height is not a parameter.
 */
export function formatTerminalTooSmallMessage(columns: number): string {
  const issue =
    columns < MIN_TERMINAL_SIZE.COLS
      ? `too narrow (need ${MIN_TERMINAL_SIZE.COLS})`
      : `too short (need ${MIN_TERMINAL_SIZE.ROWS})`;
  return `Terminal ${issue}. Please resize.`;
}
