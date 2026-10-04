import path from "path";
import { mkdir } from "fs/promises";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  createTestEnvironment,
  readAgentEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  acceptClaudeTrustPrompt,
  cleanupTempDir,
  flattenCliOutput,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { makeGitRepositoryRoot } from "../../src/cli/lib/__tests__/helpers/git-repository.js";

/**
 * Journey 79 below a repository root and below a trusted folder: the trust line follows what
 * Claude Code 2.1.288 records and when it asks, as watched under a scratch HOME on 2026-10-03.
 *
 * - Accepting the prompt in `mono/app`, where `mono` is a git repository's root, records
 *   `projects["…/mono"]` and nothing for `mono/app`. The hook gate reads the same key, so the
 *   project's completion gate runs and the install owes no line.
 * - In a plain folder below a trusted plain folder Claude Code shows no prompt at all, while its
 *   hook gate still reads the folder's own key and keeps the hooks off. A line telling the user to
 *   accept the prompt there gives them a remedy that cannot be followed.
 *
 * Each of those is paired with the case Claude Code does prompt in, where the line and its remedy
 * must stay: a folder below a repository root nothing trusts, and a repository root below a
 * trusted plain folder — the prompt's walk up stops at the root.
 *
 * Every run is `init --from` installing one writing sub-agent at project scope, so compile gives
 * it the gate and the folder's trust is the only thing that differs between the four.
 */

const WRITER = E2E_AGENT["web-developer"].name;
const SKILL = E2E_SKILL.react;
const SEED_ID = "TrustRoot";

/** The HOME a run uses and the folder inside it that the install runs in. */
type Workspace = { home: string; project: string };

/** One ejected skill and the writing sub-agent that loads it, both in the project. */
const A_WRITER_IN_THE_PROJECT = buildSeedPayload({
  skills: {
    [SKILL.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [WRITER]: "lazy" },
    }),
  },
  agents: { [WRITER]: { on: true, scope: "project" } },
});

describe("the Claude trust line, read where Claude Code keeps the record", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(SEED_ID, A_WRITER_IN_THE_PROJECT);
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** A fresh HOME, and `relative` created inside it as the folder the install runs in. */
  async function folderInAFreshHome(...relative: string[]): Promise<Workspace> {
    env = await createTestEnvironment({ permissions: false });
    const project = path.join(env.fakeHome, ...relative);
    await mkdir(project, { recursive: true });
    return { home: env.fakeHome, project };
  }

  /**
   * Installs the writing sub-agent into `project` and checks what landed — the config entry and
   * the one compiled file, carrying its gate — so the output is the only thing left to judge.
   */
  async function installAWriterInto({ home, project }: Workspace): Promise<string> {
    const installed = await runInitFrom(
      store,
      SEED_ID,
      { dir: project, globalHome: home },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

    expect(await readAgentEntries(project)).toStrictEqual(
      buildAgentConfigs([WRITER], { scope: "project" }),
    );
    expect(Object.keys(await readCompiledAgents(project))).toStrictEqual([`${WRITER}.md`]);
    await expect({ dir: project }).toHaveAgentFrontmatter(WRITER, { completionGate: true });

    return flattenCliOutput(installed.output);
  }

  it(
    "says nothing below a repository root once Claude Code has recorded the root as trusted",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const workspace = await folderInAFreshHome("mono", "app");
      const repository = path.dirname(workspace.project);
      await makeGitRepositoryRoot(repository);
      // Accepting the prompt in `mono/app` writes this record and no other.
      await acceptClaudeTrustPrompt(workspace.home, repository);

      const output = await installAWriterInto(workspace);

      expect(
        output,
        "Claude Code runs the hooks of a project whose repository root it trusts",
      ).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );

  it(
    "names the folder below a repository root that nothing has trusted, with the prompt as remedy",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const workspace = await folderInAFreshHome("mono", "app");
      await makeGitRepositoryRoot(path.dirname(workspace.project));

      const output = await installAWriterInto(workspace);

      expect(output).toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
      expect(output).toContain(STEP_TEXT.CLAUDE_TRUST_PROMPT_REMEDY);
    },
  );

  it(
    "does not ask for a trust prompt Claude Code never shows below a trusted plain folder",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const workspace = await folderInAFreshHome("par", "proj");
      await acceptClaudeTrustPrompt(workspace.home, path.dirname(workspace.project));

      const output = await installAWriterInto(workspace);

      expect(output, "the hook gate reads the folder's own record, so the gate is off").toContain(
        STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED,
      );
      expect(
        output,
        "Claude Code shows no trust prompt in a plain folder below a trusted one",
      ).not.toContain(STEP_TEXT.CLAUDE_TRUST_PROMPT_REMEDY);
    },
  );

  it(
    "asks for the trust prompt at a repository root below a trusted plain folder",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const workspace = await folderInAFreshHome("par", "repo");
      await makeGitRepositoryRoot(workspace.project);
      await acceptClaudeTrustPrompt(workspace.home, path.dirname(workspace.project));

      const output = await installAWriterInto(workspace);

      expect(output).toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
      expect(output).toContain(STEP_TEXT.CLAUDE_TRUST_PROMPT_REMEDY);
    },
  );
});
