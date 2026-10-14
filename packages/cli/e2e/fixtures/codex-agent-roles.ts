import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { mockProviderConfig, type CodexResponsesMock } from "./codex-responses-mock.js";
import { codexHome, listFiles } from "../helpers/test-utils.js";
import { DIRS, FILES } from "../pages/constants.js";

/**
 * Registration is visible only in `spawn_agent`'s `agent_type` parameter in the Responses request,
 * which is absent with no role registered, so roster assertions pair a present role with that
 * absence.
 */

/** Codex's own filename, so there is nothing to mirror. */
const CODEX_CONFIG_TOML = "config.toml";

export function codexProjectAgentsDir(projectDir: string): string {
  return path.join(projectDir, DIRS.CODEX, DIRS.AGENTS);
}

/** Under `$CODEX_HOME`, which moves with the variable. */
export function codexGlobalAgentsDir(home: string): string {
  return path.join(codexHome(home), DIRS.AGENTS);
}

/** `{}` for an absent directory. */
export async function readCodexAgentRoles(dir: string): Promise<Record<string, string>> {
  const files = (await listFiles(dir)).filter((file) => file.endsWith(FILES.CODEX_AGENT_EXTENSION));
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(dir, file), "utf-8")] as const),
  );

  return Object.fromEntries(entries);
}

/** Mirrored from the pinned Codex release's own text. */
export const ROSTER_HEADING = "Available roles:";

/** Present only once a role is registered: the negative half of every roster assertion. */
export const ROSTER_PARAMETER = "agent_type";

/** Mirrored rather than imported, so the roster cannot move both sides at once. */
export const CODEX_AGENTS_LEFT_OUT = ["agent-summoner", "skill-summoner"] as const;

/** Mirrored, as above. */
export const CODEX_UNEXPRESSIBLE = [
  "Claude models",
  "tool allowlists",
  "permissionMode",
  "isolation",
  "experimental",
  "preloaded skills",
] as const;

/** Mirrored from `CODEX_MODEL_NAMES`, so the product cannot move the list alone. */
export const CODEX_OFFERED_MODELS = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;

export const ROLE_MODEL_LEAD = "This role's model is set to";

export function roleModelSentence(model: string): string {
  return `${ROLE_MODEL_LEAD} \`${model}\``;
}

/**
 * Only the exact absolute path in the GLOBAL config registers a project's roles; no entry,
 * `untrusted`, a trailing slash or a project-local entry all silently register nothing (0.155.1,
 * 2026-09-22). Stands in for a user who trusted the repository before the install.
 */
export async function trustProjectInCodexGlobalConfig(
  home: string,
  projectDir: string,
): Promise<void> {
  // A spec may trust the project before the install creates `$CODEX_HOME`.
  await mkdir(codexHome(home), { recursive: true });
  await writeFile(
    path.join(codexHome(home), CODEX_CONFIG_TOML),
    `[projects."${projectDir}"]\ntrust_level = "trusted"\n`,
    "utf-8",
  );
}

/**
 * `--sandbox read-only` as a flag is load-bearing: under {@link mockProviderConfig}'s
 * `workspace-write`, `exec` writes the trust entry itself.
 */
export function readOnlyExecArgs(mock: CodexResponsesMock, prompt: string): string[] {
  return [
    "exec",
    ...mockProviderConfig(mock),
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    prompt,
  ];
}

export function firstRequestOf(mock: CodexResponsesMock): string {
  const first = mock.requests[0];
  if (first === undefined) throw new Error("Codex sent no Responses request");

  return JSON.stringify(first.body);
}
