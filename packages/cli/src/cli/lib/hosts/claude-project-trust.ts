import path from "path";

import { z } from "zod";

import { agentCodec, agentsDir, claudeStateFile } from "../installation/install-layout.js";
import { isHomeDirectory } from "../installation/is-home-directory.js";
import { fileExists, glob, readFile } from "../../utils/fs.js";
import type { Provider } from "../../consts.js";

/**
 * Whether Claude Code will run the completion gate a PROJECT installation just compiled — and the
 * line that says so when it will not.
 *
 * **Every writing sub-agent carries one.** Compile gives each sub-agent holding `Write` or `Edit` a
 * `Stop` hook that runs the project's typecheck (`withCompletionGate` in `@workspace/compile`'s
 * `agent-source.ts`), unless the sub-agent declares a `Stop` or `SubagentStop` hook of its own,
 * which is then its completion gate instead. Either way it is one frontmatter line: `hooks:` and a
 * JSON record holding at least one hook under that event — a key holding an empty list states no
 * gate, which is how compile's `declaresOwnGate` reads it too.
 *
 * **A project sub-agent's hooks run only in a folder the user has trusted.** Read from the shipped
 * binary 2.1.259 (`compilation-pipeline.md` → "Frontmatter hooks are gated on the trust dialog"):
 * before registering an agent's frontmatter hooks, Claude Code checks the folder its definition
 * came from, and for `<project>/.claude/agents/` that is
 * `projects[<project>].hasTrustDialogAccepted` in `~/.claude.json`. Absent or `false`, the
 * sub-agent loads, its prompt loads, and its completion gate is dropped. Claude Code logs that to
 * its own diagnostics and nowhere a user looks, so a completion gate in an untrusted folder is
 * indistinguishable from one that found nothing.
 *
 * **So the install says it, and only while it is true.** Owner, 2026-09-26: _"yes ofc"_ to telling
 * the user. It is the Claude sibling of `codex-project-trust.ts`, and it READS the host's state and
 * never writes it — accepting the dialog is the user's act. A global installation needs nothing:
 * Claude Code trusts `~/.claude/agents/` unconditionally, and that folder is also the project
 * agents directory of a run from the home directory, so such a run says nothing either.
 */

/** The part of `~/.claude.json` this reads. Every other project's record is left unparsed. */
const claudeStateSchema = z.object({ projects: z.record(z.string(), z.unknown()) });

/** One project's record, answering only the question asked of it. */
const trustedProjectSchema = z.object({ hasTrustDialogAccepted: z.literal(true) });

/**
 * The frontmatter line a completion gate is written on: `hooks:` with `Stop` or `SubagentStop` as a
 * key holding at least one definition. A line naming only other events is a hook, and nothing this
 * notice is about; an empty list under the key states no gate. The template writes the record
 * through Liquid's `json` filter, compact, which is why the key and its first `{` are adjacent.
 */
const STOP_HOOK_LINE = /^hooks:\s*\{.*"(Stop|SubagentStop)":\[\{/m;
const FRONTMATTER_FENCE = "---";

/**
 * The notice a Claude install owes when this project holds sub-agents carrying a completion gate
 * and the folder is not trusted, as lines — empty for every other provider, for a run from the
 * home directory, for a trusted project, and for one whose sub-agents carry none.
 */
export async function claudeCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  if (provider !== "claude") return [];
  if (isHomeDirectory(projectDir)) return [];

  const withAStopHook = await projectAgentsWithAStopHook(projectDir);
  if (withAStopHook.length === 0) return [];
  if (await claudeTrustsProject(projectDir)) return [];

  return [claudeProjectNeedsTrustMessage(projectDir, withAStopHook.length)];
}

/** Whether `~/.claude.json` records this exact project's trust dialog as accepted. */
export async function claudeTrustsProject(projectDir: string): Promise<boolean> {
  const stateFile = claudeStateFile();
  if (!(await fileExists(stateFile))) return false;

  return acceptedTrustDialog(await readFile(stateFile), projectDir);
}

/**
 * The line itself. It names the folder and the remedy, because the failure it warns about prints
 * nothing anywhere a user would read.
 */
export function claudeProjectNeedsTrustMessage(projectDir: string, count: number): string {
  const subject =
    count === 1 ? "1 sub-agent's completion gate" : `${count} sub-agents' completion gates`;
  return (
    `Claude Code runs a project sub-agent's completion gate (its Stop hook — the project's ` +
    `typecheck, unless the sub-agent declares its own) only once you trust the folder: open ` +
    `Claude Code in ${projectDir} and accept the trust prompt. Until then, ${subject} will not ` +
    `run, and nothing will say so.`
  );
}

/**
 * Whether `stateJson` holds `projects[projectDir].hasTrustDialogAccepted === true`. Anything it
 * cannot read counts as untrusted, which is the safe direction: the cost of a wrong "untrusted" is
 * one line of advice, and the cost of a wrong "trusted" is a completion gate nobody knows is off.
 */
function acceptedTrustDialog(stateJson: string, projectDir: string): boolean {
  const state = claudeStateSchema.safeParse(parsedOrUndefined(stateJson));
  if (!state.success) return false;

  return trustedProjectSchema.safeParse(state.data.projects[projectDir]).success;
}

function parsedOrUndefined(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** The compiled sub-agents in this project's own agents directory that carry a completion gate. */
async function projectAgentsWithAStopHook(projectDir: string): Promise<string[]> {
  const dir = agentsDir("claude", "project", projectDir);
  const files = await glob(agentCodec("claude").listGlob, dir);
  const carriers = await Promise.all(
    files.map(async (file) => ((await carriesAStopHook(path.join(dir, file))) ? [file] : [])),
  );
  return carriers.flat();
}

async function carriesAStopHook(agentFile: string): Promise<boolean> {
  const [, frontmatter = ""] = (await readFile(agentFile)).split(FRONTMATTER_FENCE);
  return STOP_HOOK_LINE.test(frontmatter);
}
