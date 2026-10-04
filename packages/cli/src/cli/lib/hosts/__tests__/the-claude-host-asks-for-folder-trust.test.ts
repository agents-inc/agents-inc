import { copyFile, mkdir, writeFile } from "node:fs/promises";
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
import { claudeCompileNotices, claudeProjectNeedsTrustMessage } from "../claude-project-trust.js";

/**
 * A Claude install says so when its project sub-agents' completion gate cannot run in this folder.
 *
 * Compile gives every writing sub-agent a completion gate, a `Stop` hook that runs the project's
 * typecheck. Claude Code drops a PROJECT sub-agent's frontmatter hooks until `~/.claude.json`
 * records that project's trust dialog as accepted (read from the shipped binary 2.1.259 — see
 * `compilation-pipeline.md`), and says so only in its own diagnostics. So a completion gate in an
 * untrusted folder looks exactly like one that found nothing. Owner, 2026-09-26: the install tells
 * the user.
 *
 * Every "says nothing" case is paired with the untrusted writing sub-agent that does speak, so a
 * notice that never printed could not pass this file.
 */

const WRITING_AGENT = "web-developer";
const READ_ONLY_AGENT = "web-researcher";

/** Tools holding `Write` or `Edit`, which earn a sub-agent the completion gate, and tools without. */
const WRITING_TOOLS = ["Read", "Write", "Edit"];
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];

/** The completion gate as compile writes it — its command is not the subject, its event is. */
const A_STOP_HOOK = JSON.stringify({
  Stop: [{ hooks: [{ type: "command", command: "npm run --if-present --silent typecheck" }] }],
});

/** A completion gate a sub-agent declared itself, which compile keeps in place of its own. */
const A_SUBAGENT_STOP_HOOK = JSON.stringify({
  SubagentStop: [{ hooks: [{ type: "command", command: "npm test" }] }],
});

/** A hook on another event, which is not a completion gate. */
const A_POST_TOOL_USE_HOOK = JSON.stringify({
  PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo ran" }] }],
});

/** A `Stop` key holding nothing, which states no completion gate — compile reads it the same way. */
const AN_EMPTY_STOP_HOOK = JSON.stringify({ Stop: [] });

let home: IsolatedHome;

beforeEach(async () => {
  home = await setupIsolatedHome("claude-folder-trust-");
});

afterEach(async () => {
  await home.cleanup();
});

/** A sub-agent compiled at project scope with `projectDir` as the project. */
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

/** A writing sub-agent as compile writes it, carrying the completion gate it was given. */
async function writingAgentCompiled(name: string, stopHook = A_STOP_HOOK): Promise<void> {
  await compiledIntoTheProject(name, { tools: WRITING_TOOLS, hooks: stopHook });
}

/**
 * A writing sub-agent compiled from the home directory, where the project's agents folder IS the
 * global one, `~/.claude/agents/`.
 */
async function writingAgentCompiledFromHome(name: string): Promise<void> {
  await compiledInto(os.homedir(), name, { tools: WRITING_TOOLS, hooks: A_STOP_HOOK });
}

/** A read-only sub-agent: no completion gate from compile, only the hooks it declared, if any. */
async function readOnlyAgentCompiled(name: string, declaredHooks?: string): Promise<void> {
  await compiledIntoTheProject(
    name,
    declaredHooks === undefined
      ? { tools: READ_ONLY_TOOLS }
      : { tools: READ_ONLY_TOOLS, hooks: declaredHooks },
  );
}

/** `~/.claude.json` recording this project's trust dialog with `accepted` as its answer. */
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

  it("speaks for a completion gate the sub-agent declared under SubagentStop", async () => {
    await writingAgentCompiled(WRITING_AGENT, A_SUBAGENT_STOP_HOOK);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([
      claudeProjectNeedsTrustMessage(home.projectDir, 1),
    ]);
  });

  it("says nothing about a project whose sub-agents carry no completion gate", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT);

    expect(await claudeCompileNotices("claude", home.projectDir)).toStrictEqual([]);
  });

  it("says nothing about a sub-agent whose only hook is on another event", async () => {
    await readOnlyAgentCompiled(READ_ONLY_AGENT, A_POST_TOOL_USE_HOOK);

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

  it("counts only the sub-agents carrying a completion gate", async () => {
    await writingAgentCompiled(WRITING_AGENT);
    await writingAgentCompiled("web-tester");
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

/**
 * Where Claude Code keeps the answer, and when it asks — read from the shipped binary 2.1.288 and
 * watched under a scratch HOME on 2026-10-03.
 *
 * - **The record is keyed by the git repository root.** Accepting the prompt in `mono/app` writes
 *   `projects["…/mono"]` and nothing for `mono/app`, and the hook gate reads the same key: the
 *   folder's repository root, or the folder itself outside any repository.
 * - **The prompt is skipped below a trusted folder.** Its check walks up from the folder to the
 *   repository root, or to `/` outside any repository, so a plain folder below a trusted one is
 *   never asked — while the gate still reads the folder's own key and keeps the hooks off.
 * - **A repository root is asked for itself.** The walk stops at the root, so a repository below a
 *   trusted plain folder still gets the prompt.
 *
 * Each case that must change is paired with one where the line, remedy included, must stay.
 */
describe("a Claude install reads the trust record the way Claude Code does", () => {
  /** The remedy clause: only true where Claude Code will actually show the prompt. */
  const TRUST_PROMPT_REMEDY = "accept the trust prompt";
  /** The clause every untrusted line carries: the gate is off. */
  const GATE_OFF = "only once you trust the folder";

  /** The record Claude Code's own diagnostic tells the user to set, for the folder keyed `key`. */
  function recordToSet(key: string): string {
    return `projects[${JSON.stringify(key)}].hasTrustDialogAccepted`;
  }

  /** `~/.claude.json` with the trust dialog recorded as accepted under each of `keys`. */
  async function trustRecordedUnder(keys: string[]): Promise<void> {
    await writeFile(claudeStateFile(), JSON.stringify(buildClaudeTrustState(keys)));
  }

  /** A folder below `parent`, holding a writing sub-agent compiled at project scope. */
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

/**
 * Where the record lives. Claude Code keeps its state in `$CLAUDE_CONFIG_DIR/.claude.json` while
 * that variable names a directory, and in `~/.claude.json` while it is unset or empty — watched
 * with Claude Code 2.1.288 under a scratch HOME on 2026-10-03. Read anywhere else, the line stays
 * after the folder is trusted, and the never-asks remedy names a file Claude Code does not read.
 */
describe("a Claude install reads the trust record where CLAUDE_CONFIG_DIR puts it", () => {
  /** Claude Code's state file, by the name it has under either directory. */
  const STATE_FILE = ".claude.json";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** A directory outside the home, named by CLAUDE_CONFIG_DIR. */
  async function claudeConfigDirSet(): Promise<string> {
    const configDir = path.join(home.tempDir, "claude-config");
    await mkdir(configDir, { recursive: true });
    vi.stubEnv("CLAUDE_CONFIG_DIR", configDir);
    return configDir;
  }

  /** The state file in `dir`, recording the trust dialog as accepted for `folder`. */
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
