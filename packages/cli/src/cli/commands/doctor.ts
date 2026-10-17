import os from "os";
import path from "path";
import { BaseCommand } from "../base-command";
import { getErrorMessage } from "../utils/errors";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  effectivelyExcludedSkillIds,
  findConfigLoadFailures,
  loadInstalledConfig,
  validateProjectConfig,
  SOURCE_ENV_VAR,
  type ResolvedConfig,
} from "../lib/configuration";
import { loadSource, detectProject, type DetectedProject } from "../lib/operations";
import { matrix } from "../lib/matrix/matrix-provider";
import { discoverLocalSkills } from "../lib/skills";
import { getStackSkillIds } from "../lib/stacks";
import { filterExcludedEntries, listAgentFilesOf } from "../lib/agents";
import { getVerifiedPluginInstallPaths, parseMarketplacePluginRef } from "../lib/plugins";
import {
  declaresNoContent,
  isHomeDirectory,
  installBaseDir,
  resolveInstallPaths,
} from "../lib/installation";
import {
  agentCodec,
  type AgentCodec,
  hostCompilesAgent,
  providerInUse,
  relativeConfigPath,
  skillsDir,
  skillsPathPrefix,
} from "../lib/installation/install-layout";
import { ambiguityFinding } from "../lib/installation/provider-flag";
import { unofferablePlacementsFound } from "../lib/hosts/configured-placements";
import {
  sourceScopesInPlay,
  type ScopeKind,
  type SourceScope,
} from "../lib/installation/source-scopes";
import { layoutIsCurrent, recreateConfigFrom, scopeLabel, scopeNoun } from "../utils/messages";
import { getInstalledConfigPath } from "../lib/installation/install-base-dir";
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
import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillConfig,
  SkillId,
  SkillScope,
} from "../types";
import { fileExists, directoryExists } from "../utils/fs";
import { plural } from "../utils/string";
import {
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  STANDARD_FILES,
  UI_SYMBOLS,
  type Provider,
} from "../consts";
import { countBy, unique } from "remeda";

type CheckKind =
  | "config"
  | "config-empty"
  | "layout"
  | "placements"
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

/** An unreadable config never reaches here: the content layer reports it and skips this one. */
type ConfigState =
  | { kind: "absent" }
  | { kind: "declares-nothing"; config: ProjectConfig }
  | { kind: "loaded"; config: ProjectConfig; inherited: boolean };

/** This directory's config only; the global fallback is already `detectInstallation`'s. */
async function resolveConfigState(
  detected: DetectedProject | null,
  projectDir: string,
): Promise<ConfigState> {
  if (detected?.config) {
    return {
      kind: "loaded",
      config: detected.config,
      inherited: inheritsTheGlobalConfig(detected.installation.projectDir, projectDir),
    };
  }

  // Cannot throw: an unreadable config already skipped this layer.
  const loaded = await loadInstalledConfig(projectDir);
  if (!loaded) return { kind: "absent" };

  return declaresNoContent(loaded.config)
    ? { kind: "declares-nothing", config: loaded.config }
    : { kind: "loaded", config: loaded.config, inherited: false };
}

function inheritsTheGlobalConfig(readFrom: string, projectDir: string): boolean {
  return isHomeDirectory(readFrom) && !isHomeDirectory(projectDir);
}

function checkConfigValid(state: ConfigState, projectDir: string): ConfigCheckOutput {
  const theConfig = (verdict: string) => configRowMessage(state, projectDir, verdict);
  if (state.kind === "absent") {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: theConfig("not found"),
        details: [`Run '${CLI_INVOKE_COMMAND} init' to create a configuration`],
      },
      config: null,
    };
  }

  // Valid but empty: handed on so the rows below don't report "config invalid".
  if (state.kind === "declares-nothing") {
    return {
      result: {
        kind: "config-empty",
        status: "warn",
        message: theConfig("is valid but declares no skills and no agents"),
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
        message: theConfig("has errors"),
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
        message: theConfig("has warnings"),
        details: validation.warnings,
      },
      config,
    };
  }

  return {
    result: {
      kind: "config",
      status: "pass",
      message: theConfig("is valid"),
    },
    config,
  };
}

/** Names the file actually read: the global config when this directory inherits it. */
function configRowMessage(state: ConfigState, projectDir: string, verdict: string): string {
  if (state.kind === "loaded" && state.inherited)
    return `${theInheritedConfig()}, which ${verdict}`;
  return `${theOwnConfig(projectDir)} ${verdict}`;
}

function theOwnConfig(projectDir: string): string {
  return `${scopeLabel(scopeOf(projectDir))}: ${configNamedFrom(projectDir)}`;
}

function theInheritedConfig(): string {
  return `${scopeLabel("project")}: no ${STANDARD_FILES.CONFIG_TS}, using ${scopeNoun("global")}'s (${configNamedFrom(os.homedir())})`;
}

function scopeOf(dir: string): ScopeKind {
  return isHomeDirectory(dir) ? "global" : "project";
}

function configNamedFrom(root: string): string {
  const relPath = relativeConfigPath(root, providerInUse(root));
  return isHomeDirectory(root) ? `~/${relPath}` : relPath;
}

async function checkSkillsResolved(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): Promise<CheckResult> {
  // Both sources: a global-only install has skills but no stack.
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
      message: `${ratio(uniqueSkills.length - missingSkills.length, uniqueSkills.length, "skill")} found`,
      details: missingSkills.map((s) => `- ${s} (not found)`),
    };
  }

  return {
    kind: "skills",
    status: "pass",
    message: `${ratio(uniqueSkills.length, uniqueSkills.length, "skill")} found`,
  };
}

/** Host read per scope: two scopes can be on two providers. */
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

  const hosts = {
    global: providerInUse(installBaseDir(projectDir, "global")),
    project: providerInUse(installBaseDir(projectDir, "project")),
  };
  const dirs = {
    global: resolveInstallPaths(projectDir, "global").agentsDir,
    project: resolveInstallPaths(projectDir, "project").agentsDir,
  };

  const agentChecks = await Promise.all(
    agents.map((agent) => agentCompileCheck(agent, hosts, dirs)),
  );

  const unrenderable = agentChecks.filter((c) => c.state === "unrenderable");
  const missingAgents = agentChecks.filter((c) => c.state === "missing").map((c) => c.name);

  // A sub-agent the host leaves out by design is a pass, not a recompile warning.
  if (unrenderable.length === agents.length) {
    const hostsLeavingThemOut = unique(unrenderable.map((a) => a.provider)).join(" or ");
    return {
      kind: "agents",
      status: "pass",
      message: `No sub-agent in this configuration is carried by ${hostsLeavingThemOut}`,
      details: unrenderable.map((a) => `- ${a.name} (left out of ${a.provider})`),
    };
  }

  if (missingAgents.length > 0) {
    return {
      kind: "agents",
      status: "warn",
      message: `${missingAgents.length} agent${missingAgents.length === 1 ? "" : "s"} need${missingAgents.length === 1 ? "s" : ""} recompilation`,
      details: missingAgents.map((a) => `- ${a} (missing)`),
    };
  }

  const renderable = agents.length - unrenderable.length;
  return {
    kind: "agents",
    status: "pass",
    message: `${ratio(renderable, renderable, "agent")} compiled`,
  };
}

type AgentCompileCheck = {
  name: AgentName;
  provider: Provider;
  state: "unrenderable" | "compiled" | "missing";
};

async function agentCompileCheck(
  agent: AgentScopeConfig,
  hosts: Record<SkillScope, Provider>,
  agentsDirs: Record<SkillScope, string>,
): Promise<AgentCompileCheck> {
  const provider = hosts[agent.scope];
  if (!hostCompilesAgent(provider, agent.name)) {
    return { name: agent.name, provider, state: "unrenderable" };
  }

  const file = `${agent.name}${agentCodec(provider).extension}`;
  const compiled = await fileExists(path.join(agentsDirs[agent.scope], file));
  return { name: agent.name, provider, state: compiled ? "compiled" : "missing" };
}

async function checkNoOrphans(config: ProjectConfig, projectDir: string): Promise<CheckResult> {
  const codec = agentCodec(providerInUse(projectDir));
  const projectAgentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
  const globalAgentsDir = resolveInstallPaths(projectDir, "global").agentsDir;

  // At home both scopes share one agents directory.
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

  const projectMdFiles = projectExists ? await listAgentFilesOf(projectAgentsDir, codec) : [];
  const globalMdFiles = globalExists ? await listAgentFilesOf(globalAgentsDir, codec) : [];

  const activeProjectAgents: Set<string> = new Set(
    config.agents.filter((a) => a.scope === "project" && !a.excluded).map((a) => a.name),
  );
  // Excluded global agents still serve other projects.
  const knownGlobalAgents: Set<string> = new Set(
    config.agents.filter((a) => a.scope === "global").map((a) => a.name),
  );

  const knownProjectDirAgents = scopesShareAgentsDir
    ? new Set([...activeProjectAgents, ...knownGlobalAgents])
    : activeProjectAgents;

  const orphanedFiles = [
    ...orphanedAgentNames(projectMdFiles, knownProjectDirAgents, codec),
    ...orphanedAgentNames(globalMdFiles, knownGlobalAgents, codec),
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

function orphanedAgentNames(
  mdFiles: string[],
  knownAgents: ReadonlySet<string>,
  codec: AgentCodec,
): string[] {
  return mdFiles
    .map((fileName) => path.basename(fileName, codec.extension))
    .filter((agentName) => !knownAgents.has(agentName));
}

/**
 * With no config, every artefact this CLI provably wrote is an orphan. A `fail`, not a `warn`:
 * nothing prunes these unattended, unlike strays beside a config that `compile` removes.
 */
async function checkUnownedInstallation(projectDir: string): Promise<CheckResult> {
  const { skills, agents } = await listInstalledArtifacts(projectDir);
  if (skills.length === 0 && agents.length === 0) return skippedResult("orphans");

  return {
    kind: "orphans-unowned",
    status: "fail",
    message: `${countedArtifacts(skills, agents)} installed here, and no configuration declares them`,
    details: [...skills, ...agents].map((artifact) => `- ${artifact}`),
  };
}

function ratio(found: number, total: number, noun: string): string {
  return `${found}/${plural(total, noun)}`;
}

function countedArtifacts(skills: string[], agents: string[]): string {
  return [
    ...(skills.length > 0 ? [plural(skills.length, "skill")] : []),
    ...(agents.length > 0 ? [plural(agents.length, "agent")] : []),
  ].join(" and ");
}

/** The directory is resolved per skill, since scope (and so host) varies within one config. */
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
    ejectSkills.map((skill) => ejectedSkillCheck(skill, projectDir)),
  );
  const missingSkills = skillChecks.filter((c) => !c.installed);

  if (missingSkills.length > 0) {
    return {
      kind: "installed",
      status: "warn",
      message: `${plural(missingSkills.length, "skill")} missing from disk`,
      details: missingSkills.map((s) => `- ${s.id} (not found in ${s.lookedIn}/)`),
    };
  }

  return {
    kind: "installed",
    status: "pass",
    message: `${ratio(ejectSkills.length, ejectSkills.length, "eject-mode skill")} installed`,
  };
}

type EjectedSkillCheck = { id: SkillId; installed: boolean; lookedIn: string };

async function ejectedSkillCheck(
  skill: SkillConfig,
  projectDir: string,
): Promise<EjectedSkillCheck> {
  const provider = providerInUse(installBaseDir(projectDir, skill.scope));
  const dir = skillsDir(provider, skill.scope, projectDir);
  const installed = await fileExists(path.join(dir, skill.id, STANDARD_FILES.SKILL_MD));

  return {
    id: skill.id,
    installed,
    lookedIn: skillsPathPrefix(provider, skill.scope, projectDir),
  };
}

/** Plugin-mode skills are checked against the plugin registry per scope, not on disk. */
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
    message: `${ratio(pluginSkills.length, pluginSkills.length, "plugin-mode skill")} installed`,
  };
}

const MARKETPLACE_CHOSEN_BY = {
  flag: "named by this run",
  env: `named by ${SOURCE_ENV_VAR}`,
  project: "named by this project's configuration",
  global: "named by the global configuration",
  default: "nothing here names one, so this is the default",
} as const satisfies Record<ResolvedConfig["sourceOrigin"], string>;

function howItWasReached(source: string, isLocal: boolean): string {
  return isLocal ? `Read ${source} from disk` : `Fetched ${source} over the network`;
}

/** Counts the marketplace's own skills, not the loaded matrix, which also holds local ones. */
function reachedMarketplace(result: SourceLoadResult): CheckResult {
  const { source, sourceOrigin } = result.sourceConfig;
  const skillCount = result.marketplaceSkillIds.size;
  const sourceLabel = result.isLocal ? "local" : "remote";

  return {
    kind: "source",
    status: "pass",
    message: `Connected to ${sourceLabel}: ${result.sourcePath}`,
    details: [
      `${plural(skillCount, "skill")} available`,
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

/** `blocks`: operational rows that would only restate this pass's errors, so stand down. */
type GatedContentCheck = ContentCheck & {
  readsConfig: boolean;
  blocks: readonly CheckKind[];
};

/** Validated first and alone: every other row would cascade from an unreadable config. */
const CONFIG_CHECK: ContentCheck = {
  kind: "content-config",
  name: "Config",
  noun: "config",
  run: validateProjectConfigFile,
};

/** Runs before the operational layer so rows with broken inputs can stand down. */
const CONTENT_CHECKS: GatedContentCheck[] = [
  {
    kind: "content-sources",
    name: "Marketplaces",
    noun: "marketplace",
    readsConfig: true,
    // A broken marketplace leaves skills out of the matrix ids resolve against.
    blocks: ["skills"],
    run: validateRegisteredSources,
  },
  {
    kind: "content-plugins",
    name: "Plugins",
    noun: "plugin",
    readsConfig: false,
    // An unparseable registry resolves as no installs at all.
    blocks: ["plugins"],
    run: validateInstalledPlugins,
  },
  {
    kind: "content-skills",
    name: "Skills",
    noun: "skill",
    // Only the config says which unmarked shared-skills directories are this installation's.
    readsConfig: true,
    // `extractLocalSkill` drops a skill with unusable metadata.
    blocks: ["skills"],
    run: validateInstalledSkills,
  },
  {
    kind: "content-agents",
    name: "Agents",
    noun: "agent",
    readsConfig: false,
    // No operational row reads agent file contents.
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
  // A pass that walked nothing can still report an issue (e.g. an unreadable registry).
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

/** Must clear the longest row name ("Marketplace Reachable"). */
const CHECK_WIDTH = 24;

const SECTION_INDENT = "  ";
const ROW_INDENT = "    ";

const SECTION_CONTENT = "Content checks";
const SECTION_OPERATIONAL = "Operational checks";
const SKIP_NO_INSTALLATION = "Skipped — no installation here (marketplace repository)";
const SKIP_CONFIG_UNREADABLE = "Skipped — the configuration that names them cannot be read";

const SKIP_AFTER_CONFIG_ERROR = "Skipped — fix the content errors above first";

function skipRestatingContent(nouns: string[]): string {
  return `Skipped — this row would only restate the ${nouns.join(" and ")} errors above`;
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
      return UI_SYMBOLS.DISCOURAGED;
    case "skip":
      return UI_SYMBOLS.SKIPPED;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

const DETAIL_INDENT = `${ROW_INDENT}${" ".repeat(CHECK_WIDTH)}   `;

function formatCheckLine(name: string, result: CheckResult): string[] {
  const headerLine = `${ROW_INDENT}${formatCheckName(name)}${formatStatus(result.status)}  ${result.message}`;
  const detailLines = (result.details ?? []).flatMap(indentedDetailLines);
  return [headerLine, ...detailLines];
}

/** A detail can be a multi-paragraph refusal, so every line is indented. */
function indentedDetailLines(detail: string): string[] {
  return detail
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => `${DETAIL_INDENT}${line}`);
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
    kind: "config-empty",
    status: "warn",
    tip: `  Tip: Nothing is configured yet — run '${CLI_INVOKE_COMMAND} init' to choose skills and sub-agents`,
  },
  {
    kind: "orphans-unowned",
    status: "fail",
    tip: `  Tip: Nothing declares the files above — '${CLI_INVOKE_COMMAND} init --from <id>' writes a configuration that can own them again, or '${CLI_INVOKE_COMMAND} uninstall' removes them, the compiled agents included: each file listed carries this CLI's own provenance, which is what that command reads when there is no configuration left`,
  },
  {
    kind: "skills",
    status: "fail",
    tip: "  Tip: Check skill IDs in config match available skills",
  },
  {
    kind: "installed",
    status: "warn",
    // No command named: `eject skills --force` copies every skill, and only at project scope.
    tip: "  Tip: Re-eject the missing skills from the marketplace to restore their files",
  },
];

function formatTips(results: CheckResult[]): string[] {
  return TIPS.filter((t) => results.some((r) => r.kind === t.kind && r.status === t.status)).map(
    (t) => t.tip,
  );
}

/** `init` refuses an unreadable config, so the remedy is recreating it, once per such config. */
async function recreateConfigTips(
  contentResults: CheckResult[],
  projectDir: string,
): Promise<string[]> {
  if (!failedContentKinds(contentResults).has(CONFIG_CHECK.kind)) return [];

  const failures = await findConfigLoadFailures(projectDir).catch(() => []);
  return failures.map(
    (failure) =>
      `  Tip: There is no automatic repair — recreate the configuration by running ${recreateConfigFrom(failure.scopeRoot)}`,
  );
}

const LAYOUT_ROW_NAME = "Layout";

function toLayoutResult(scope: SourceScope): CheckResult {
  return {
    kind: "layout",
    status: "pass",
    message: layoutIsCurrent(scopeLabel(scope.kind), scope.relName),
  };
}

const PLACEMENTS_ROW_NAME = "Placements Offered";

/** Reports, as a row, the refusals other commands would stop on; never refuses itself. */
async function checkOfferedPlacements(projectDir: string): Promise<CheckResult> {
  const findings = await everythingThatWouldStopACommandActing(projectDir);

  if (findings.length === 0) {
    return { kind: "placements", status: "pass", message: "Every configured skill is placeable" };
  }

  return {
    kind: "placements",
    status: "fail",
    message: `${plural(findings.length, "finding")} would stop a command acting here`,
    details: findings.map((finding) => `- ${finding}`),
  };
}

async function everythingThatWouldStopACommandActing(projectDir: string): Promise<string[]> {
  const [unofferable, ambiguous] = await Promise.all([
    unofferablePlacementsFound(projectDir),
    ambiguityFinding(projectDir),
  ]);

  return ambiguous === null ? unofferable : [...unofferable, ambiguous];
}

function skippedResult(kind: CheckKind): CheckResult {
  return { kind, status: "skip", message: "Skipped (config invalid)" };
}

function sourceUnreachableSkillsResult(): CheckResult {
  return { kind: "skills", status: "skip", message: "Skipped (marketplace unreachable)" };
}

function skippedContentResult(kind: CheckKind): CheckResult {
  return { kind, status: "skip", message: SKIP_CONFIG_UNREADABLE };
}

function failedContentKinds(contentResults: CheckResult[]): ReadonlySet<CheckKind> {
  return new Set(contentResults.filter((r) => r.status === "fail").map((r) => r.kind));
}

/** `null` when no content pass this row reads through failed. */
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

/** A throw becomes that row's `fail`, so one broken check can't abort the run. */
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

    // `verbose()` stays off: the loaders' trace would interleave with and restate the rows.
    this.printHeader(await this.resolveBrandingName(projectDir));
    const contentResults = await this.runContentChecks(projectDir);
    const operationalResults = await this.runOperationalChecks(projectDir, contentResults);
    const results = [...contentResults, ...operationalResults];

    this.printResults(results, await recreateConfigTips(contentResults, projectDir));

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

  /** Config first; checks that read it skip when it is unreadable, the rest still run. */
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

  /** Skipped whole for an unreadable config or an uninstalled marketplace repository. */
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

  /** Requires no config file at all: an unloadable one is a finding, not an absence. */
  private async isUninstalledSourceRepo(projectDir: string): Promise<boolean> {
    if (await fileExists(getInstalledConfigPath(projectDir))) return false;
    return isSourceRepo(projectDir);
  }

  private async runAllChecks(
    projectDir: string,
    configState: ConfigState,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    const { result: configResult, config } = checkConfigValid(configState, projectDir);
    this.logCheck("Config Valid", configResult);

    const layoutResults = await this.reportLayout(projectDir);

    const placementsResult = await safeCheck("placements", () =>
      checkOfferedPlacements(projectDir),
    );
    this.logCheck(PLACEMENTS_ROW_NAME, placementsResult);

    // Populates the matrix that the skills check reads, so it runs first.
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
      ...layoutResults,
      placementsResult,
      skillsResult,
      agentsResult,
      orphansResult,
      installedResult,
      pluginsResult,
      sourceResult,
    ];
  }

  private async reportLayout(projectDir: string): Promise<CheckResult[]> {
    const rows = (await sourceScopesInPlay(projectDir)).map(toLayoutResult);

    for (const row of rows) {
      this.logCheck(LAYOUT_ROW_NAME, row);
    }
    return rows;
  }

  /** Skips on an invalid config: ownership can't be judged from a rejected file. */
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

  private printResults(results: CheckResult[], recreateTips: string[]): void {
    this.log("");
    this.log(formatSummary(results));

    const tips = [...formatTips(results), ...recreateTips];
    if (tips.length > 0) {
      this.log("");
      for (const tip of tips) {
        this.log(tip);
      }
    }

    this.log("");
  }
}
