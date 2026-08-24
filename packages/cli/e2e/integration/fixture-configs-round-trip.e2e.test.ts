import { describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { generateConfigSource } from "../../src/cli/lib/configuration/config-writer.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import { cleanupTempDir, createTempDir, writeProjectConfig } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";

/**
 * Every configuration a fixture writes must be one the CLI would have written.
 *
 * Rendering through `generateConfigSource` proves the FORM; this proves the CONTENT is reachable.
 * The writer emits whatever it is handed, so a fixture can still describe a state the product
 * refuses — and reading it back is what asks that question, because the loader normalises. A
 * config the CLI would have written comes back byte-identical; one it would not either DRIFTS or
 * makes the writer THROW.
 *
 * This was an env-gated diagnostic (`CONFIG_ROUNDTRIP_PROBE`) while four files failed it. They
 * filed a skill under a stack category the catalogue contradicts — `"web-testing"` for a skill
 * whose declared category is `"web-e2e"` — derived from the id's prefix, which is the derivation
 * `packages/cli/CLAUDE.md` forbids in fixtures as well as in product code. It was invisible
 * because `normalizeStackRecord` relocates the assignment on LOAD, so nothing read the key that
 * was written; and two of those relocations collided in an exclusive category, which means one
 * spec asserted a compiled sub-agent body no CLI-written configuration can produce.
 */
describe("a fixture's config survives the product's own load-then-write cycle", () => {
  it("round-trips ProjectBuilder.dualScope's two configs byte for byte", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();

    for (const dir of [project.dir, globalHome.dir]) {
      const reread = await loadProjectConfigFromDir(dir);
      expect(reread, `no config at ${dir}`).not.toBeNull();
      if (!reread) continue;

      const rewritten = generateConfigSource(reread.config);
      expect(
        rewritten,
        `${dir} holds a configuration the CLI would not have written — the fixture and the product disagree about it`,
      ).toBe(await readConfigSource(dir));
    }

    await cleanupTempDir(project.dir);
  });

  /** The control: a fixture built from the catalogue's own categories must pass trivially. */
  it("round-trips a config whose stack names each skill's declared category", async () => {
    const dir = await createTempDir();
    await writeProjectConfig(dir, {
      name: "declared-categories",
      skills: [{ id: "web-testing-cypress-e2e", scope: "project", origin: "eject" }],
      agents: [{ name: "web-developer", scope: "project" }],
      stack: { "web-developer": { "web-e2e": [{ id: "web-testing-cypress-e2e" }] } },
    });

    const reread = await loadProjectConfigFromDir(dir);
    expect(reread).not.toBeNull();
    if (reread) expect(generateConfigSource(reread.config)).toBe(await readConfigSource(dir));

    await cleanupTempDir(dir);
  });
});

async function readConfigSource(dir: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  const path = await import("path");
  return readFile(path.join(dir, ".claude-src", "config.ts"), "utf-8");
}
