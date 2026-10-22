import { copyFile, mkdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderAgentMd } from "../../__tests__/content-generators.js";
import { buildClaudeTrustState } from "../../__tests__/factories/claude-settings-factories.js";
import {
  makeBareGitRepository,
  makeGitRepositoryRoot,
  makeGitWorktree,
} from "../../__tests__/helpers/git-repository.js";
import { type IsolatedHome, setupIsolatedHome } from "../../__tests__/helpers/isolated-home.js";
import { agentsDir, claudeStateFile } from "../../installation/install-layout.js";
import {
  claudeCompileNotices,
  claudeProjectNeedsTrustMessage,
  claudeProjectNeverAskedMessage,
} from "../claude-project-trust.js";

// Claude Code drops a project sub-agent's frontmatter hooks until its folder is trusted.

const WRITING_AGENT = "web-developer";
const READ_ONLY_AGENT = "web-researcher";

const WRITING_TOOLS = ["Read", "Write", "Edit"];
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];

const A_STOP_HOOK = JSON.stringify({
  Stop: [{ hooks: [{ type: "command", command: "npm run --if-present --silent typecheck" }] }],
});

const A_SUBAGENT_STOP_HOOK = JSON.stringify({
  SubagentStop: [{ hooks: [{ type: "command", command: "npm test" }] }],
});

const A_POST_TOOL_USE_HOOK = JSON.stringify({
  PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo ran" }] }],
});

const AN_EMPTY_STOP_HOOK = JSON.stringify({ Stop: [] });

/** Written by hand: Claude Code runs only a top-level `hooks:` key, so this hook never runs. */
const A_STOP_HOOK_NESTED_UNDER_ANOTHER_KEY = `{}\nmetadata:\n  hooks: ${A_STOP_HOOK}`;

/** Written by hand, with more space after `hooks:` than the compiler writes. */
const A_SPACED_OUT_STOP_HOOK = `   ${A_STOP_HOOK}`;

/** Written by hand as block YAML rather than the compiler's one JSON line. */
const A_POST_TOOL_USE_HOOK_IN_BLOCK_YAML = [
  "",
  "  PostToolUse:",
  "    - matcher: Bash",
  "      hooks:",
  "        - type: command",
  "          command: echo ran",
].join("\n");

let home: IsolatedHome;

beforeEach(async () => {
  home = await setupIsolatedHome("claude-folder-trust-");
});

afterEach(async () => {
  await home.cleanup();
});

async function compiledInto(
  projectDir: string,
  name: string,
  frontmatter: { tools: string[]; hooks?: string },
): Promise<void> {
  const dir = agentsDir("claude", "project", projectDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.md`), renderAgentMd(name, undefined, frontmatter));
}

async function compiledIntoTheProject(
  name: string,
  frontmatter: { tools: string[]; hooks?: string },
): Promise<void> {
  await compiledInto(home.projectDir, name, frontmatter);
}

async function writingAgentCompiled(name: string, hooks = A_STOP_HOOK): Promise<void> {
  await compiledIntoTheProject(name, { tools: WRITING_TOOLS, hooks });
}

/** From the home directory, the project's agents folder is the global `~/.claude/agents/`. */
async function writingAgentCompiledFromHome(name: string): Promise<void> {
  await compiledInto(os.homedir(), name, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
}

async function readOnlyAgentCompiled(name: string, declaredHooks?: string): Promise<void> {
  await compiledIntoTheProject(
    name,
    declaredHooks === undefined
      ? { tools: READ_ONLY_TOOLS }
      : { tools: READ_ONLY_TOOLS, hooks: declaredHooks },
  );
}

async function trustDialogAnswered(accepted: boolean): Promise<void> {
  await writeFile(
    claudeStateFile(),
    JSON.stringify({
      projects: {
        "/some/other/project": { hasTrustDialogAccepted: true },
        [home.projectDir]: { hasTrustDialogAccepted: accepted },
      },
    }),
  );
}

describe("a Claude install asks for the folder to be trusted", () => {
  it("names the folder when a writing project sub-agent sits in a folder Claude Code never trusted", async () => {
    await writingAgentCompiled(WRITING_AGENT);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 1),
    ]);
  });

  it("says it while the dialog was answered no", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await trustDialogAnswered(false);

    expect(await claudeCompileNotices("claude", home.projectDir)).toHaveLength(1);
  });

  it("says nothing once the dialog was accepted for this exact folder", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await trustDialogAnswered(true);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("treats a state file it cannot read as untrusted", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await writeFile(claudeStateFile(), "{ not json");

    expect(await claudeCompileNotices("claude", home.projectDir)).toHaveLength(1);
  });

  it("speaks for a hook the sub-agent declared under SubagentStop", async () => {
    await writingAgentCompiled(WRITING_AGENT, A_SUBAGENT_STOP_HOOK);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 1),
    ]);
  });

  it("speaks for a read-only sub-agent whose only hook is a PostToolUse hook", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT, A_POST_TOOL_USE_HOOK);

    expect(
      await claudeCompileNotices("claude", home.projectDir),
      "Claude Code drops a project sub-agent's hooks on every event until the folder is trusted",
    ).toStrictEqual([claudeProjectNeedsTrustMessage(home.projectDir, 1)]);
  });

  it("speaks for a hook written by hand with more space after its key", async () => {
    await writingAgentCompiled(WRITING_AGENT, A_SPACED_OUT_STOP_HOOK);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 1),
    ]);
  });

  it("speaks for a hook written by hand as block YAML", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT, A_POST_TOOL_USE_HOOK_IN_BLOCK_YAML);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 1),
    ]);
  });

  it("says nothing about a hook nested under another key, which Claude Code never runs", async () => {
    await writingAgentCompiled(WRITING_AGENT, A_STOP_HOOK_NESTED_UNDER_ANOTHER_KEY);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("says nothing about a project whose sub-agents declare no hook", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("says nothing about a sub-agent whose Stop key holds no hook", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT, AN_EMPTY_STOP_HOOK);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("says nothing when run from the home directory, whose agents Claude Code always trusts", async () => {
    await writingAgentCompiledFromHome(WRITING_AGENT);

    expect(await claudeCompileNotices("claude", os.homedir())).toStrictEqual([]);
  });

  it("counts only the sub-agents declaring a hook, on whichever event", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await writingAgentCompiled("web-tester", A_POST_TOOL_USE_HOOK);
    await readOnlyAgentCompiled(READ_ONLY_AGENT);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 2),
    ]);
  });

  it("is Claude's alone: a Codex installation gets its own trust line elsewhere", async () => {
    await writingAgentCompiled(WRITING_AGENT);

    expect(await claudeCompileNotices("codex", home.projectDir)).toStrictEqual([]);
  });
});

// Claude Code keys the record by git repository root (a worktree by its main checkout), skips the
// prompt below a trusted plain folder, and still asks a repository root for itself.
describe("a Claude install reads the trust record the way Claude Code does", () => {
  /** Only true where Claude Code will actually show the prompt. */
  const TRUST_PROMPT_REMEDY = "accept the trust prompt";
  const GATE_OFF = "only once you trust the folder";

  function recordToSet(key: string): string {
    return `projects[${JSON.stringify(key)}].hasTrustDialogAccepted`;
  }

  async function trustRecordedUnder(keys: string[]): Promise<void> {
    await writeFile(claudeStateFile(), JSON.stringify(buildClaudeTrustState(keys)));
  }

  async function projectWithAWritingAgentIn(parent: string, folder: string): Promise<string> {
    const projectDir = path.join(parent, folder);
    await compiledInto(projectDir, WRITING_AGENT, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
    return projectDir;
  }

  it("says nothing below a repository root once Claude Code records the root as trusted", async () => {
    const repository = home.projectDir;
    await makeGitRepositoryRoot(repository);
    const project = await projectWithAWritingAgentIn(repository, "app");
    await trustRecordedUnder([repository]);

    expect(
      await claudeCompileNotices("claude", project),
      "Claude Code runs the hooks of a project below a trusted repository root",
    ).toStrictEqual([]);
  });

  it("names the folder below a repository root that nothing has trusted", async () => {
    const repository = home.projectDir;
    await makeGitRepositoryRoot(repository);
    const project = await projectWithAWritingAgentIn(repository, "app");
    await trustRecordedUnder(["/some/other/project"]);

    expect(await claudeCompileNotices("claude", project)).toStrictEqual([
      claudeProjectNeedsTrustMessage(project, 1),
    ]);
  });

  it("does not ask for a trust prompt Claude Code never shows below a trusted plain folder", async () => {
    const parent = home.projectDir;
    const project = await projectWithAWritingAgentIn(parent, "proj");
    await trustRecordedUnder([parent]);

    expect(
      (await claudeCompileNotices("claude", project)).join("\n"),
      "Claude Code shows no trust prompt below a trusted plain folder",
    ).not.toContain(TRUST_PROMPT_REMEDY);
  });

  it("asks for the trust prompt at a repository root below a trusted plain folder", async () => {
    const parent = home.projectDir;
    const project = await projectWithAWritingAgentIn(parent, "repo");
    await makeGitRepositoryRoot(project);
    await trustRecordedUnder([parent]);

    const notices = await claudeCompileNotices("claude", project);

    expect(notices).toHaveLength(1);
    expect(notices.join("\n")).toContain(TRUST_PROMPT_REMEDY);
  });

  it("still says the gate is off below a trusted plain folder, naming the record to set", async () => {
    const parent = home.projectDir;
    const project = await projectWithAWritingAgentIn(parent, "proj");
    await trustRecordedUnder([parent]);

    const notices = await claudeCompileNotices("claude", project);

    expect(notices, "the hook gate reads the folder's own record, so the gate is off").toHaveLength(
      1,
    );
    expect(notices.join("\n")).toContain(GATE_OFF);
    expect(
      notices.join("\n"),
      "where Claude Code never asks, its own diagnostic's remedy is the only one left",
    ).toContain(recordToSet(project));
  });

  it("says the gate is off below a repository root when only the folder itself is recorded", async () => {
    const repository = home.projectDir;
    await makeGitRepositoryRoot(repository);
    const project = await projectWithAWritingAgentIn(repository, "app");
    await trustRecordedUnder([project]);

    const notices = await claudeCompileNotices("claude", project);

    expect(
      notices,
      "Claude Code's hook gate reads the repository root's record, not the folder's",
    ).toHaveLength(1);
    expect(notices.join("\n")).toContain(recordToSet(repository));
    expect(notices.join("\n"), "the folder's own record stops Claude Code asking").not.toContain(
      TRUST_PROMPT_REMEDY,
    );
  });

  it("says nothing in a worktree once Claude Code records the main checkout's root as trusted", async () => {
    const main = path.join(home.projectDir, "main");
    await makeGitRepositoryRoot(main);
    const worktree = path.join(home.projectDir, "worktree");
    await makeGitWorktree(path.join(main, ".git"), worktree);
    const project = await projectWithAWritingAgentIn(worktree, "app");
    await trustRecordedUnder([main]);

    expect(
      await claudeCompileNotices("claude", project),
      "Claude Code keys a linked worktree by its main checkout's root",
    ).toStrictEqual([]);
  });

  it("names the worktree folder nothing has trusted, with the prompt as remedy", async () => {
    const main = path.join(home.projectDir, "main");
    await makeGitRepositoryRoot(main);
    const worktree = path.join(home.projectDir, "worktree");
    await makeGitWorktree(path.join(main, ".git"), worktree);
    const project = await projectWithAWritingAgentIn(worktree, "app");
    await trustRecordedUnder(["/some/other/project"]);

    expect(await claudeCompileNotices("claude", project)).toStrictEqual([
      claudeProjectNeedsTrustMessage(project, 1),
    ]);
  });

  it("says nothing in a worktree of a bare repository once Claude Code records that repository", async () => {
    const bare = path.join(home.projectDir, "repo.git");
    await makeBareGitRepository(bare);
    const worktree = path.join(home.projectDir, "worktree");
    await makeGitWorktree(bare, worktree);
    const project = await projectWithAWritingAgentIn(worktree, "app");
    await trustRecordedUnder([bare]);

    expect(
      await claudeCompileNotices("claude", project),
      "Claude Code keys a bare repository's worktree by the bare repository's folder",
    ).toStrictEqual([]);
  });

  it("keys a folder by its own root when the worktree pointer it holds does not point back at it", async () => {
    const main = path.join(home.projectDir, "main");
    await makeGitRepositoryRoot(main);
    const worktree = path.join(home.projectDir, "worktree");
    await makeGitWorktree(path.join(main, ".git"), worktree);
    const borrower = path.join(home.projectDir, "borrower");
    const project = await projectWithAWritingAgentIn(borrower, "app");
    await copyFile(path.join(worktree, ".git"), path.join(borrower, ".git"));
    await trustRecordedUnder([main]);

    expect(
      await claudeCompileNotices("claude", project),
      "a pointer the worktree does not point back at is not a worktree to Claude Code",
    ).toStrictEqual([claudeProjectNeedsTrustMessage(project, 1)]);
  });
});

// The record is `$CLAUDE_CONFIG_DIR/.claude.json` while that is set, else `~/.claude.json`.
describe("a Claude install reads the trust record where CLAUDE_CONFIG_DIR puts it", () => {
  const STATE_FILE = ".claude.json";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function claudeConfigDirSet(): Promise<string> {
    const configDir = path.join(home.tempDir, "claude-config");
    await mkdir(configDir, { recursive: true });
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
    return configDir;
  }

  async function trustRecordedIn(dir: string, folder: string): Promise<void> {
    await writeFile(path.join(dir, STATE_FILE), JSON.stringify(buildClaudeTrustState([folder])));
  }

  it("says nothing once the record under CLAUDE_CONFIG_DIR trusts the folder", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await trustRecordedIn(await claudeConfigDirSet(), home.projectDir);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("does not take the home directory's record while CLAUDE_CONFIG_DIR names another", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await claudeConfigDirSet();
    await trustRecordedIn(home.fakeHome, home.projectDir);

    expect(
      await claudeCompileNotices("claude", home.projectDir),
      "Claude Code reads only the record under CLAUDE_CONFIG_DIR, so the gate is off",
    ).toStrictEqual([claudeProjectNeedsTrustMessage(home.projectDir, 1)]);
  });

  it("names the file under CLAUDE_CONFIG_DIR where Claude Code never asks", async () => {
    const configDir = await claudeConfigDirSet();
    const project = path.join(home.projectDir, "proj");
    await compiledInto(project, WRITING_AGENT, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
    await trustRecordedIn(configDir, home.projectDir);

    const notices = await claudeCompileNotices("claude", project);

    expect(notices).toHaveLength(1);
    expect(notices.join("\n")).toContain(path.join(configDir, STATE_FILE));
  });

  it("takes the home directory's record when CLAUDE_CONFIG_DIR is empty", async () => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", "");
    await writingAgentCompiled(WRITING_AGENT);
    await trustRecordedIn(home.fakeHome, home.projectDir);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });
});

describe("the words a Claude trust notice is in", () => {
  it("asks for the trust prompt, naming the folder and one sub-agent's hooks", () => {
    expect(claudeProjectNeedsTrustMessage("/work/app", 1)).toBe(
      "Claude Code runs a project sub-agent's hooks only once you trust the folder: open Claude Code in /work/app and accept the trust prompt. Until then, 1 sub-agent's hooks will not run, and nothing will say so.",
    );
  });

  it("counts several sub-agents in the plural, and names the record to set where Claude Code never asks", () => {
    expect(claudeProjectNeverAskedMessage("/work/app", 3)).toBe(
      `Claude Code runs 3 sub-agents' hooks only once you trust the folder, and will not ask here: set projects["/work/app"].hasTrustDialogAccepted to true in ${claudeStateFile()}.`,
    );
  });
});

describe("a Claude install at the root of a worktree whose own folder is the one recorded", () => {
  it("names the main checkout's record, since the worktree's own entry stops Claude Code asking", async () => {
    const main = path.join(home.projectDir, "main");
    await makeGitRepositoryRoot(main);
    const worktree = path.join(home.projectDir, "worktree");
    await makeGitWorktree(path.join(main, ".git"), worktree);
    await compiledInto(worktree, WRITING_AGENT, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
    await writeFile(claudeStateFile(), JSON.stringify(buildClaudeTrustState([worktree])));

    expect(await claudeCompileNotices("claude", worktree)).toStrictEqual([
      claudeProjectNeverAskedMessage(await realpath(main), 1),
    ]);
  });
});

describe("a Claude install whose .git pointer leads outside any worktrees folder", () => {
  it("keys the folder by its own root, even when the directory it points at points back", async () => {
    const elsewhere = path.join(home.projectDir, "store");
    const ownGitDir = path.join(elsewhere, "not-worktrees", "app");
    const project = path.join(home.projectDir, "app");
    await mkdir(ownGitDir, { recursive: true });
    await compiledInto(project, WRITING_AGENT, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
    await writeFile(path.join(project, ".git"), `gitdir: ${ownGitDir}\n`);
    await writeFile(path.join(ownGitDir, "commondir"), "../..\n");
    await writeFile(path.join(ownGitDir, "gitdir"), `${path.join(project, ".git")}\n`);
    await writeFile(claudeStateFile(), JSON.stringify(buildClaudeTrustState([elsewhere])));

    expect(await claudeCompileNotices("claude", project)).toStrictEqual([
      claudeProjectNeedsTrustMessage(project, 1),
    ]);
  });
});
