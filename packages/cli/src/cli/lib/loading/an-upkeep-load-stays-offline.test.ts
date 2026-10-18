import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./source-fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./source-fetcher")>()),
  fetchFromSource: vi.fn().mockRejectedValue(new Error("an upkeep load fetched a marketplace")),
}));

import { withCatalogueSeatedFor } from "./catalogue-seat";
import { lazyGateDeps } from "../config-gate/index";
import { resolveGateDeps } from "../config-gate/deps";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";

// Recompiling a project and classifying a global write read the public catalogue built into the
// CLI, so neither needs the network: every fetch here is refused.
describe("an upkeep load of the public catalogue", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-upkeep-offline-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  it("seats the built-in catalogue for a project's recompile without fetching it", async () => {
    const seatedIds = await withCatalogueSeatedFor(tempDir, (seated) =>
      Promise.resolve(Object.keys(seated.skills)),
    );

    expect(seatedIds).toContain(SKILLS.react.id);
  });

  it("hands config-gate the built-in catalogue without fetching it", async () => {
    const loaded = await resolveGateDeps(lazyGateDeps(tempDir), "T2");

    if (loaded === null) throw new Error("a T2 write reads the matrix, so its deps must load");
    expect(Object.keys(loaded.matrix.skills)).toContain(SKILLS.react.id);
  });
});
