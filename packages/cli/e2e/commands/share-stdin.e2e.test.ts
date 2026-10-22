import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTempDir, cleanupTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { SEED_VERSION, type SeedPayload } from "@workspace/matrix/seed";

/**
 * `share --stdin` turns a piped payload into an id with no installation, so `SEED_VERSION`, the API
 * URL override and the user-agent stay in one place.
 */

/** Built with the factories, so a wire-shape change reddens at the factory. */
function seedPayload(): SeedPayload {
  return buildSeedPayload({ skills: { [E2E_SKILL.react.id]: buildSeedSkill() } });
}

const WEB_DEV = E2E_AGENT["web-developer"].name;

const PINNED_TO_PROJECT = { scope: "project" } as const;

const ASSIGNED_TO_WEB_DEV = { [WEB_DEV]: "lazy" } as const;

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

  /** A write is the store's scarce half. */
  it("refuses a body that is not a payload without spending a write", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: JSON.stringify({ v: SEED_VERSION, skills: "not-a-record" }),
      },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(store.requests, "nothing may be posted for a payload that cannot be read").toStrictEqual(
      [],
    );
  });

  it("refuses a project skill on a global sub-agent without spending a write", async () => {
    tempDir = await createTempDir();

    const unwritable = buildSeedPayload({
      skills: {
        [E2E_SKILL.react.id]: buildSeedSkill({
          scope: "project",
          assignments: ASSIGNED_TO_WEB_DEV,
        }),
      },
    });

    const { exitCode, output } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: JSON.stringify(unwritable),
      },
    );

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(store.requests, "an unwritable pair must cost no write").toStrictEqual([]);

    // Both names, so the producer knows which assignment to change.
    const said = flattenCliOutput(output);
    expect(said).toContain(`skills.${E2E_SKILL.react.id}.assignments.${WEB_DEV}`);
    // And the sentence: the Zod path alone already spells both names.
    expect(said).toContain(`nowhere to be written on '${WEB_DEV}', which rests at global scope`);
  });

  /** Control: the same pair with the sub-agent pinned to project. */
  it("shares that same pair once the sub-agent is pinned to project", async () => {
    tempDir = await createTempDir();

    const writable = buildSeedPayload({
      skills: {
        [E2E_SKILL.react.id]: buildSeedSkill({
          scope: "project",
          assignments: ASSIGNED_TO_WEB_DEV,
        }),
      },
      agents: { [WEB_DEV]: PINNED_TO_PROJECT },
    });

    const { exitCode, output } = await CLI.run(
      ["share", "--stdin"],
      { dir: tempDir },
      {
        env: { AGENTS_INC_API_URL: store.url },
        input: JSON.stringify(writable),
      },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(`init --from ${firstElement(store.minted)}`);
    // The whole body: a guard that stripped the assignment would also exit 0.
    expect(JSON.parse(firstElement(store.requests).body)).toStrictEqual(writable);
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
