import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import { cleanupTempDir, readTreeSnapshot, type TreeSnapshotEntry } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Revalidation from an installed project: a source that moved on reaches the next command's
 * catalogue and nothing already on disk. Installed by `init --from`, so the recorded source is the
 * CLI's own. HOME is apart from the project because the download cache lives under HOME.
 */

/** Published between the two loads below. */
const SPARE = E2E_SKILL["visual-regression"];
const INSTALLED_ID = "Revalidate01";

describe("a source that moves on under an existing installation", () => {
  let before: E2ESource;
  let after: E2ESource;
  let server: TarballSourceServer;
  let store: SeedConfigStore;
  let tempDir: string;
  let project: { dir: string; globalHome: string };

  let installedTree: Record<string, TreeSnapshotEntry>;
  let control: CLIResult;
  let beforePublish: CLIResult;
  let picksUpChange: CLIResult;

  beforeAll(async () => {
    before = await createE2ESource({ withoutSkills: [SPARE.id] });
    after = await createE2ESource();
    server = await startTarballSourceServer(before.sourceDir);
    store = await startSeedConfigStore();

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    project = { dir: env.projectDir, globalHome: env.fakeHome };

    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
          }),
        },
        agents: { [E2E_AGENT["web-developer"].name]: { scope: "project" } },
      }),
    );

    const installed = await runInitFrom(store, INSTALLED_ID, project, server.url);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    installedTree = await readTreeSnapshot(project.dir);

    const search = (query: string) => CLI.run(["search", query], project);

    control = await search(E2E_SKILL.react.slug);
    beforePublish = await search(SPARE.slug);
    await server.publish(after.sourceDir);
    picksUpChange = await search(SPARE.slug);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await store.close();
    await Promise.all([before.tempDir, after.tempDir, tempDir].map(cleanupTempDir));
  });

  /** Subject guard: a search with no source reads like one against an unpublished source. */
  it("resolves its source from what the install recorded, and finds what that source ships", () => {
    expect(control.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(control.output).toContain(E2E_SKILL.react.display);
    expect(beforePublish.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(beforePublish.output).toContain(`No skills found matching "${SPARE.slug}"`);
  });

  it("offers what the source published next, without being asked to look", () => {
    expect(picksUpChange.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(
      picksUpChange.output,
      "a skill published after the install is offered by the next command, with no flag",
    ).toContain(SPARE.display);
    expect(picksUpChange.output, "a download the user did not ask for is announced").toContain(
      STEP_TEXT.SOURCE_HAS_NEWER_CONTENT,
    );
  });

  it("changes nothing that is already installed", async () => {
    // Re-fetching rewrites the cache, never the installation; content and mtime both.
    expect(
      await readTreeSnapshot(project.dir),
      "a source publishing new content rewrote the installation that did not ask for it",
    ).toStrictEqual(installedTree);
  });
});
