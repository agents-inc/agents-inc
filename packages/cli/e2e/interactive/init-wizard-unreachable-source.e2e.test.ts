import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { E2E_STACK_DISPLAY } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import { cleanupTempDir, createTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * A source that has gone away since it was last fetched does not stop `init`:
 * the load falls back to the cached copy and warns that it may be stale. That
 * warning is raised BEFORE Ink takes the terminal, so it is buffered rather than
 * written to stderr — and the wizard's frame is the only place left to read it.
 *
 * WHY AN HTTP TARBALL AND NOT A LOCAL PATH. Local sources are read live and
 * never cached, so "the remote is gone but the cache is warm" cannot be staged
 * for one. Only a served tarball can be taken away between two runs.
 *
 * WHY TWO WIZARDS. The first run is what warms the cache, and its stack list is
 * the proof it did: this source ships one stack, so seeing that stack — in both
 * runs — is what separates "read the cached copy of this source" from "fell back
 * to the built-in matrix", which would satisfy a bare "the wizard mounted".
 */

/**
 * The served tarball, in the shape `InitWizard` takes a source in: `sourceDir` is
 * passed to `--source` verbatim, so a URL belongs there exactly as a path does.
 */
function servedSource(url: string, source: E2ESource): E2ESource {
  return { sourceDir: url, tempDir: source.tempDir };
}

describe("init wizard against a source that has gone away", () => {
  let source: E2ESource;
  let server: TarballSourceServer;
  let globalHome: string;
  let warmingProjectDir: string;
  let offlineProjectDir: string;
  let warming: InitWizard | undefined;
  let offline: InitWizard | undefined;
  let warmingScreen: string;
  let offlineScreen: string;

  beforeAll(async () => {
    await ensureBinaryExists();

    source = await createE2ESource();
    server = await startTarballSourceServer(source.sourceDir);
    // One HOME across both runs: the source cache lives under it, so the second
    // wizard reads the copy the first one left behind.
    globalHome = await createTempDir();
    warmingProjectDir = await createTempDir();
    offlineProjectDir = await createTempDir();

    warming = await InitWizard.launchInProject({
      projectDir: warmingProjectDir,
      globalHome,
      source: servedSource(server.url, source),
    });
    warmingScreen = warming.getScreen();
    await warming.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    warming = undefined;

    await server.close();

    offline = await InitWizard.launchInProject({
      projectDir: offlineProjectDir,
      globalHome,
      source: servedSource(server.url, source),
    });
    offlineScreen = offline.getScreen();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await warming?.destroy();
    await offline?.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
    await cleanupTempDir(source.tempDir);
    await cleanupTempDir(globalHome);
    await cleanupTempDir(warmingProjectDir);
    await cleanupTempDir(offlineProjectDir);
  });

  it("caches the source while it is still being served, and says nothing about staleness", () => {
    expect(warmingScreen).toContain(E2E_STACK_DISPLAY);
    expect(
      warmingScreen,
      "the source answered, so nothing may claim the copy is stale",
    ).not.toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
  });

  it("paints no band at all for a load with nothing to say", () => {
    // The fixture ships ten skills and the CLI's built-in rules are written against
    // the whole public catalogue, which used to leave 2384 references dangling and
    // paint three of them plus a count over every wizard frame in this suite.
    expect(
      warmingScreen,
      "a load with nothing to report owes the step every row it takes",
    ).not.toContain(STEP_TEXT.UNRESOLVED_SLUG);
  });

  it("opens the wizard on the cached copy once the source is unreachable", () => {
    expect(offlineScreen).toContain(E2E_STACK_DISPLAY);
    expect(offlineScreen).toContain(STEP_TEXT.FOOTER_SELECT);
  });

  it("shows the cached-copy warning in the wizard's own frame", () => {
    expect(offlineScreen).toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
    // The band paints the first three messages and counts the rest, so the warning
    // this spec exists for is only readable while nothing else is queued in front
    // of it — which is the whole reason the accidental thousands had to go.
    expect(offlineScreen).not.toContain(STEP_TEXT.UNRESOLVED_SLUG);
  });
});
