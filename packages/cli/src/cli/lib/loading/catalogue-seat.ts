import type { MergedSkillsMatrix } from "../../types";
import { initializeMatrix, matrix } from "../matrix/matrix-provider.js";
import { loadSkillsMatrixFromSource } from "./source-loader.js";

/**
 * Runs `body` with the skills catalogue seated for `projectDir`, hands it the catalogue
 * that was seated, and puts the caller's own seat back afterwards.
 *
 * A registered project's own local skills, and the skills of the marketplace ITS config
 * names, are in that project's catalogue and in nobody else's. Two things a fan-out does to
 * such a project read a catalogue, and both used to read the TRIGGERING command's:
 *
 *   - The RENDER of a compiled agent, which reaches the catalogue through the module-level
 *     singleton (`matrix` in `matrix-provider.ts`) that `statedUsageFor` and `liveCategoryOf`
 *     in `stacks/stacks-loader.ts` read directly, so no argument reaches it. Rendered against
 *     somebody else's seat, each of the project's own skills loses the `usageGuidance` it
 *     states and falls back to the per-category placeholder.
 *   - The DERIVATION of that project's `config-types.ts` unions, which looks each configured
 *     skill's category up in the catalogue (`deriveCategories` / `deriveDomains`). Against
 *     somebody else's, a skill only this project's catalogue carries resolves to nothing and
 *     its category and domain leave the project's `Category` and `Domain` unions.
 *
 * Both have the same ending: the project's own next `compile` writes the value back from its
 * own catalogue, so the two commands undo each other for as long as they are both run.
 *
 * The catalogue is PASSED to the body as well as seated, so a derivation that can take one as
 * an argument does — a body reading the singleton it just asked to be seated cannot say which
 * seat it got, which is the distinction the whole helper exists to keep. `compile.ts`'s
 * `seatMatrixForPass` returns its catalogue for the same reason.
 *
 * The seat is restored rather than left standing because this is a side trip: the caller has
 * its own pass to finish — `init` and `edit` compile their own agents after the gate returns —
 * and would otherwise render them against the last registered project's catalogue.
 *
 * The load sits outside the `try` deliberately. It seats nothing when it throws, so there is
 * no seat to restore, and a project whose catalogue cannot be loaded is left to the caller's
 * own failure handling rather than silently processed against somebody else's — which is the
 * whole defect this exists to stop. Both callers count such a project as one they could not
 * reach and carry on with the rest.
 */
export async function withCatalogueSeatedFor<T>(
  projectDir: string,
  body: (catalogue: MergedSkillsMatrix) => Promise<T>,
): Promise<T> {
  const callersCatalogue = matrix;
  const { matrix: seated } = await loadSkillsMatrixFromSource({
    projectDir,
    skipExtraSources: true,
    matrixOnly: true,
  });
  try {
    return await body(seated);
  } finally {
    initializeMatrix(callersCatalogue);
  }
}
