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
 * The trust line below a repository root and below a trusted folder follows where Claude Code
 * records trust and when it prompts. Each no-line case is paired with one Claude Code does prompt
 * in.
 */

const WRITER = E2E_AGENT["web-developer"].name;
const SKILL = E2E_SKILL.react;
const SEED_ID = "TrustRoot";

type Workspace = { home: string; project: string };

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

  async function folderInAFreshHome(...relative: string[]): Promise<Workspace> {
    env = await createTestEnvironment({ permissions: false });
    const project = path.join(env.fakeHome, ...relative);
    await mkdir(project, { recursive: true });
    return { home: env.fakeHome, project };
  }

  /** Checks the config entry and the gated compiled file, so only the output is left to judge. */
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
      // Accepting the prompt in `mono/app` records the repository root and nothing else.
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
