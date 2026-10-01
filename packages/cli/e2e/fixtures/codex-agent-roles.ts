import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { mockProviderConfig, type CodexResponsesMock } from "./codex-responses-mock.js";
import { codexHome, listFiles } from "../helpers/test-utils.js";
import { DIRS, FILES } from "../pages/constants.js";

/**
 * What a C5 spec needs to look at the agent ROLE DEFINITION files a Codex compile writes, and to
 * ask the PINNED BINARY whether Codex read them.
 *
 * Everything here is one path join, one listing, or one argument list. The instruments themselves
 * — the pinned binary, the Responses mock, the global-config reset — stay in `codex.ts` and
 * `codex-responses-mock.ts`, because a spec asking "did Codex read it" must ask Codex.
 *
 * **The roster is the only instrument that can answer registration, and it is not on disk.**
 * `codex debug prompt-input` does NOT list agent roles — measured on 0.155.1, which is what made
 * an earlier pass conclude they did not exist. The roster travels in `spawn_agent`'s `agent_type`
 * parameter, inside an `additional_tools` item of the Responses request body, so the only way to
 * see it is to let the real binary compose one turn against a scripted stand-in and read what it
 * sent. {@link ROSTER_HEADING} is the line it introduces the roles with.
 *
 * **Calibrated both ways, and the negative is the calibration.** With no role registered,
 * `spawn_agent` has no `agent_type` parameter AT ALL — its properties are
 * `fork_turns, message, model, reasoning_effort, task_name`. With one registered, `agent_type`
 * appears and names it. So a spec that only asserts a role is present cannot tell a working rig
 * from a broken one, and every spec here pairs the two. Re-derived 2026-09-22 on the pinned
 * 0.155.1, HOME and CODEX_HOME pinned to a scratch directory, the global `config.toml` deleted
 * before each run.
 */

/**
 * Codex's own global configuration file, under `$CODEX_HOME`.
 *
 * A literal here rather than a `FILES` row, as every other Codex spec spells it: it is a THIRD
 * PARTY's filename, so there is no production constant for it to mirror and
 * `scripts/check-mirrored-constants.ts` would have nothing to compare it against.
 */
const CODEX_CONFIG_TOML = "config.toml";

/** Where a Codex PROJECT installation's compiled sub-agents go. */
export function codexProjectAgentsDir(projectDir: string): string {
  return path.join(projectDir, DIRS.CODEX, DIRS.AGENTS);
}

/** Where a Codex GLOBAL installation's do — under `$CODEX_HOME`, which moves with the variable. */
export function codexGlobalAgentsDir(home: string): string {
  return path.join(codexHome(home), DIRS.AGENTS);
}

/** Every role file in an agents directory, filename to contents. `{}` for a directory that is absent. */
export async function readCodexAgentRoles(dir: string): Promise<Record<string, string>> {
  const files = (await listFiles(dir)).filter((file) => file.endsWith(FILES.CODEX_AGENT_EXTENSION));
  const entries = await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(dir, file), "utf-8")] as const),
  );

  return Object.fromEntries(entries);
}

/**
 * The line Codex introduces the installed roles with, inside `spawn_agent`'s `agent_type`
 * description.
 *
 * MIRRORED from the binary rather than imported from anywhere, for the reason
 * `e2e/pages/constants.ts` gives at length — except that here the string is a THIRD PARTY's, so
 * there is nothing to import in the first place. It moving is a fact about a Codex release, and
 * this lane pins one exact release.
 */
export const ROSTER_HEADING = "Available roles:";

/**
 * The `spawn_agent` parameter that exists only once at least one role is registered.
 *
 * The negative half of every roster assertion: its ABSENCE is what "nothing was on the wire" looks
 * like, and it is the only form of that claim the request body can carry.
 */
export const ROSTER_PARAMETER = "agent_type";

/**
 * The two sub-agents left out of every Codex install for v1, by the owner's ruling.
 *
 * MIRRORED rather than imported from `@workspace/compile`, so a roster that stops dropping them
 * reddens here instead of moving both sides at once.
 */
export const CODEX_AGENTS_LEFT_OUT = ["agent-summoner", "skill-summoner"] as const;

/**
 * The six things a Codex agent role file has no way to express, spelled as the compile line
 * names them.
 *
 * "Claude models" was found on a real subscription (codex-cli 0.157.1, 2026-09-26): a role naming
 * one registers and then cannot be spawned, so compile never writes `model` into a role.
 *
 * The other five were measured against the pinned binary's deserializer, 2026-09-22: `tools` is a configuration struct
 * rather than an allowlist (`data did not match any variant of untagged enum
 * WebSearchToolConfigInput`), `permissionMode`, `isolation` and `experimental` are each an
 * `unknown field` that drops the WHOLE file, and `skills` is a bundled-skills toggle
 * (`{ enabled = true }`) rather than a preload list (`invalid type: string "a", expected struct
 * BundledSkillsConfig`).
 *
 * MIRRORED, for the same reason as {@link CODEX_AGENTS_LEFT_OUT}.
 */
export const CODEX_UNEXPRESSIBLE = [
  "Claude models",
  "tool allowlists",
  "permissionMode",
  "isolation",
  "experimental",
  "preloaded skills",
] as const;

/**
 * The global trust entry that decides whether Codex reads a PROJECT's role files at all.
 *
 * **Four silent kill switches, each measured, each producing nothing with no warning anywhere:**
 * no `[projects]` entry; `trust_level = "untrusted"`; a trailing slash on the path key; and the
 * entry declared in the project's OWN `.codex/config.toml`, which Codex correctly refuses as
 * self-authorisation. Only the exact absolute path in the GLOBAL config registers. Re-derived
 * 2026-09-22 across all five states in one sweep on the pinned 0.155.1.
 *
 * A spec writes this itself to stand in for a user who trusted their repository BEFORE the install.
 * The install now writes it too (owner, 2026-09-26, CLI-893) — `codex-agent-roles-are-read-by-codex.e2e.test.ts`
 * pins what it writes, and that it leaves an entry like this one alone.
 */
export async function trustProjectInCodexGlobalConfig(
  home: string,
  projectDir: string,
): Promise<void> {
  // `$CODEX_HOME` may not exist yet: a spec that trusts the project BEFORE the install has to
  // create it, exactly as the runner in `codex.ts` does before every call.
  await mkdir(codexHome(home), { recursive: true });
  await writeFile(
    path.join(codexHome(home), CODEX_CONFIG_TOML),
    `[projects."${projectDir}"]\ntrust_level = "trusted"\n`,
    "utf-8",
  );
}

/**
 * One `codex exec` turn against `mock`, under a sandbox that writes nothing.
 *
 * `--sandbox read-only` as a FLAG, not a `-c` override, and it is load-bearing:
 * {@link mockProviderConfig} sets `workspace-write`, under which `exec` writes
 * `[projects."<cwd>"] trust_level = "trusted"` into the global config itself. The tool under test
 * would then be setting the independent variable of every trust assertion — which has already
 * produced two contradictory measurements in this programme.
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

/** Everything the binary put on the wire in its first turn, as one string to assert against. */
export function firstRequestOf(mock: CodexResponsesMock): string {
  const first = mock.requests[0];
  if (first === undefined) throw new Error("Codex sent no Responses request");

  return JSON.stringify(first.body);
}
