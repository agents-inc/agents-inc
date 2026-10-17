import type { MergedSkillsMatrix } from "../../types";
import { initializeMatrix, matrix } from "../matrix/matrix-provider.js";
import { loadSkillsMatrixFromSource } from "./source-loader.js";

/**
 * Runs `body` against `projectDir`'s own skills catalogue, then restores the caller's. The load
 * stays outside the `try`: a failed load seats nothing, so there is nothing to restore.
 */
export async function withCatalogueSeatedFor<T>(
  projectDir: string,
  body: (catalogue: MergedSkillsMatrix) => Promise<T>,
): Promise<T> {
  const callersCatalogue = matrix;
  const { matrix: seated } = await loadSkillsMatrixFromSource({
    projectDir,
    purpose: "upkeep",
    skipExtraSources: true,
    matrixOnly: true,
  });
  try {
    return await body(seated);
  } finally {
    initializeMatrix(callersCatalogue);
  }
}
