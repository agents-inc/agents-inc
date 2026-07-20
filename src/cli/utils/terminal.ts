/**
 * Clears the terminal screen and scrollback, moving the cursor to the top.
 * Shared by BaseCommand.clearTerminal and the init dashboard.
 */
export function clearTerminalScreen(): void {
  process.stdout.write("\x1b[H\x1b[2J\x1b[3J");
}
