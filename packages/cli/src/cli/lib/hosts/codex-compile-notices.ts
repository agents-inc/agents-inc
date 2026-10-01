import {
  agentsLeftOutOfCodexMessage,
  unexpressibleOnCodexMessage,
} from "@workspace/compile/agent-source";

import { codexProjectTrustMessage, trustCodexProject } from "./codex-project-trust.js";
import { agentCodec, agentsDir } from "../installation/install-layout.js";
import { glob } from "../../utils/fs.js";
import type { Provider } from "../../consts.js";

/**
 * What a Codex compile owes the user, once per RUN.
 *
 * Three facts, each true of the whole installation rather than of one sub-agent or one scope, and
 * each invisible anywhere else:
 *
 * 1. **Two sub-agents are absent.** All seventeen shipped stacks list both summoners, so this
 *    fires on every Codex install — which is exactly why it is one line for both rather than one
 *    per agent (two lines, forever) or one per stack (seventeen).
 * 2. **Six settings have no Codex expression.** The renderer omits them because Codex's
 *    deserializer drops the whole file on an unlisted key, and an omission nobody is told about is
 *    a sub-agent whose permission mode or preloaded skills silently stopped applying. Sixteen
 *    sub-agents across two scopes would be thirty-two lines of one fact.
 * 3. **A project's roles are unread until the project is trusted**, so the install trusts it in the
 *    user's global Codex config and says exactly what it wrote (owner, 2026-09-26, CLI-893) — or,
 *    where the user already set another `trust_level`, leaves it and says so.
 *
 * They are three separate sentences and do not merge: folded together, a user cannot tell whether
 * their reviewer exists from whether its tool list applies.
 *
 * Returned as lines rather than printed, so the two commands that compile — `init` and `compile` —
 * say the same thing in the same order, and neither can acquire a fourth sentence the other
 * does not have.
 */
export async function codexCompileNotices(
  provider: Provider,
  projectDir: string,
): Promise<string[]> {
  if (provider !== "codex") return [];

  return [
    agentsLeftOutOfCodexMessage(),
    unexpressibleOnCodexMessage(),
    ...(await trustNotice(projectDir)),
  ];
}

/**
 * The project's trust, written where it is needed, and the line that says what was done.
 *
 * Conditioned on role files actually being in the project's agents directory rather than on what
 * this run compiled, because the question is about the tree as it stands: a global-only
 * installation has no project roles for a trust entry to unlock, and writing one would grant
 * trust to a directory with nothing in it for Codex to read.
 *
 * Silent once the entry is there, which is what makes it a STATE rather than a banner.
 */
async function trustNotice(projectDir: string): Promise<string[]> {
  if (!(await holdsProjectRoles(projectDir))) return [];

  const said = codexProjectTrustMessage(projectDir, await trustCodexProject(projectDir));
  return said === undefined ? [] : [said];
}

/** Whether this project's own Codex agents directory holds any role file at all. */
async function holdsProjectRoles(projectDir: string): Promise<boolean> {
  const roles = await glob(agentCodec("codex").listGlob, agentsDir("codex", "project", projectDir));

  return roles.length > 0;
}
