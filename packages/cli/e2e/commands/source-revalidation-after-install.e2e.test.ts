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
 * Revalidation seen from an installation rather than from a browse.
 *
 * `commands/source-revalidation` proves the mechanism — a remote source that moved on is
 * re-fetched on the next load with no flag, and an unchanged one costs one HEAD and no body. It
 * proves it through `search` alone, from a config a fixture wrote, so it can only ever speak
 * about a directory nothing was installed into.
 *
 * The question an installed project actually has is the one this file adds: a source moving on
 * must reach the CATALOGUE the next command reads, and must reach nothing already on disk.
 * Those are one event seen from the two sides a user has, and the second has no subject at all
 * without an installation to leave alone.
 *
 * The install is made by `init --from` against the served tarball, so the source these later
 * commands revalidate is the one the install itself recorded — a fixture-written source value
 * would only prove the CLI can read a value the CLI never chose. HOME is a separate directory
 * from the project for the same reason it is in the reporting specs: the download cache lives
 * under HOME, and with the two collapsed the cache moving would read as the installation moving.
 */

/** The skill the source has not published yet, and publishes between the two loads below. */
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

  /**
   * The subject guard for both assertions below. An install that recorded no source, or the
   * wrong one, leaves the later commands nothing to revalidate — and a `search` that resolved
   * no source at all reads exactly like a `search` against a source that has not published yet.
   */
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
    // The half a browse cannot make. Re-fetching rewrites the CACHE; the skills on disk, the
    // config that declares them and the compiled sub-agents are the user's installation and are
    // not upstream's to move. Content and mtime both, so a rewrite with identical bytes is
    // still a change this catches.
    expect(
      await readTreeSnapshot(project.dir),
      "a source publishing new content rewrote the installation that did not ask for it",
    ).toStrictEqual(installedTree);
  });
});
