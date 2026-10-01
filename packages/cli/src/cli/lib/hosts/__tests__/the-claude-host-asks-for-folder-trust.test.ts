import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderAgentMd } from "../../__tests__/content-generators.js";
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
