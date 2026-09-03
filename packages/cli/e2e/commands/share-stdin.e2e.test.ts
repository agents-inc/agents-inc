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

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry that keeps its agent in the project rather than at the default scope. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

/**
 * The one assignment the refusal and its control both carry, so the pair below differs in exactly
 * the guarded dimension — where the SUB-AGENT rests — and in nothing else.
 */
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

  /**
   * THE ONE THAT REACHED A USER. `meta-config-stack-detect` emits `scope: "project"` on every
   * skill and keeps `agents` sparse, and an absent `agents` entry rests on the shared default of
   * `global` — so every assignment it proposed was a project skill on a global sub-agent, which
   * has nowhere to be written. The local gate read the BASE schema, which does not carry that
   * rule, so the payload passed here and the store refused it: a spent write and a bare
   * `HTTP 400` with the store's own explanation discarded.
   *
   * Asserted as an EMPTY REQUEST LOG rather than by exit code: the claim is that nothing was
   * spent, not merely that something failed.
   */
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

    // The message has to name the pair, or the producer cannot tell which of its own
    // assignments to change — which is the whole difference from a bare HTTP 400. BOTH halves:
    // the skill can move to global scope or the sub-agent can be pinned to the project, and only
    // the producer knows which it meant.
    const said = flattenCliOutput(output);
    expect(said).toContain(`skills.${E2E_SKILL.react.id}.assignments.${WEB_DEV}`);
    // And the SENTENCE, which is the half the path cannot supply. `formatZodIssue` prefixes
    // every issue with its Zod path, and that path already spells out both names — so an
    // assertion that stopped at the two names above would pass unchanged against a refinement
    // whose message had been blanked out entirely.
    expect(said).toContain(`nowhere to be written on '${WEB_DEV}', which rests at global scope`);
  });

  /**
   * The CONTROL for the refusal above, and neither spec means anything without the other.
   *
   * A refusal pinned on its own cannot tell a correctly-scoped guard from one that has swallowed
   * its whole domain: both leave the request log empty and both exit non-zero, so the assertions
   * read identically either way. The two success specs at the top of this file are not the
   * control, because they carry no assignment at all — a guard refusing EVERY assignment leaves
   * every one of them green. This one differs from the refusal in exactly the guarded dimension:
   * the same skill at the same scope with the same assignment, and the sub-agent pinned to the
   * project rather than resting at global.
   */
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
    // The write was spent on the payload as piped. Asserted against the whole posted body rather
    // than the exit code, because a guard that STRIPPED the assignment instead of refusing it
    // would also exit 0 — and would share a configuration missing the thing it was sharing.
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
