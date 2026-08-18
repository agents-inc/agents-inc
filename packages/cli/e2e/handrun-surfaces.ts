/**
 * The hand-run's presentation of the four surfaces. The checking itself lives
 * in `e2e/assertions/four-surfaces.ts` and is shared with the E2E specs, so a
 * spec and a hand-run cannot disagree about what "strict" means.
 */
import { note, verdict } from "./handrun-driver.js";
import { inspectFourSurfaces, type SurfaceOptions } from "./assertions/four-surfaces.js";

export async function checkFourSurfaces(
  label: string,
  dir: string,
  options?: SurfaceOptions,
): Promise<{ skillIds: readonly string[]; held: boolean }> {
  const reading = await inspectFourSurfaces(dir, options);

  note(`${label} — config.ts`, `${reading.skillIds.length} skills`);
  note(`${label} — agents at this scope`, reading.agentsAtThisScope.join(", ") || "(none)");
  note(`${label} — compiled`, reading.compiledFiles.join(", ") || "(none)");

  for (const finding of reading.findings) {
    verdict(`${label} — ${finding.claim}`, finding.held);
    if (!finding.held && finding.detail !== undefined) note("    detail", finding.detail);
  }

  return { skillIds: reading.skillIds, held: reading.held };
}
