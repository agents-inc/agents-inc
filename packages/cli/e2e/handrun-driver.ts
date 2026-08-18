/**
 * Transcript printing for the hand-run. This is all that is left of a driver
 * that once tried to drive the wizard itself: `e2e/pages/` already does that,
 * correctly, and it knows two things a naive waiter does not — the tab bar
 * renders every step's name on every screen, and `waitForText` matches the
 * whole output rather than the current one, so a keystroke fires early and
 * silently no-ops. Use the page objects.
 */

export function section(title: string): void {
  process.stdout.write(`\n${"=".repeat(74)}\n${title}\n${"=".repeat(74)}\n`);
}

export function note(label: string, detail?: string): void {
  process.stdout.write(detail === undefined ? `  ${label}\n` : `  ${label}\n      ${detail}\n`);
}

export function verdict(claim: string, held: boolean): void {
  process.stdout.write(`  ${held ? "HOLDS" : "BROKEN"}  ${claim}\n`);
}

/** Runs a journey so a failure is reported and the rest of the run continues. */
export async function attempt(label: string, journey: () => Promise<void>): Promise<void> {
  try {
    await journey();
  } catch (error) {
    process.stdout.write(`  COULD NOT RUN  ${label}\n      ${String(error).split("\n")[0]}\n`);
  }
}
