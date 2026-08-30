/**
 * The path vocabulary a rendered installation is described in.
 *
 * This is the half of the CLI's `src/cli/consts.ts` that a browser can hold. The
 * half that stayed behind is the half that reads the machine — `PROJECT_ROOT` is
 * derived with `fileURLToPath(import.meta.url)` at module load and
 * `globalInstallRoot()` calls `os.homedir()` — and every renderer here reached
 * that module for these ten names alone. `consts.ts` re-exports every one of
 * them, so no CLI call site moved.
 */

/** Where an installation's compiled agents and ejected skills live, under its base directory. */
export const CLAUDE_DIR = ".claude"

/** Where an installation's config pair lives, under its base directory. */
export const CLAUDE_SRC_DIR = ".claude-src"

/** Source root directory inside a marketplace/source repo (holds skills/, agents/, etc.). */
export const SOURCE_SRC_DIR = "src"

export const SKILLS_DIR_PATH = `${SOURCE_SRC_DIR}/skills`

export const LOCAL_SKILLS_PATH = ".claude/skills"

export const DEFAULT_PLUGIN_NAME = "agents-inc"

/**
 * Fallback name for the default public marketplace when marketplace.json is
 * unavailable. Same value as {@link DEFAULT_PLUGIN_NAME} but a distinct concept:
 * this is the resolved source/marketplace name, that is the plugin bundle name.
 *
 * Two guards read it and must agree, which is why it is one declaration:
 * `validateMarketplaceName` exempts the catalogue from the reserved-name refusal
 * at BUILD time, and the collision guard in `lib/loading/source-loader.ts`
 * exempts it from the catalogue-id refusal at LOAD time.
 */
export const DEFAULT_PUBLIC_SOURCE_NAME = DEFAULT_PLUGIN_NAME

/**
 * Promoted invocation prefix shown in user-facing messages (e.g. "Run '<CLI_INVOKE_COMMAND> init'").
 *
 * `bin` in package.json registers BOTH names — `agents-inc` (primary, matching this constant and
 * the package name) and `agentsinc` (kept so existing global installs keep working). A global
 * install therefore answers to either spelling.
 *
 * `agents-inc` rather than `agentsinc` because it is the published package name, so `npx
 * agents-inc` resolves with nothing installed, and it is what agentsinc.sh hands people when they
 * copy an install command.
 *
 * CONVENTION: every user-facing instruction in this repo — messages, docs, code comments, agent
 * playbooks — writes commands in this `npx agents-inc <cmd>` form. Prose that merely names a
 * command ("the `agents-inc list` table") does not.
 */
export const CLI_INVOKE_COMMAND = "npx agents-inc"

/** Synthetic source name for skills copied into the project (ejected) rather than installed as plugins. */
export const EJECT_SOURCE = "eject"

/** Pseudo-category assigned to local skills — not a `Category` union member; category traversals skip it. */
export const LOCAL_PSEUDO_CATEGORY = "local"

/** Name written into a global-scope config's `name` field (`~/.claude-src/config.ts`). */
export const GLOBAL_CONFIG_NAME = "global"

export const DIRS = {
  agents: "src/agents",
  skills: SKILLS_DIR_PATH,
  stacks: "src/stacks",
  templates: "src/agents/_templates",
} as const

/** Single source for the metadata file name shared by skill and agent metadata. */
const METADATA_YAML_FILE = "metadata.yaml"

/** The manifest a plugin bundle carries, inside its `.claude-plugin/` directory. */
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
  /** Legacy per-project template override directory (`.claude/templates`). */
  TEMPLATES: "templates",
} as const
