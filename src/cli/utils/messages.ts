import { CLI_INVOKE_COMMAND, DEFAULT_BRANDING } from "../consts.js";

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
} as const;
