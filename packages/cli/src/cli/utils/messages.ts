import { CLI_INVOKE_COMMAND, DEFAULT_BRANDING, STANDARD_FILES } from "../consts.js";

export const ERROR_MESSAGES = {
  UNKNOWN_ERROR: "Unknown error occurred",
  UNKNOWN_ERROR_SHORT: "Unknown error",
  NO_INSTALLATION: `No installation found. Run '${CLI_INVOKE_COMMAND} init' first to set up ${DEFAULT_BRANDING.NAME}`,
  NO_LOCAL_SKILLS: `No local skills found. Run \`${CLI_INVOKE_COMMAND} init\` or \`${CLI_INVOKE_COMMAND} edit\` first.`,
  NO_SKILLS_FOUND: "No skills found",
  VALIDATION_FAILED: "Validation failed",
  FAILED_RESOLVE_SOURCE: "Failed to resolve source",
  FAILED_LOAD_AGENT_PARTIALS: "Failed to load agent partials",
  FAILED_COMPILE_AGENTS: "Failed to compile agents",
  SKILL_NOT_FOUND: "Skill not found",
} as const;

export const SUCCESS_MESSAGES = {
  UNINSTALL_COMPLETE: "Uninstall complete!",
  INIT_SUCCESS: `${DEFAULT_BRANDING.NAME} initialized successfully!`,
  PLUGIN_COMPILE_COMPLETE: "Plugin compile complete!",
  ALL_SKILLS_UP_TO_DATE: "All skills are up to date.",
} as const;

export const STATUS_MESSAGES = {
  LOADING_SKILLS: "Loading skills...",
  LOADING_MARKETPLACE_SOURCE: "Loading marketplace source...",
  RECOMPILING_AGENTS: "Recompiling agents...",
  COMPILING_AGENTS: "Compiling agents...",
  DISCOVERING_SKILLS: "Discovering skills...",
  RESOLVING_SOURCE: "Resolving source...",
  RESOLVING_MARKETPLACE_SOURCE: "Resolving marketplace source...",
  LOADING_AGENT_PARTIALS: "Loading agent partials...",
  FETCHING_REPOSITORY: "Fetching repository...",
  COPYING_SKILLS: "Copying skills...",
  UPDATING_PLUGIN_SKILLS: "Updating plugin skills...",
} as const;

export const INFO_MESSAGES = {
  NO_CHANGES_MADE: "No changes made.",
  RUN_COMPILE: `Run '${CLI_INVOKE_COMMAND} compile' to include imported skills in your agents.`,
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  NO_PLUGIN_INSTALLATION: "No plugin installation found.",
  NO_LOCAL_INSTALLATION: "No local installation found.",
  NOT_INSTALLED: `${DEFAULT_BRANDING.NAME} is not installed in this project.`,
  CONFIG_TYPES_REFRESHED: `Refreshed ${STANDARD_FILES.CONFIG_TYPES_TS}`,
} as const;

/**
 * Hint printed when a project-context compile resolves zero project agents but
 * the config still declares global-scope agents. Names the global context and
 * the count so the "No agents to recompile" no-op isn't silent after a global
 * stack change.
 */
export function globalScopedAgentsHint(count: number): string {
  const subject = count === 1 ? "agent is" : "agents are";
  return `${count} ${subject} global-scoped — run '${CLI_INVOKE_COMMAND} compile' from your home directory, or edit from this project, to recompile them.`;
}

/**
 * Warning printed when a compile pass finished but the scope's config-types.ts
 * could not be regenerated (e.g. the skills source was unreachable). The compiled
 * agents are fine; only the type unions may still be stale.
 */
export function configTypesRefreshFailed(reason: string): string {
  return `Could not refresh ${STANDARD_FILES.CONFIG_TYPES_TS} — type unions may be stale: ${reason}`;
}

/**
 * Summary printed after a global uninstall pruned the inlined global-scoped
 * config entries from the registered projects.
 */
export function registeredProjectsUpdated(count: number): string {
  return `Updated ${count} registered ${count === 1 ? "project" : "projects"}`;
}

/**
 * Warning printed when a global uninstall could not update one registered
 * project (missing directory or unreadable config). The uninstall continues.
 */
export function registeredProjectUpdateSkipped(projectPath: string): string {
  return `Could not update registered project at ${projectPath} — its config may still reference the uninstalled global content`;
}

/**
 * Warning printed when a global uninstall could not update the registered
 * projects at all (e.g. the skills source failed to load). The uninstall
 * itself still completes.
 */
export function registeredProjectsUpdateFailed(reason: string): string {
  return `Could not update registered projects — their configs may still reference the uninstalled global content: ${reason}`;
}
