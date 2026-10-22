import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import { cleanupTempDir, createTempDir, writeProjectConfig } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * A remote source is revalidated on every load with one conditional request, downloading only when
 * it changed. A served tarball, since local sources are never cached. `search` loads its source
 * twice, so revalidation lines are owed once per command; the doubled-line assertions hold that,
 * and a GET count cannot here.
 */

const SPARE = E2E_SKILL["visual-regression"];

/** The only answer the stand-in sends the tarball's bytes with. */
const DOWNLOAD = "GET 200";

type RequestLog = string[];

describe("remote source revalidation", () => {
  let before: E2ESource;
  let after: E2ESource;
  let server: TarballSourceServer;
  let projectDir: string;

  let control: CLIResult;
  let beforePublish: CLIResult;
  let picksUpChange: CLIResult;
  let servedFromCache: CLIResult;
  let offline: CLIResult;

  let controlRequests: RequestLog;
  let changeRequests: RequestLog;
  let cacheRequests: RequestLog;

  beforeAll(async () => {
    before = await createE2ESource({ withoutSkills: [SPARE.id] });
    after = await createE2ESource();
    server = await startTarballSourceServer(before.sourceDir);
    projectDir = await createTempDir();
    // `search` has no source flag or env, so the config names the server.
    await writeProjectConfig(projectDir, { name: "revalidation-fixture", marketplace: server.url });

    const search = (query: string) => CLI.run(["search", query], { dir: projectDir });

    control = await search(E2E_SKILL.vitest.slug);
    controlRequests = server.requests.slice(0);
    beforePublish = await search(SPARE.slug);

    await server.publish(after.sourceDir);
    const beforeChange = server.requests.length;
    picksUpChange = await search(SPARE.slug);
    changeRequests = server.requests.slice(beforeChange);

    const beforeCacheHit = server.requests.length;
    servedFromCache = await search(SPARE.slug);
    cacheRequests = server.requests.slice(beforeCacheHit);

    await server.close();
    offline = await search(SPARE.slug);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await cleanupTempDir(before.tempDir);
    await cleanupTempDir(after.tempDir);
    await cleanupTempDir(projectDir);
  });

  it("reads a remote tarball source and finds what it ships", () => {
    expect(control.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(control.output).toContain(E2E_SKILL.vitest.display);
    expect(
      controlRequests.filter((request) => request === DOWNLOAD),
      "a source with no cached copy is downloaded once, not once per load",
    ).toStrictEqual([DOWNLOAD]);
  });

  it("does not offer a skill the source has not published yet", () => {
    expect(beforePublish.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(beforePublish.output).toContain(`No skills found matching "${SPARE.slug}"`);
  });

  it("picks up content published upstream without any flag, and says why it re-fetched", () => {
    expect(picksUpChange.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(picksUpChange.output, "the newly published skill is offered on the next run").toContain(
      SPARE.display,
    );
    expect(picksUpChange.output, "a download the user did not ask for is announced").toContain(
      STEP_TEXT.SOURCE_HAS_NEWER_CONTENT,
    );
    expect(
      picksUpChange.output,
      "one update is one line, however many times the command loaded the source",
    ).not.toMatch(
      new RegExp(
        `${STEP_TEXT.SOURCE_HAS_NEWER_CONTENT}[\\s\\S]*${STEP_TEXT.SOURCE_HAS_NEWER_CONTENT}`,
      ),
    );
    expect(changeRequests, "a moved source is re-downloaded").toContain(DOWNLOAD);
  });

  it("revalidates an unchanged source and serves it from cache without re-downloading", () => {
    expect(servedFromCache.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(servedFromCache.output).toContain(SPARE.display);
    expect(
      servedFromCache.output,
      "nothing moved, so nothing may claim to have been fetched",
    ).not.toContain(STEP_TEXT.SOURCE_HAS_NEWER_CONTENT);
    expect(cacheRequests, "no body transferred").not.toContain(DOWNLOAD);
    expect(cacheRequests, "one question asked").toHaveLength(1);
  });

  it("falls back to the cached copy when the source cannot be reached, and names the staleness", () => {
    expect(offline.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(offline.output, "an unreachable source is not a failed command").toContain(
      SPARE.display,
    );
    expect(offline.output).toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
    expect(
      offline.output,
      "one unreachable source is one warning, however many times the command loaded it",
    ).not.toMatch(
      new RegExp(
        `${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}[\\s\\S]*${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}`,
      ),
    );
  });
});
