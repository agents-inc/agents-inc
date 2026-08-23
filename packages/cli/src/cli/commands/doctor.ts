import os from "os";
import path from "path";
import { BaseCommand } from "../base-command";
import { getErrorMessage } from "../utils/errors";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  effectivelyExcludedSkillIds,
  loadProjectConfigFromDir,
  validateProjectConfig,
  SOURCE_ENV_VAR,
  type ResolvedConfig,
} from "../lib/configuration";
import { loadSource, detectProject, type DetectedProject } from "../lib/operations";
import { matrix } from "../lib/matrix/matrix-provider";
import { discoverLocalSkills } from "../lib/skills";
import { getStackSkillIds } from "../lib/stacks";
import { filterExcludedEntries, listAgentMdFiles } from "../lib/agents";
import { getVerifiedPluginInstallPaths, parseMarketplacePluginRef } from "../lib/plugins";
import {
  declaresNoContent,
  isHomeDirectory,
  installBaseDir,
  resolveInstallPaths,
} from "../lib/installation";
import { getProjectConfigPath } from "../lib/configuration";
import { isSourceRepo } from "../lib/source-validator";
import {
  listInstalledArtifacts,
  validateInstalledAgents,
  validateInstalledPlugins,
  validateInstalledSkills,
  validateProjectConfigFile,
  validateRegisteredSources,
  type ContentIssue,
  type ContentValidation,
} from "../lib/content-validator";
import type { SourceLoadResult } from "../lib/loading";
import type { MergedSkillsMatrix, ProjectConfig, SkillConfig } from "../types";
import { fileExists, directoryExists } from "../utils/fs";
import {
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
  UI_SYMBOLS,
} from "../consts";
import { countBy, unique } from "remeda";

type CheckKind =
  | "config"
  | "config-empty"
  | "skills"
  | "agents"
  | "orphans"
  | "orphans-unowned"
  | "installed"
  | "plugins"
  | "source"
  | "content-config"
  | "content-sources"
  | "content-plugins"
  | "content-skills"
  | "content-agents";

type CheckResult = {
  kind: CheckKind;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  details?: string[];
};

type ConfigCheckOutput = {
  result: CheckResult;
  config: ProjectConfig | null;
};

/**
 * Which state the config these rows describe is in. `detectInstallation` answers "is there an
 * installation here", not "is there a config here", and hands back the same `null` for an absent
 * file and for one that loads while declaring neither skills nor agents — two states that need
 * different sentences. The state missing from this union is the one that cannot reach this layer:
 * a config that cannot be READ is the content layer's finding, and it skips the operational layer.
 */
type ConfigState =
  | { kind: "absent" }
  | { kind: "declares-nothing"; config: ProjectConfig }
  | { kind: "loaded"; config: ProjectConfig };

/** Project-relative path to the config file, shown in doctor messages. */
const CONFIG_TS_REL = `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`;

/**
 * The config in THIS directory, and what state it is in. Only this directory: the global fallback
 * is `detectInstallation`'s to make and it has already made it, so a project with no config of its
 * own is absent here whatever the home directory holds — `init` writes exactly the declares-nothing
 * shape as the blank global pair on every project setup, and it is not this project's config.
 *
 * The load cannot throw: `configDirsInPlay` is the same set the content layer just read, and any
 * failure in it skipped this layer entirely.
 */
async function resolveConfigState(
  detected: DetectedProject | null,
  projectDir: string,
): Promise<ConfigState> {
  if (detected?.config) return { kind: "loaded", config: detected.config };

  const loaded = await loadProjectConfigFromDir(projectDir);
  if (!loaded) return { kind: "absent" };

  return declaresNoContent(loaded.config)
    ? { kind: "declares-nothing", config: loaded.config }
    : { kind: "loaded", config: loaded.config };
}

function checkConfigValid(state: ConfigState): ConfigCheckOutput {
  if (state.kind === "absent") {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: `${CONFIG_TS_REL} not found`,
        details: [`Run '${CLI_INVOKE_COMMAND} init' to create a configuration`],
      },
      config: null,
    };
  }

  // Not a fault and nothing to repair — the file is valid, it just has nothing in it. The config
  // is still handed on: the rows below describe an empty install truthfully, where a `null` would
  // have them all report `Skipped (config invalid)` about a config that is valid.
  if (state.kind === "declares-nothing") {
    return {
      result: {
        kind: "config-empty",
        status: "warn",
        message: `${CONFIG_TS_REL} is valid but declares no skills and no agents`,
      },
      config: state.config,
    };
  }

  const { config } = state;
  const validation = validateProjectConfig(config);

  if (!validation.valid) {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: `${CONFIG_TS_REL} has errors`,
        details: validation.errors,
      },
      config: null,
    };
  }

  if (validation.warnings.length > 0) {
    return {
      result: {
        kind: "config",
        status: "warn",
        message: `${CONFIG_TS_REL} has warnings`,
        details: validation.warnings,
      },
      config,
    };
  }

  return {
    result: {
      kind: "config",
      status: "pass",
      message: `${CONFIG_TS_REL} is valid`,
    },
    config,
  };
}

async function checkSkillsResolved(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): Promise<CheckResult> {
  // config.ts declares skills both directly and through the stack. A global-only
  // install has a populated skills array and no stack at all, so keying this check
  // off the stack alone would report "No skills configured" for a real install.
  const excludedIds = effectivelyExcludedSkillIds(config.skills);
  const stackIds = config.stack ? getStackSkillIds(config.stack) : [];
  const uniqueSkills = unique([...stackIds, ...config.skills.map((s) => s.id)]).filter(
    (id) => !excludedIds.has(id),
  );

  if (uniqueSkills.length === 0) {
    return {
      kind: "skills",
      status: "pass",
      message: "No skills configured",
    };
  }

  const [localResult, globalResult] = await Promise.all([
    discoverLocalSkills(projectDir),
    !isHomeDirectory(projectDir) ? discoverLocalSkills(os.homedir()) : null,
  ]);
  const localSkillIds = new Set([
    ...(localResult?.skills.map((s) => s.id) ?? []),
    ...(globalResult?.skills.map((s) => s.id) ?? []),
  ]);

  const missingSkills = uniqueSkills.filter(
    (skillId) => !(skillId in matrix.skills) && !localSkillIds.has(skillId),
  );

  if (missingSkills.length > 0) {
    return {
      kind: "skills",
      status: "fail",
      message: `${uniqueSkills.length - missingSkills.length}/${uniqueSkills.length} skills found`,
      details: missingSkills.map((s) => `- ${s} (not found)`),
    };
  }

  return {
    kind: "skills",
    status: "pass",
    message: `${uniqueSkills.length}/${uniqueSkills.length} skills found`,
  };
}

async function checkAgentsCompiled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const agents = config.agents;

  if (agents.length === 0) {
    return {
      kind: "agents",
      status: "pass",
      message: "No agents configured",
    };
  }

  const projectAgentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
  const globalAgentsDir = resolveInstallPaths(projectDir, "global").agentsDir;
  const agentChecks = await Promise.all(
    agents.map(async (agent) => {
      // Check scope-appropriate directory for the agent
      const agentsDir = agent.scope === "global" ? globalAgentsDir : projectAgentsDir;
      const agentPath = path.join(agentsDir, `${agent.name}.md`);
      return { name: agent.name, compiled: await fileExists(agentPath) };
    }),
  );
  const missingAgents = agentChecks.filter((c) => !c.compiled).map((c) => c.name);

  if (missingAgents.length > 0) {
    return {
      kind: "agents",
      status: "warn",
      message: `${missingAgents.length} agent${missingAgents.length === 1 ? "" : "s"} need${missingAgents.length === 1 ? "s" : ""} recompilation`,
      details: missingAgents.map((a) => `- ${a} (missing)`),
    };
  }

  return {
    kind: "agents",
    status: "pass",
    message: `${agents.length}/${agents.length} agents compiled`,
  };
}

async function checkNoOrphans(config: ProjectConfig, projectDir: string): Promise<CheckResult> {
  const projectAgentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
  const globalAgentsDir = resolveInstallPaths(projectDir, "global").agentsDir;

  // At home scope both scopes resolve to the same agents directory, so it is
  // listed once and its files are matched against both scopes' known names.
  const scopesShareAgentsDir = isHomeDirectory(projectDir);

  const [projectExists, globalExists] = await Promise.all([
    directoryExists(projectAgentsDir),
    !scopesShareAgentsDir ? directoryExists(globalAgentsDir) : false,
  ]);

  if (!projectExists && !globalExists) {
    return {
      kind: "orphans",
      status: "pass",
      message: "No agents directory",
    };
  }

  const projectMdFiles = projectExists ? await listAgentMdFiles(projectAgentsDir) : [];
  const globalMdFiles = globalExists ? await listAgentMdFiles(globalAgentsDir) : [];

  // Project files: only active project-scoped agents should have .md files here
  const activeProjectAgents: Set<string> = new Set(
    config.agents.filter((a) => a.scope === "project" && !a.excluded).map((a) => a.name),
  );
  // Global files: all global-scoped agents (including excluded) still serve other projects
  const knownGlobalAgents: Set<string> = new Set(
    config.agents.filter((a) => a.scope === "global").map((a) => a.name),
  );

  const knownProjectDirAgents = scopesShareAgentsDir
    ? new Set([...activeProjectAgents, ...knownGlobalAgents])
    : activeProjectAgents;

  const orphanedFiles = [
    ...orphanedAgentNames(projectMdFiles, knownProjectDirAgents),
    ...orphanedAgentNames(globalMdFiles, knownGlobalAgents),
  ];

  if (orphanedFiles.length > 0) {
    return {
      kind: "orphans",
      status: "warn",
      message: plural(orphanedFiles.length, "orphaned agent file"),
      details: orphanedFiles.map((f) => `- ${f}.md (not in config)`),
    };
  }

  return {
    kind: "orphans",
    status: "pass",
    message: "No orphaned agent files",
  };
}

/**
 * The agents whose compiled `.md` sits in a directory whose roster does not name them. The
 * roster differs per directory — a project directory knows only its own active agents, the
 * global one knows every global-scoped agent including the excluded — so it is a parameter.
 */
function orphanedAgentNames(mdFiles: string[], knownAgents: ReadonlySet<string>): string[] {
  return mdFiles
    .map((fileName) => fileName.replace(/\.md$/, ""))
    .filter((agentName) => !knownAgents.has(agentName));
}

/**
 * The same row when there is no configuration at all. Ownership is not unknown here, it is
 * settled: nothing declares any of it, so every artefact this CLI can prove it wrote is an
 * orphan and the row names it. What it CANNOT prove it wrote is left out — a skill directory
 * with no `forkedFrom` and an agent file with no provenance marker are somebody's own work,
 * and naming them here would offer `uninstall` files that command declines. See
 * {@link listInstalledArtifacts}, which asks exactly that question on both axes.
 *
 * A `fail`, where a stray file beside a config is a warning: that warning is earned by the next
 * `compile` pruning what it names, and nothing prunes these unattended. `compile` and `edit`
 * refuse without a config; `uninstall` does not need one, identifying skill directories by
 * their own `forkedFrom` and compiled agents by the marker each carries, which is why the tip
 * beneath this row can promise both halves.
 *
 * With nothing installed the row keeps the skip it has always printed. An empty directory with
 * no config is the state `init` exists for — there is nothing for a configuration to have owned.
 */
async function checkUnownedInstallation(projectDir: string): Promise<CheckResult> {
  const { skills, agents } = await listInstalledArtifacts(projectDir);
  if (skills.length === 0 && agents.length === 0) return skippedResult("orphans");

  return {
    kind: "orphans-unowned",
    status: "fail",
    // The per-line "(not in config)" the other verdict repeats is said once here instead:
    // with no configuration it is true of every line, and there are as many lines as files.
    message: `${countedArtifacts(skills, agents)} installed here, and no configuration declares them`,
    details: [...skills, ...agents].map((artifact) => `- ${artifact}`),
  };
}

/** "7 skills and 2 agents", dropping a half with nothing in it rather than saying "0 agents". */
function countedArtifacts(skills: string[], agents: string[]): string {
  return [
    ...(skills.length > 0 ? [plural(skills.length, "skill")] : []),
    ...(agents.length > 0 ? [plural(agents.length, "agent")] : []),
  ].join(" and ");
}

async function checkSkillsInstalled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const skills: SkillConfig[] = config.skills;
  const ejectSkills = skills.filter((s) => s.origin === EJECT_SOURCE);

  if (ejectSkills.length === 0) {
    return {
      kind: "installed",
      status: "pass",
      message: "No eject-mode skills configured",
    };
  }

  const skillChecks = await Promise.all(
    ejectSkills.map(async (skill) => {
      const baseDir = installBaseDir(projectDir, skill.scope);
      const skillMdPath = path.join(baseDir, LOCAL_SKILLS_PATH, skill.id, STANDARD_FILES.SKILL_MD);
      return { id: skill.id, installed: await fileExists(skillMdPath) };
    }),
  );
  const missingSkills = skillChecks.filter((c) => !c.installed).map((c) => c.id);

  if (missingSkills.length > 0) {
    return {
      kind: "installed",
      status: "warn",
      message: `${plural(missingSkills.length, "skill")} missing from disk`,
      details: missingSkills.map((s) => `- ${s} (not found in ${LOCAL_SKILLS_PATH}/)`),
    };
  }

  return {
    kind: "installed",
    status: "pass",
    message: `${ejectSkills.length}/${ejectSkills.length} eject-mode skills installed`,
  };
}

/**
 * Plugin-mode skills have no files under `.claude/skills/` — they live in the
 * Claude plugin registry. Verifying them means asking the registry for the scope
 * each skill was installed at, not looking on disk.
 */
async function checkPluginSkillsInstalled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const pluginSkills: SkillConfig[] = config.skills.filter((s) => s.origin !== EJECT_SOURCE);

  if (pluginSkills.length === 0) {
    return {
      kind: "plugins",
      status: "pass",
      message: "No plugin-mode skills configured",
    };
  }

  const baseDirs = unique(pluginSkills.map((s) => installBaseDir(projectDir, s.scope)));
  const missingPerBaseDir = await Promise.all(
    baseDirs.map(async (baseDir) => {
      const installedIds = new Set(
        (await getVerifiedPluginInstallPaths(baseDir)).map((plugin) =>
          parseMarketplacePluginRef(plugin.pluginKey),
        ),
      );
      return pluginSkills
        .filter((skill) => installBaseDir(projectDir, skill.scope) === baseDir)
        .filter((skill) => !installedIds.has(skill.id))
        .map((skill) => skill.id);
    }),
  );
  const missingSkills = missingPerBaseDir.flat();

  if (missingSkills.length > 0) {
    return {
      kind: "plugins",
      status: "warn",
      message: `${plural(missingSkills.length, "skill")} not installed as plugins`,
      details: missingSkills.map((s) => `- ${s} (no enabled plugin found)`),
    };
  }

  return {
    kind: "plugins",
    status: "pass",
    message: `${pluginSkills.length}/${pluginSkills.length} plugin-mode skills installed`,
  };
}

/**
 * How a marketplace came to be the one this run reads, in the words each rung earns.
 *
 * The `default` sentence is the one that had to exist. With no configuration anywhere the resolver
 * falls back to the public catalogue and this check FETCHES it, so the report a bare directory gets
 * describes a network round trip to a marketplace nobody named — which is the row doing its job,
 * since reachability is its whole subject, and it was doing it without saying so. The other four
 * rungs are here because the map is exhaustive against the union rather than a default with
 * exceptions; `doctor` takes no marketplace flag and reads no environment variable, so it reaches
 * the first two through nothing today.
 */
const MARKETPLACE_CHOSEN_BY = {
  flag: "named by this run",
  env: `named by ${SOURCE_ENV_VAR}`,
  project: "named by this project's configuration",
  global: "named by the global configuration",
  default: "nothing here names one, so this is the default",
} as const satisfies Record<ResolvedConfig["sourceOrigin"], string>;

/** How this run got hold of that marketplace — off disk, or over the wire. */
function howItWasReached(source: string, isLocal: boolean): string {
  return isLocal ? `Read ${source} from disk` : `Fetched ${source} over the network`;
}

/**
 * The row for a marketplace this run did reach.
 *
 * `message` names where the skills were read FROM, which for a remote marketplace is the cache
 * directory it was unpacked into; the provenance line beneath it names the marketplace itself.
 * Both, because neither answers the other's question: a cache path says nothing about whose
 * catalogue it holds, and a ref says nothing about what is on disk to inspect.
 */
function reachedMarketplace(result: SourceLoadResult): CheckResult {
  const { source, sourceOrigin } = result.sourceConfig;
  const skillCount = Object.keys(matrix.skills).length;
  const sourceLabel = result.isLocal ? "local" : "remote";

  return {
    kind: "source",
    status: "pass",
    message: `Connected to ${sourceLabel}: ${result.sourcePath}`,
    details: [
      `${skillCount} skills available`,
      `${howItWasReached(source, result.isLocal)} — ${MARKETPLACE_CHOSEN_BY[sourceOrigin]}`,
    ],
  };
}

async function checkSourceReachable(projectDir: string): Promise<CheckResult> {
  try {
    const { sourceResult } = await loadSource({ projectDir });
    return reachedMarketplace(sourceResult);
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      kind: "source",
      status: "fail",
      message: "Failed to load marketplace",
      details: [message],
    };
  }
}

type ContentCheck = {
  kind: CheckKind;
  name: string;
  noun: string;
  run: (projectDir: string) => Promise<ContentValidation>;
};

/**
 * A content check plus the two gates it owns: whether it reads config.ts to know WHAT to validate
 * (see {@link CONFIG_CHECK}), and which operational rows its errors stand down.
 *
 * `blocks` names only the rows that READ what this pass validates, so their own verdict would be
 * this pass's finding in the row's words. A row absent from every `blocks` list reads none of the
 * content on disk and answers as truthfully as ever — an error here is not its business.
 */
type GatedContentCheck = ContentCheck & {
  readsConfig: boolean;
  blocks: readonly CheckKind[];
};

/**
 * The config file every other check is read against, so it is validated before any of them and
 * on its own: a file that exists and cannot be parsed is a finding about that file, and every
 * row underneath would be a cascade of it. It carries no gate of its own — it IS the gate.
 */
const CONFIG_CHECK: ContentCheck = {
  kind: "content-config",
  name: "Config",
  noun: "config",
  run: validateProjectConfigFile,
};

/**
 * The content layer: schema and file-level validation of what is on disk. It runs before the
 * operational layer so that a row whose inputs this layer has already reported broken can stand
 * down rather than re-report the same fault as a finding of its own.
 */
const CONTENT_CHECKS: GatedContentCheck[] = [
  {
    kind: "content-sources",
    name: "Marketplaces",
    noun: "marketplace",
    // The registered marketplaces are the ones config.ts names.
    readsConfig: true,
    // A marketplace whose content is broken is missing skills from the matrix every configured
    // id is resolved against, so the skills row would call ids "not found" that this row has
    // already accounted for.
    blocks: ["skills"],
    run: validateRegisteredSources,
  },
  {
    kind: "content-plugins",
    name: "Plugins",
    noun: "plugin",
    readsConfig: false,
    // `resolvePluginInstallPaths` swallows a registry it cannot parse and returns none, so every
    // plugin-mode skill would read "no enabled plugin found" — the registry's finding, once per
    // configured skill, wearing the row's words.
    blocks: ["plugins"],
    run: validateInstalledPlugins,
  },
  {
    kind: "content-skills",
    name: "Skills",
    noun: "skill",
    // `~/.claude/skills/` is shared with everything else that installs a skill there, so which of
    // its directories are this installation's is a question only the config can answer for the
    // ones carrying no provenance marker. A config nobody can read leaves that unanswerable.
    readsConfig: true,
    // `extractLocalSkill` DROPS a skill whose metadata.yaml is missing or unusable, so a "not
    // found" from the skills row would be this finding re-worded.
    blocks: ["skills"],
    run: validateInstalledSkills,
  },
  {
    kind: "content-agents",
    name: "Agents",
    noun: "agent",
    readsConfig: false,
    // Nothing downstream opens an agent .md. `Agents Compiled` asks whether the file is there and
    // `No Orphans` reads the names of the files that are — broken frontmatter changes neither.
    blocks: [],
    run: validateInstalledAgents,
  },
];

function contentStatus(errors: number, warnings: number): CheckResult["status"] {
  if (errors > 0) return "fail";
  if (warnings > 0) return "warn";
  return "pass";
}

function contentMessage(noun: string, count: number, errors: number, warnings: number): string {
  // A pass that walked nothing can still report an issue — an unreadable plugin
  // registry is a finding about the directory, not about a plugin inside it.
  if (errors === 0 && warnings === 0) {
    return count === 0 ? `No ${noun}s to validate` : `${plural(count, noun)} validated`;
  }
  return `${plural(count, noun)}: ${plural(errors, "error")}, ${plural(warnings, "warning")}`;
}

function formatContentIssue(issue: ContentIssue): string {
  const marker = issue.severity === "error" ? "ERROR" : "WARN";
  return `- [${marker}] ${issue.file}: ${issue.message}`;
}

function toContentResult(check: ContentCheck, validation: ContentValidation): CheckResult {
  const errors = validation.issues.filter((issue) => issue.severity === "error").length;
  const warnings = validation.issues.length - errors;

  return {
    kind: check.kind,
    status: contentStatus(errors, warnings),
    message: contentMessage(check.noun, validation.count, errors, warnings),
    details: [
      ...validation.notes.map((note) => `- ${note}`),
      ...validation.issues.map(formatContentIssue),
    ],
  };
}

/**
 * The column every row's status symbol starts at. It has to clear the longest row name
 * the report prints — "Marketplace Reachable", 21 characters — or that row's name runs
 * straight into its own tick with no gap.
 */
const CHECK_WIDTH = 24;

/** Section headings and the rows underneath them are indented one step apart. */
const SECTION_INDENT = "  ";
const ROW_INDENT = "    ";

const SECTION_CONTENT = "Content checks";
const SECTION_OPERATIONAL = "Operational checks";
const SKIP_NO_INSTALLATION = "Skipped — no installation here (marketplace repository)";
const SKIP_CONFIG_UNREADABLE = "Skipped — the configuration that names them cannot be read";

/**
 * The whole operational layer standing down, for the one content finding that leaves every row
 * with nothing to say: a config nobody can read. It still says "errors" rather than naming that
 * file, because the config row is one of them and whatever else failed is above it too.
 */
const SKIP_AFTER_CONFIG_ERROR = "Skipped — fix the content errors above first";

/**
 * The sentence a single row stands down with. Unlike its neighbours it names the finding rather
 * than the layer: which pass blocked it is the one thing separating a row that cannot answer from
 * the ones printing verdicts beside it.
 */
function skipRestatingContent(nouns: string[]): string {
  return `Skipped — this row would only restate the ${nouns.join(" and ")} errors above`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatCheckName(name: string): string {
  return name.padEnd(CHECK_WIDTH);
}

function formatStatus(status: CheckResult["status"]): string {
  switch (status) {
    case "pass":
      return UI_SYMBOLS.CHECK;
    case "fail":
      return UI_SYMBOLS.CROSS;
    case "warn":
      return "!";
    case "skip":
      return "-";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatCheckLine(name: string, result: CheckResult): string[] {
  const headerLine = `${ROW_INDENT}${formatCheckName(name)}${formatStatus(result.status)}  ${result.message}`;
  const detailLines = (result.details ?? []).map(
    (detail) => `${ROW_INDENT}${" ".repeat(CHECK_WIDTH)}   ${detail}`,
  );
  return [headerLine, ...detailLines];
}

function formatSummary(results: CheckResult[]): string {
  const counts = countBy(results, (r) => r.status);

  const parts = [
    `${counts.pass ?? 0} passed`,
    plural(counts.warn ?? 0, "warning"),
    plural(counts.fail ?? 0, "error"),
  ];

  return `${SECTION_INDENT}Summary: ${parts.join(", ")}`;
}

const TIPS: Array<{ kind: CheckKind; status: CheckResult["status"]; tip: string }> = [
  {
    kind: "agents",
    status: "warn",
    tip: `  Tip: Run '${CLI_INVOKE_COMMAND} compile' to generate missing agent files`,
  },
  {
    kind: "config",
    status: "fail",
    tip: `  Tip: Run '${CLI_INVOKE_COMMAND} init' to create or fix configuration`,
  },
  {
    // The remedy for a valid config with nothing in it. Not the tip above: there is nothing to
    // create and nothing to fix. `init` on this config opens the wizard rather than the dashboard
    // — that is what the detection returning null is FOR — so it is the way to fill it in.
    kind: "config-empty",
    status: "warn",
    tip: `  Tip: Nothing is configured yet — run '${CLI_INVOKE_COMMAND} init' to choose skills and sub-agents`,
  },
  {
    // The one remedy that applies to a config that cannot be read. `init` does not clear such a
    // file — it refuses it — so the tip above would send the reader in a circle; this is the same
    // way out `edit` and `init` themselves name, worded the same way.
    kind: "content-config",
    status: "fail",
    tip: `  Tip: There is no automatic repair — recreate the configuration: '${CLI_INVOKE_COMMAND} uninstall' still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init'`,
  },
  {
    // Printed beside the config tip above, which says how to get a configuration back and
    // nothing about the files that outlived the old one. Both halves are named with what they
    // actually do: `uninstall` matches skill directories by their own `forked-from` metadata and
    // compiled agents by the marker each one carries, so neither needs the configuration that is
    // gone — which is why the row can name both and this tip can promise both.
    kind: "orphans-unowned",
    status: "fail",
    tip: `  Tip: Nothing declares the files above — '${CLI_INVOKE_COMMAND} init' writes a configuration that can own them again, or '${CLI_INVOKE_COMMAND} uninstall' removes them, the compiled agents included: each file listed carries this CLI's own provenance, which is what that command reads when there is no configuration left`,
  },
  {
    kind: "skills",
    status: "fail",
    tip: "  Tip: Check skill IDs in config match available skills",
  },
  {
    kind: "installed",
    status: "warn",
    // No command is named on purpose: 'eject skills --force' re-copies every skill in the
    // marketplace and always targets project scope, so it cannot repair a global-scoped
    // skill and it litters a plugin-mode project with local skill directories.
    tip: "  Tip: Re-eject the missing skills from the marketplace to restore their files",
  },
];

function formatTips(results: CheckResult[]): string[] {
  return TIPS.filter((t) => results.some((r) => r.kind === t.kind && r.status === t.status)).map(
    (t) => t.tip,
  );
}

function skippedResult(kind: CheckKind): CheckResult {
  return { kind, status: "skip", message: "Skipped (config invalid)" };
}

/**
 * The skills row when the marketplace never loaded. Distinct from {@link skippedResult}: the
 * config is fine, and what is missing is the matrix to resolve its skills against.
 */
function sourceUnreachableSkillsResult(): CheckResult {
  return { kind: "skills", status: "skip", message: "Skipped (marketplace unreachable)" };
}

function skippedContentResult(kind: CheckKind): CheckResult {
  return { kind, status: "skip", message: SKIP_CONFIG_UNREADABLE };
}

/** The content passes that failed this run — the set every operational row is gated against. */
function failedContentKinds(contentResults: CheckResult[]): ReadonlySet<CheckKind> {
  return new Set(contentResults.filter((r) => r.status === "fail").map((r) => r.kind));
}

/**
 * An operational row standing down because a content pass it reads through failed, naming what
 * blocked it. `null` — the answer for most rows on most runs — means nothing it reads is broken
 * and it can speak for itself.
 */
function contentBlockedResult(
  row: CheckKind,
  failedContent: ReadonlySet<CheckKind>,
): CheckResult | null {
  const blockingNouns = CONTENT_CHECKS.filter((check) => failedContent.has(check.kind))
    .filter((check) => check.blocks.includes(row))
    .map((check) => check.noun);

  if (blockingNouns.length === 0) return null;

  return { kind: row, status: "skip", message: skipRestatingContent(blockingNouns) };
}

function runContentCheck(check: ContentCheck, projectDir: string): Promise<CheckResult> {
  return safeCheck(check.kind, async () => toContentResult(check, await check.run(projectDir)));
}

/**
 * Wrap a check so a thrown exception becomes a `fail` result instead of crashing the
 * whole doctor run. Per-check isolation ensures one broken check does not mask others.
 */
async function safeCheck(kind: CheckKind, fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await fn();
  } catch (error) {
    return { kind, status: "fail", message: "Check threw", details: [getErrorMessage(error)] };
  }
}

export default class Doctor extends BaseCommand {
  static summary = "Diagnose common configuration issues";

  static description = `Run diagnostic checks on your ${DEFAULT_BRANDING.NAME} configuration to identify issues with config validity, skill resolution, agent compilation, and marketplace connectivity.`;

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {};

  async run(): Promise<void> {
    await this.parse(Doctor);
    const projectDir = process.cwd();

    // The shared `verbose()` logger stays OFF, and nothing here switches it on. `doctor` used to,
    // for the whole run — the mechanical residue of a `--verbose` flag whose removal was meant to
    // make each row's own DETAILS unconditional, which `formatCheckLine` does on its own. What the
    // logger added on top of that was the loaders' trace, spliced between the section headings and
    // the rows they head: for a directory holding nothing, 27 lines of it, every one restating a
    // row printed underneath it.
    this.printHeader(await this.resolveBrandingName(projectDir));
    const contentResults = await this.runContentChecks(projectDir);
    const operationalResults = await this.runOperationalChecks(projectDir, contentResults);
    const results = [...contentResults, ...operationalResults];

    this.printResults(results);

    if (results.some((r) => r.status === "fail")) {
      this.exit(EXIT_CODES.ERROR);
    }
  }

  private printHeader(brandingName: string): void {
    this.log("");
    this.log(`${brandingName} Doctor`);
    this.log("");
    this.log(`${SECTION_INDENT}Checking configuration health...`);
    this.log("");
  }

  /**
   * The config is checked first and alone. A check that reads it to know what to validate would
   * otherwise ask a file already reported as unreadable — and asking is what emitted the loader's
   * own failure line once per read, spliced between these rows. Everything that walks installed
   * content on disk still runs: it says something true whatever the config is in.
   */
  private async runContentChecks(projectDir: string): Promise<CheckResult[]> {
    this.log(`${SECTION_INDENT}${SECTION_CONTENT}`);

    const configResult = await runContentCheck(CONFIG_CHECK, projectDir);
    const configUnreadable = configResult.status === "fail";

    const rows = await Promise.all(
      CONTENT_CHECKS.map(async (check) => ({
        name: check.name,
        result:
          check.readsConfig && configUnreadable
            ? skippedContentResult(check.kind)
            : await runContentCheck(check, projectDir),
      })),
    );

    const allRows = [{ name: CONFIG_CHECK.name, result: configResult }, ...rows];

    for (const row of allRows) {
      this.logCheck(row.name, row.result);
    }

    return allRows.map((row) => row.result);
  }

  /**
   * The whole layer stands down for the two findings that leave every row with nothing to say: a
   * config nobody can read — every row is read out of it, so all of them would be cascades of that
   * one file — and a marketplace repository with nothing installed, where a marketplace author has
   * no install for the layer to describe. Every other content error is scoped to the rows that
   * read what it is about; {@link GatedContentCheck} says which those are, per pass.
   */
  private async runOperationalChecks(
    projectDir: string,
    contentResults: CheckResult[],
  ): Promise<CheckResult[]> {
    this.log("");
    this.log(`${SECTION_INDENT}${SECTION_OPERATIONAL}`);

    const failedContent = failedContentKinds(contentResults);
    if (failedContent.has(CONFIG_CHECK.kind)) {
      this.log(`${ROW_INDENT}${SKIP_AFTER_CONFIG_ERROR}`);
      return [];
    }

    const detected = await detectProject(projectDir);
    if (!detected && (await this.isUninstalledSourceRepo(projectDir))) {
      this.log(`${ROW_INDENT}${SKIP_NO_INSTALLATION}`);
      return [];
    }

    const configState = await resolveConfigState(detected, projectDir);
    return this.runAllChecks(projectDir, configState, failedContent);
  }

  /**
   * A config file that exists but failed to load also detects as "no project", and
   * that is a finding rather than an absence — so the skip requires no config file
   * at all, not merely no usable one.
   */
  private async isUninstalledSourceRepo(projectDir: string): Promise<boolean> {
    if (await fileExists(getProjectConfigPath(projectDir))) return false;
    return isSourceRepo(projectDir);
  }

  private async runAllChecks(
    projectDir: string,
    configState: ConfigState,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    const { result: configResult, config } = checkConfigValid(configState);
    this.logCheck("Config Valid", configResult);

    // loadSource (called by checkSourceReachable) populates the matrix. Run it
    // before checkSkillsResolved so skills lookups see a populated matrix; if
    // source fails, skip skills rather than reporting false "not found" errors.
    const sourceResult = await safeCheck("source", () => checkSourceReachable(projectDir));

    const filteredConfig = config ? filterExcludedEntries(config) : null;

    const skillsResult = await this.resolveSkillsCheck(
      config,
      sourceResult,
      projectDir,
      failedContent,
    );
    this.logCheck("Skills Resolved", skillsResult);

    const agentsResult = filteredConfig
      ? await safeCheck("agents", () => checkAgentsCompiled(filteredConfig, projectDir))
      : skippedResult("agents");
    this.logCheck("Agents Compiled", agentsResult);

    const orphansResult = await this.resolveOrphansCheck(config, configState, projectDir);
    this.logCheck("No Orphans", orphansResult);

    const installedResult = filteredConfig
      ? await safeCheck("installed", () => checkSkillsInstalled(filteredConfig, projectDir))
      : skippedResult("installed");
    this.logCheck("Skills Installed", installedResult);

    const pluginsResult = await this.resolvePluginsCheck(filteredConfig, projectDir, failedContent);
    this.logCheck("Plugins Installed", pluginsResult);

    this.logCheck("Marketplace Reachable", sourceResult);

    return [
      configResult,
      skillsResult,
      agentsResult,
      orphansResult,
      installedResult,
      pluginsResult,
      sourceResult,
    ];
  }

  /**
   * The orphan row, and which question it can answer. With a config it names the compiled
   * agents that config does not; with no config at all every installed file is unowned and it
   * names all of them. It skips for the one state left — a config that loads and fails
   * validation — because there the file that says who owns what has already been rejected, and
   * an installation must not be called stranded on the strength of one nobody can trust.
   */
  private async resolveOrphansCheck(
    config: ProjectConfig | null,
    configState: ConfigState,
    projectDir: string,
  ): Promise<CheckResult> {
    if (config) return safeCheck("orphans", () => checkNoOrphans(config, projectDir));
    if (configState.kind === "absent") {
      return safeCheck("orphans", () => checkUnownedInstallation(projectDir));
    }
    return skippedResult("orphans");
  }

  /**
   * The skills row, and the three states in which it cannot be computed: no config to read the
   * skills out of, content it resolves against that the layer above has already reported broken,
   * and a marketplace that never loaded — so there is no populated matrix to resolve them
   * against, and every configured skill would be reported "not found".
   */
  private async resolveSkillsCheck(
    config: ProjectConfig | null,
    sourceResult: CheckResult,
    projectDir: string,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("skills");

    const blocked = contentBlockedResult("skills", failedContent);
    if (blocked) return blocked;
    if (sourceResult.status === "fail") return sourceUnreachableSkillsResult();

    return safeCheck("skills", () => checkSkillsResolved(config, matrix, projectDir));
  }

  /**
   * The plugin row, and the two states in which it cannot be computed: no config to read the
   * plugin-mode skills out of, and a plugin registry the layer above could not parse — which
   * resolves as no installs at all, so every configured skill would be reported missing.
   */
  private async resolvePluginsCheck(
    config: ProjectConfig | null,
    projectDir: string,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("plugins");

    const blocked = contentBlockedResult("plugins", failedContent);
    if (blocked) return blocked;

    return safeCheck("plugins", () => checkPluginSkillsInstalled(config, projectDir));
  }

  private logCheck(name: string, result: CheckResult): void {
    for (const line of formatCheckLine(name, result)) {
      this.log(line);
    }
  }

  private printResults(results: CheckResult[]): void {
    this.log("");
    this.log(formatSummary(results));

    const tips = formatTips(results);
    if (tips.length > 0) {
      this.log("");
      for (const tip of tips) {
        this.log(tip);
      }
    }

    this.log("");
  }
}
