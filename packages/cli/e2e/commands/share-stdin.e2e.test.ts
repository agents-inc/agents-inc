import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/**
 * `share --stdin`: a configuration the caller HOLDS becomes an id, without an installation and
 * without a file on disk.
 *
 * The route exists for a producer that is not this CLI — `meta-config-stack-detect` walks a
 * repository and emits a `SeedPayload` it is forbidden to write or apply — and the id is the only
 * door into the editor, which reads `?fromId=` and nothing else. Publishing from the CLI rather
 * than from the producer is what keeps `SEED_VERSION`, the `AGENTS_INC_API_URL` override and the
 * caller's user-agent in the one place that owns them.
 */

/**
 * A payload as a producer builds it — the factories, not a hand-written literal, so a wire-shape
 * change reddens this spec at the factory rather than leaving it green about a shape nothing
 * accepts. That is the exact failure the piped route exists to prevent for real producers.
 */
function seedPayload(): SeedPayload {
  return buildSeedPayload({ skills: { [E2E_SKILL.react.id]: buildSeedSkill() } });
}

describe("share --stdin", () => {
  let store: SeedConfigStore;
  let tempDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("mints an id from a payload on stdin and names both destinations", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: JSON.stringify(seedPayload()),
      },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    const id = firstElement(store.minted);
    expect(output).toContain(`init --from ${id}`);
    expect(output).toContain(`?fromId=${id}`);
  });

  /**
   * The whole point of the flag: the payload comes from the caller, so no installation is read.
   * `share` without it resolves the installation the same way every other command does — project
   * first, then the global one — so a bare `share` in an empty directory publishes whatever the
   * machine has installed globally, which is exactly what this route must NOT do.
   */
  it("reads no installation, so an empty directory publishes only what was piped", async () => {
    tempDir = await createTempDir();

    await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: JSON.stringify(seedPayload()),
      },
    );

    const posted = JSON.parse(firstElement(store.requests).body) as {
      skills: Record<string, unknown>;
    };
    expect(Object.keys(posted.skills)).toStrictEqual([E2E_SKILL.react.id]);
  });

  /**
   * Refused BEFORE the POST, and the assertion is the empty request log rather than the exit
   * code. The store's free tier allows a thousand writes a day against a hundred times that in
   * reads, so a write is the scarce half and one spent on a payload the decoder cannot read buys
   * a dead link.
   */
  it("refuses a body that is not a payload without spending a write", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: '{"v":5,"skills":"not-a-record"}',
      },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(store.requests, "nothing may be posted for a payload that cannot be read").toStrictEqual(
      [],
    );
  });

  it("refuses text that is not JSON at all", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: "here is what I found in your repo",
      },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(store.requests).toStrictEqual([]);
  });

  it("refuses an empty pipe rather than posting nothing", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: "",
      },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(store.requests).toStrictEqual([]);
  });
});
