import path from "path";

import { CLI, type CLIResult } from "./cli.js";
import { codexHome } from "../helpers/test-utils.js";
import { DIRS } from "../pages/constants.js";

import type { ProjectHandle } from "./project-handle.js";
import type { SeedConfigStore } from "./seed-config-store.js";

// The provider arrives only on the command, so the folder on disk is what assertions read.

export const PROVIDER_CODEX = ["--provider", "codex"] as const;

export const PROVIDER_CLAUDE = ["--provider", "claude"] as const;

// Mirrors `lib/hosts/offered-placements.ts`; plugin+project is absent because Codex has no per-project plugin install.
export const CODEX_OFFERED_CELLS = ["plugin+global", "eject+global", "eject+project"] as const;

export const CODEX_REFUSED_CELL = "plugin+project";

export const CODEX_SOURCE_REL = DIRS.SOURCE_CODEX;

/** The folder a Codex run must never create. */
export const CLAUDE_SOURCE_REL = DIRS.SOURCE_CLAUDE;

// `$CODEX_HOME/skills`, not `~/.agents/skills`, which is a shared namespace this product does not own.
export function codexGlobalSkillsDir(home: string): string {
  return path.join(codexHome(home), DIRS.SKILLS);
}

// `<repo>/.agents/skills` is what Codex reads for a project skill; it never reads `<repo>/skills/`.
export function codexProjectSkillsDir(projectDir: string): string {
  return path.join(projectDir, DIRS.CODEX_PROJECT_SKILLS);
}

export function codexPluginCacheDir(home: string): string {
  return path.join(codexHome(home), DIRS.PLUGINS, "cache");
}

export function runInitFromOnCodex(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  sourceDir: string,
  extraArgs: readonly string[] = [],
): Promise<CLIResult> {
  return CLI.run(
    ["init", "--from", id, "--marketplace", sourceDir, ...PROVIDER_CODEX, ...extraArgs],
    project,
    { env: { AGENTS_INC_API_URL: store.url } },
  );
}

export function runInitFromOnClaude(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  sourceDir: string,
): Promise<CLIResult> {
  return CLI.run(["init", "--from", id, "--marketplace", sourceDir], project, {
    env: { AGENTS_INC_API_URL: store.url },
  });
}
