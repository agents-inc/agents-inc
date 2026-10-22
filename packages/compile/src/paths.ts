// The browser-safe half of the CLI's `consts.ts`, which re-exports all of it.

export const CLAUDE_DIR = ".claude"

/** Every provider's source folder sits under this one parent. */
export const SOURCE_ROOT_DIR = ".agents-inc"

/** Source root inside a marketplace/source repo. */
export const SOURCE_SRC_DIR = "src"

export const SKILLS_DIR_PATH = `${SOURCE_SRC_DIR}/skills`

export const LOCAL_SKILLS_PATH = ".claude/skills"

export const DEFAULT_PLUGIN_NAME = "agents-inc"

/** The public marketplace's fallback name; same value as the plugin name, a distinct concept. */
export const DEFAULT_PUBLIC_SOURCE_NAME = "agents-inc"

export const GITHUB_PREFIX = "github:"

/** The marketplace read when nothing names one. */
export const DEFAULT_SOURCE = `${GITHUB_PREFIX}agents-inc/skills`

/**
 * The form every user-facing command is written in; the published package name, so `npx` resolves
 * it with nothing installed.
 */
export const CLI_INVOKE_COMMAND = "npx agents-inc"

export const EJECT_SOURCE = "eject"

/** Not a `Category` union member; category traversals skip it. */
export const LOCAL_PSEUDO_CATEGORY = "local"

export const GLOBAL_CONFIG_NAME = "global"

export const DIRS = {
  agents: "src/agents",
  skills: SKILLS_DIR_PATH,
  stacks: "src/stacks",
  templates: "src/agents/_templates",
} as const

const METADATA_YAML_FILE = "metadata.yaml"

export const PLUGIN_MANIFEST_FILE = "plugin.json"

export const STANDARD_FILES = {
  SKILL_MD: "SKILL.md",
  METADATA_YAML: METADATA_YAML_FILE,
  METADATA_JSON: "metadata.json",
  CONFIG_YAML: "config.yaml",
  SKILL_CATEGORIES_TS: "skill-categories.ts",
  SKILL_RULES_TS: "skill-rules.ts",
  AGENT_METADATA_YAML: METADATA_YAML_FILE,
  PLUGIN_JSON: PLUGIN_MANIFEST_FILE,
  CONFIG_TS: "config.ts",
  CONFIG_TYPES_TS: "config-types.ts",
  CLAUDE_MD: "CLAUDE.md",
  README_MD: "README.md",
  REFERENCE_MD: "reference.md",
  IDENTITY_MD: "identity.md",
  PLAYBOOK_MD: "playbook.md",
  OUTPUT_MD: "output.md",
  CRITICAL_REQUIREMENTS_MD: "critical-requirements.md",
  CRITICAL_REMINDERS_MD: "critical-reminders.md",
  SETTINGS_JSON: "settings.json",
  SETTINGS_LOCAL_JSON: "settings.local.json",
  PACKAGE_JSON: "package.json",
} as const

export const STANDARD_DIRS = {
  EXAMPLES: "examples",
  SCRIPTS: "scripts",
  SKILLS: "skills",
  AGENTS: "agents",
  /** Legacy per-project template override directory. */
  TEMPLATES: "templates",
} as const
