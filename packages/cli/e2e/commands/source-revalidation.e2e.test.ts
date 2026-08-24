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
 * A remote source is revalidated on every load, so a marketplace that moved on is
 * picked up by the next command with no flag asked of the user.
 *
 * The `--refresh` flag this replaced put the freshness question to the person least
 * able to answer it: a user cannot know the marketplace published something, so the
 * flag was either passed always (and every load paid a full download) or never (and
 * the cache never moved). The CLI asks instead — one conditional request per source
 * per run — and only downloads when the answer is yes.
 *
 * WHY AN HTTP TARBALL AND NOT A LOCAL PATH. Local sources are read live and never
 * cached, so the staleness this file is about cannot occur for one. Only a remote is
 * cached, and only a served tarball lets a spec decide when the ETag moves — which is
 * the whole mechanism under test.
 *
 * WHAT THE ASSERTIONS COVER. `search` is a read-only browse: it writes no config and
 * installs nothing, so its two surfaces are what it printed and what it asked the
 * server for. The request log is the proof-of-execution half — an unchanged source
 * that is served from cache must still show the one HEAD that established that, and
 * must show no GET, or the spec would pass equally against a CLI that revalidated
 * nothing and against one that re-downloaded every time.
 *
 * ONE COMMAND, TWO LOADS — AND WHICH ASSERTION CARRIES THE RED. `search` loads its
 * source twice: once for the matrix, once for the marketplace label. Everything the
 * revalidation decides is therefore owed once per command, not once per load, and the
 * repeated-line assertions below are what hold that. The request log cannot hold it
 * for the changed arm under THIS fixture: the source is served over http, for which
 * `getGigetCacheDir` returns undefined and giget's own tarball cache is never cleared,
 * so a second download of the same run re-extracts what giget already holds and shows
 * up as extra HEADs rather than a second `GET 200`. Do not simplify the doubled-line
 * assertions down to a GET count — against a `github:` source the same defect is a
 * full duplicate download, and here it is only visible in what the user was told.
 */

const SPARE = E2E_SKILL["visual-regression"];

/** Every request one run made, as the fixture recorded them. */
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
    // The installation names the server as its source: `search` has no flag and reads no
    // environment override — naming a source is `init`'s decision, and this stands for it.
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
      controlRequests.filter((request) => request.startsWith("GET")),
      "a source with no cached copy is downloaded once, not once per load",
    ).toStrictEqual(["GET 200"]);
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
    expect(changeRequests, "a moved source is re-downloaded").toContain("GET 200");
  });

  it("revalidates an unchanged source and serves it from cache without re-downloading", () => {
    expect(servedFromCache.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(servedFromCache.output).toContain(SPARE.display);
    expect(
      servedFromCache.output,
      "nothing moved, so nothing may claim to have been fetched",
    ).not.toContain(STEP_TEXT.SOURCE_HAS_NEWER_CONTENT);
    expect(cacheRequests, "one question asked, no body transferred").toStrictEqual(["HEAD 200"]);
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
