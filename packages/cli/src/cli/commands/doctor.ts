import os from "os";
import path from "path";
import { BaseCommand } from "../base-command";
import { getErrorMessage } from "../utils/errors";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  effectivelyExcludedSkillIds,
  findConfigLoadFailures,
  MarketplaceRefusedError,
  validateProjectConfig,
  SOURCE_ENV_VAR,
  type ResolvedConfig,
} from "../lib/configuration";
import { loadSkillsMatrixFromSource, type SourceLoadResult } from "../lib/loading";
import { matrix } from "../lib/matrix/matrix-provider";
import { getStackSkillIds } from "../lib/stacks";
import { filterExcludedEntries } from "../lib/agents";
import { isHomeDirectory, installBaseDir } from "../lib/installation";
import {
  agentCodec,
  agentsDir,
  hostCompilesAgent,
  relativeConfigPath,
  skillsDir,
  skillsPathPrefix,
} from "../lib/installation/install-layout";
import { ambiguityFinding } from "../lib/installation/provider-flag";
import {
  sourceScopesInPlay,
  type ScopeKind,
  type SourceScope,
} from "../lib/installation/source-scopes";
import {
  hostsOf,
  hostsOnDisk,
  installedPluginSkillIds,
  providersInPlay,
  resolveConfigState,
  unofferablePlacements,
  type CheckedInstallation,
  type ConfigState,
} from "../lib/doctor/installation-reads";
import { judgeOwnership, type Orphans, type Ownership } from "../lib/doctor/ownership";
import {
  layoutIsCurrent,
  providerArgument,
  recreateConfigFrom,
  scopeLabel,
  scopeNoun,
} from "../utils/messages";
import { isSourceRepo } from "../lib/source-validator";
import {
  validateInstalledAgents,
  validateInstalledPlugins,
  validateInstalledSkills,
  validateProjectConfigFile,
  validateRegisteredSources,
  type ContentIssue,
  type ContentValidation,
} from "../lib/content-validator";
import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillConfig,
  SkillId,
  SkillScope,
} from "../types";
import { fileExists } from "../utils/fs";
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
  | "installations"
  | "source-repo"
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
  /** The installation a block's row is about, where the scope holds two. */
  provider?: Provider;
};

type ConfigCheckOutput = {
  result: CheckResult;
  config: ProjectConfig | null;
};

function checkConfigValid(
  state: ConfigState,
  installation: CheckedInstallation,
): ConfigCheckOutput {
  const theConfig = (verdict: string) => configRowMessage(state, installation, verdict);
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

  if (state.kind === "unreadable") {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: theConfig("exists but could not be loaded"),
        details: [state.failure.reason],
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
function configRowMessage(
  state: ConfigState,
  { projectDir, hosts }: CheckedInstallation,
  verdict: string,
): string {
  if (state.kind === "loaded" && state.inherited)
    return `${theInheritedConfig(hosts.global)}, which ${verdict}`;
  if (state.kind === "unreadable") {
    const { scopeRoot, scope } = state.failure;
    return `${theConfigAt(scopeRoot, hosts[scope])} ${verdict}`;
  }
  return `${theConfigAt(projectDir, hosts.project)} ${verdict}`;
}

function theConfigAt(root: string, provider: Provider): string {
  return `${scopeLabel(scopeOf(root))}: ${configNamedFrom(root, provider)}`;
}

function theInheritedConfig(provider: Provider): string {
  return `${scopeLabel("project")}: no ${STANDARD_FILES.CONFIG_TS}, using ${scopeNoun("global")}'s (${configNamedFrom(os.homedir(), provider)})`;
}

function scopeOf(dir: string): ScopeKind {
  return isHomeDirectory(dir) ? "global" : "project";
}

function configNamedFrom(root: string, provider: Provider): string {
  const relPath = relativeConfigPath(root, provider);
  return isHomeDirectory(root) ? `~/${relPath}` : relPath;
}

/** The loader has already merged in every local skill it accepts, from both scopes. */
function checkSkillsResolved(config: ProjectConfig, matrix: MergedSkillsMatrix): CheckResult {
  const uniqueSkills = skillIdsToResolve(config);

  if (uniqueSkills.length === 0) {
    return {
      kind: "skills",
      status: "pass",
      message: "No skills configured",
    };
  }

  const missingSkills = uniqueSkills.filter((skillId) => !(skillId in matrix.skills));

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

/** Both sources: a global-only install has skills but no stack. */
function skillIdsToResolve(config: ProjectConfig): SkillId[] {
  const excludedIds = effectivelyExcludedSkillIds(config.skills);
  const stackIds = config.stack ? getStackSkillIds(config.stack) : [];
  return unique([...stackIds, ...config.skills.map((s) => s.id)]).filter(
    (id) => !excludedIds.has(id),
  );
}

async function checkAgentsCompiled(
  config: ProjectConfig,
  installation: CheckedInstallation,
): Promise<CheckResult> {
  if (config.agents.length === 0) {
    return {
      kind: "agents",
      status: "pass",
      message: "No agents configured",
    };
  }

  const agentChecks = await Promise.all(
    config.agents.map((agent) => agentCompileCheck(agent, installation)),
  );
  const unrenderable = agentChecks.filter((c) => c.state === "unrenderable");
  const missingAgents = agentChecks.filter((c) => c.state === "missing").map((c) => c.name);

  // A sub-agent the host leaves out by design is a pass, not a recompile warning.
  if (unrenderable.length === config.agents.length) {
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
      message: needRecompilation(missingAgents.length),
      details: missingAgents.map((a) => `- ${a} (missing)`),
    };
  }

  const renderable = config.agents.length - unrenderable.length;
  return {
    kind: "agents",
    status: "pass",
    message: `${ratio(renderable, renderable, "agent")} compiled`,
  };
}

function needRecompilation(count: number): string {
  return `${plural(count, "agent")} ${count === 1 ? "needs" : "need"} recompilation`;
}

type AgentCompileCheck = {
  name: AgentName;
  provider: Provider;
  state: "unrenderable" | "compiled" | "missing";
};

/** Host read per scope: two scopes can be on two providers. */
async function agentCompileCheck(
  agent: AgentScopeConfig,
  { projectDir, hosts }: CheckedInstallation,
): Promise<AgentCompileCheck> {
  const provider = hosts[agent.scope];
  if (!hostCompilesAgent(provider, agent.name)) {
    return { name: agent.name, provider, state: "unrenderable" };
  }

  const file = `${agent.name}${agentCodec(provider).extension}`;
  const compiled = await fileExists(path.join(agentsDir(provider, agent.scope, projectDir), file));
  return { name: agent.name, provider, state: compiled ? "compiled" : "missing" };
}

async function checkNoOrphans(
  state: ConfigState,
  config: ProjectConfig | null,
  installation: CheckedInstallation,
): Promise<CheckResult> {
  return ownershipResult(state, await judgeOwnership(state, config, installation));
}

function ownershipResult(state: ConfigState, { unowned, orphans }: Ownership): CheckResult {
  if (unowned.skills.length > 0 || unowned.agents.length > 0) {
    return {
      kind: "orphans-unowned",
      status: "fail",
      message: `${countedArtifacts(unowned.skills, unowned.agents)} installed here, and no configuration declares them`,
      details: [...unowned.skills, ...unowned.agents, ...orphanLines(orphans)].map(
        (line) => `- ${line}`,
      ),
    };
  }

  if (orphans.skills.length > 0 || orphans.agents.length > 0) {
    return {
      kind: "orphans",
      status: "warn",
      message: countedOrphans(orphans),
      details: orphanLines(orphans).map((line) => `- ${line}`),
    };
  }

  // With no configuration and nothing this CLI wrote, there is nothing to own: `init`'s state.
  if (state.kind === "absent") return skippedResult("orphans");

  return { kind: "orphans", status: "pass", message: "No orphaned skills or agent files" };
}

function orphanLines({ skills, agents }: Orphans): string[] {
  return [...skills, ...agents].map((name) => `${name} (not in config)`);
}

function countedOrphans({ skills, agents }: Orphans): string {
  return nonZeroCounts([skills.length, "orphaned skill"], [agents.length, "orphaned agent file"]);
}

function ratio(found: number, total: number, noun: string): string {
  return `${found}/${plural(total, noun)}`;
}

function countedArtifacts(skills: string[], agents: string[]): string {
  return nonZeroCounts([skills.length, "skill"], [agents.length, "agent"]);
}

type Count = [count: number, noun: string];

/** `2 skills and 1 agent`: a zero is left out rather than counted. */
function nonZeroCounts(...counts: Count[]): string {
  return counts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => plural(count, noun))
    .join(" and ");
}

/** The directory is resolved per skill, since scope (and so host) varies within one config. */
async function checkSkillsInstalled(
  config: ProjectConfig,
  installation: CheckedInstallation,
): Promise<CheckResult> {
  const ejectSkills = config.skills.filter((s) => s.origin === EJECT_SOURCE);

  if (ejectSkills.length === 0) {
    return {
      kind: "installed",
      status: "pass",
      message: "No eject-mode skills configured",
    };
  }

  const skillChecks = await Promise.all(
    ejectSkills.map((skill) => ejectedSkillCheck(skill, installation)),
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
  { projectDir, hosts }: CheckedInstallation,
): Promise<EjectedSkillCheck> {
  const provider = hosts[skill.scope];
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
  installation: CheckedInstallation,
): Promise<CheckResult> {
  const pluginSkills = config.skills.filter((s) => s.origin !== EJECT_SOURCE);

  if (pluginSkills.length === 0) {
    return {
      kind: "plugins",
      status: "pass",
      message: "No plugin-mode skills configured",
    };
  }

  const scopes = unique(pluginSkills.map((s) => s.scope));
  const missingPerScope = await Promise.all(
    scopes.map((scope) => pluginSkillsMissingAt(scope, pluginSkills, installation)),
  );
  const missingSkills = missingPerScope.flat();

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

async function pluginSkillsMissingAt(
  scope: SkillScope,
  pluginSkills: SkillConfig[],
  { projectDir, hosts }: CheckedInstallation,
): Promise<SkillId[]> {
  const installedIds = await installedPluginSkillIds(
    installBaseDir(projectDir, scope),
    hosts[scope],
  );
  return pluginSkills
    .filter((skill) => skill.scope === scope)
    .filter((skill) => !installedIds.has(skill.id))
    .map((skill) => skill.id);
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
  const available = `${plural(result.marketplaceSkillIds.size, "skill")} available`;
  const chosenBy = MARKETPLACE_CHOSEN_BY[sourceOrigin];

  if (result.unreachable) {
    return {
      kind: "source",
      status: "warn",
      message: `Could not reach ${source} — read its cached copy instead`,
      details: [available, `The copy at ${result.sourcePath} may be out of date — ${chosenBy}`],
    };
  }

  return {
    kind: "source",
    status: "pass",
    message: `Connected to ${result.isLocal ? "local" : "remote"}: ${result.sourcePath}`,
    details: [available, `${howItWasReached(source, result.isLocal)} — ${chosenBy}`],
  };
}

async function checkSourceReachable({
  projectDir,
  hosts,
}: CheckedInstallation): Promise<CheckResult> {
  try {
    return reachedMarketplace(
      await loadSkillsMatrixFromSource({ projectDir, provider: hosts.project }),
    );
  } catch (error) {
    return {
      kind: "source",
      status: "fail",
      message: refusedOr(error, "Failed to load marketplace"),
      details: [getErrorMessage(error)],
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

/** Must clear the longest row name ("Marketplace Repository"). */
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

type Tip = {
  kind: CheckKind;
  status: CheckResult["status"];
  /** Handed the installation the finding is about, which a command acting on it must be told. */
  line: (provider: Provider | undefined) => string;
};

const TIPS: Tip[] = [
  {
    kind: "agents",
    status: "warn",
    line: (provider) =>
      `  Tip: Run '${commandActingOn(provider, "compile")}' to generate missing agent files`,
  },
  {
    kind: "config",
    status: "fail",
    line: () => `  Tip: Run '${CLI_INVOKE_COMMAND} init' to create or fix configuration`,
  },
  {
    kind: "config-empty",
    status: "warn",
    line: () =>
      `  Tip: Nothing is configured yet — run '${CLI_INVOKE_COMMAND} init' to choose skills and sub-agents`,
  },
  {
    kind: "orphans-unowned",
    status: "fail",
    line: (provider) =>
      `  Tip: Nothing declares the files above — '${commandActingOn(provider, "init --from <id>")}' writes a configuration that can own them again, or '${commandActingOn(provider, "uninstall")}' removes them, the compiled agents included: each file listed carries this CLI's own provenance, which is what that command reads when there is no configuration left`,
  },
  {
    kind: "skills",
    status: "fail",
    line: () => "  Tip: Check skill IDs in config match available skills",
  },
  {
    kind: "installed",
    status: "warn",
    // No command named: `eject skills --force` copies every skill, and only at project scope.
    line: () => "  Tip: Re-eject the missing skills from the marketplace to restore their files",
  },
];

function commandActingOn(provider: Provider | undefined, command: string): string {
  return `${CLI_INVOKE_COMMAND} ${command}${providerArgument(provider)}`;
}

/** Once per installation a finding names, and once only where the tip names none. */
function formatTips(results: CheckResult[]): string[] {
  return unique(TIPS.flatMap((tip) => linesOf(tip, results)));
}

function linesOf(tip: Tip, results: CheckResult[]): string[] {
  return results
    .filter((result) => answers(tip, result))
    .map((result) => tip.line(result.provider));
}

function answers(tip: Tip, result: CheckResult): boolean {
  return result.kind === tip.kind && result.status === tip.status;
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
      `  Tip: There is no automatic repair — recreate the configuration by running ${recreateConfigFrom(failure)}`,
  );
}

const INSTALLATIONS_ROW_NAME = "Installations";

/** Still a finding beside the blocks below: every acting command refuses to guess between them. */
async function checkInstallationsInPlay(
  projectDir: string,
  providers: Provider[],
): Promise<CheckResult> {
  const finding = await ambiguityFinding(projectDir);
  return {
    kind: "installations",
    status: "fail",
    message: `${providers.length} installations here, each checked below`,
    details: finding === null ? [] : [`- ${finding}`],
  };
}

function installationHeading(provider: Provider): string {
  return `${SECTION_INDENT}The ${provider} installation`;
}

const SOURCE_REPO_ROW_NAME = "Marketplace Repository";

/** A skip for a marketplace repository nothing is installed in, `null` for any other directory. */
async function uninstalledSourceRepo(projectDir: string): Promise<CheckResult | null> {
  // Aborts on the repository's own unreadable config, which `safeCheck` makes this row's finding.
  if (!(await isSourceRepo(projectDir))) return null;
  return { kind: "source-repo", status: "skip", message: SKIP_NO_INSTALLATION };
}

const LAYOUT_ROW_NAME = "Layout";

/** Each scope with this installation's source folder on disk, global first. */
async function checkLayout({ projectDir, hosts }: CheckedInstallation): Promise<CheckResult[]> {
  const scopes = await sourceScopesInPlay(projectDir, ({ kind }) => hosts[kind]);
  return scopes.map(toLayoutResult);
}

function toLayoutResult(scope: SourceScope): CheckResult {
  return {
    kind: "layout",
    status: "pass",
    message: layoutIsCurrent(scopeLabel(scope.kind), scope.relName),
  };
}

const PLACEMENTS_ROW_NAME = "Placements Offered";

/** Reports, as a row, the refusals other commands would stop on; never refuses itself. */
async function checkOfferedPlacements(installation: CheckedInstallation): Promise<CheckResult> {
  const findings = await unofferablePlacements(installation);

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

async function runGatedContentCheck(
  check: GatedContentCheck,
  projectDir: string,
  configUnreadable: boolean,
): Promise<CheckResult> {
  if (check.readsConfig && configUnreadable) return skippedContentResult(check.kind);
  return runContentCheck(check, projectDir);
}

/** One item after another, each step's results after the last's. */
async function flatMapInTurn<Item, Result>(
  items: readonly Item[],
  step: (item: Item) => Promise<Result[]>,
): Promise<Result[]> {
  return items.reduce<Promise<Result[]>>(
    async (earlier, item) => [...(await earlier), ...(await step(item))],
    Promise.resolve([]),
  );
}

/** A throw becomes that row's `fail`, so one broken check can't abort the run. */
async function safeCheck<Result extends CheckResult | null>(
  kind: CheckKind,
  fn: () => Result | Promise<Result>,
): Promise<Result | CheckResult> {
  try {
    return await fn();
  } catch (error) {
    return {
      kind,
      status: "fail",
      message: refusedOr(error, "Check threw"),
      details: [getErrorMessage(error)],
    };
  }
}

/** A marketplace the check refused is a finding about the config, not a fault in the check. */
function refusedOr(error: unknown, otherwise: string): string {
  return error instanceof MarketplaceRefusedError ? "Refused" : otherwise;
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

  private async runContentChecks(projectDir: string): Promise<CheckResult[]> {
    this.log(`${SECTION_INDENT}${SECTION_CONTENT}`);

    const configResult = await runContentCheck(CONFIG_CHECK, projectDir);
    const configUnreadable = configResult.status === "fail";

    const rows = await Promise.all(
      CONTENT_CHECKS.map(async (check) => ({
        name: check.name,
        result: await runGatedContentCheck(check, projectDir, configUnreadable),
      })),
    );

    const allRows = [{ name: CONFIG_CHECK.name, result: configResult }, ...rows];

    for (const row of allRows) {
      this.logCheck(row.name, row.result);
    }

    return allRows.map((row) => row.result);
  }

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

    const providers = await providersInPlay(projectDir);
    if (providers.length > 1) {
      return this.checkEachInstallation(projectDir, providers, failedContent);
    }
    return this.checkTheInstallation(projectDir, failedContent);
  }

  private async checkTheInstallation(
    projectDir: string,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    const installation = { projectDir, hosts: hostsOnDisk(projectDir) };
    const configState = await resolveConfigState(installation);

    if (configState.kind === "absent") {
      const sourceRepo = await safeCheck("source-repo", () => uninstalledSourceRepo(projectDir));
      if (sourceRepo !== null) return this.reportSourceRepo(sourceRepo);
    }

    return this.runAllChecks(installation, configState, failedContent);
  }

  /** A repository nothing is installed in skips the layer; one whose own config breaks is a row. */
  private reportSourceRepo(sourceRepo: CheckResult): CheckResult[] {
    if (sourceRepo.status === "skip") {
      this.log(`${ROW_INDENT}${sourceRepo.message}`);
      return [];
    }

    this.logCheck(SOURCE_REPO_ROW_NAME, sourceRepo);
    return [sourceRepo];
  }

  /** In turn rather than at once: each block prints as it runs, and each load seats the matrix. */
  private async checkEachInstallation(
    projectDir: string,
    providers: Provider[],
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    const installations = await safeCheck("installations", () =>
      checkInstallationsInPlay(projectDir, providers),
    );
    this.logCheck(INSTALLATIONS_ROW_NAME, installations);

    const blocks = await flatMapInTurn(providers, (provider) =>
      this.checkOneOf(projectDir, provider, failedContent),
    );
    return [installations, ...blocks];
  }

  private async checkOneOf(
    projectDir: string,
    provider: Provider,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    this.log("");
    this.log(installationHeading(provider));

    const installation = { projectDir, hosts: hostsOf(provider) };
    const results = await this.runAllChecks(
      installation,
      await resolveConfigState(installation),
      failedContent,
    );
    return results.map((result) => ({ ...result, provider }));
  }

  private async runAllChecks(
    installation: CheckedInstallation,
    configState: ConfigState,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult[]> {
    const { result: configResult, config } = checkConfigValid(configState, installation);
    this.logCheck("Config Valid", configResult);

    const layoutResults = await this.reportLayout(installation);

    const placementsResult = await safeCheck("placements", () =>
      checkOfferedPlacements(installation),
    );
    this.logCheck(PLACEMENTS_ROW_NAME, placementsResult);

    // Populates the matrix that the skills check reads, so it runs first.
    const sourceResult = await safeCheck("source", () => checkSourceReachable(installation));

    const filteredConfig = config ? filterExcludedEntries(config) : null;

    const skillsResult = await this.resolveSkillsCheck(config, sourceResult, failedContent);
    this.logCheck("Skills Resolved", skillsResult);

    const agentsResult = await this.resolveAgentsCheck(filteredConfig, installation);
    this.logCheck("Agents Compiled", agentsResult);

    const orphansResult = await this.resolveOrphansCheck(config, configState, installation);
    this.logCheck("No Orphans", orphansResult);

    const installedResult = await this.resolveInstalledCheck(filteredConfig, installation);
    this.logCheck("Skills Installed", installedResult);

    const pluginsResult = await this.resolvePluginsCheck(
      filteredConfig,
      installation,
      failedContent,
    );
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

  private async reportLayout(installation: CheckedInstallation): Promise<CheckResult[]> {
    const rows = await checkLayout(installation);

    for (const row of rows) {
      this.logCheck(LAYOUT_ROW_NAME, row);
    }
    return rows;
  }

  /** Skips on a config the checks rejected: ownership can't be judged from a rejected file. */
  private async resolveOrphansCheck(
    config: ProjectConfig | null,
    configState: ConfigState,
    installation: CheckedInstallation,
  ): Promise<CheckResult> {
    if (!config && configState.kind !== "absent") return skippedResult("orphans");
    return safeCheck("orphans", () => checkNoOrphans(configState, config, installation));
  }

  private async resolveSkillsCheck(
    config: ProjectConfig | null,
    sourceResult: CheckResult,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("skills");

    const blocked = contentBlockedResult("skills", failedContent);
    if (blocked) return blocked;
    if (sourceResult.status === "fail") return sourceUnreachableSkillsResult();

    return safeCheck("skills", () => checkSkillsResolved(config, matrix));
  }

  private async resolveAgentsCheck(
    config: ProjectConfig | null,
    installation: CheckedInstallation,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("agents");
    return safeCheck("agents", () => checkAgentsCompiled(config, installation));
  }

  private async resolveInstalledCheck(
    config: ProjectConfig | null,
    installation: CheckedInstallation,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("installed");
    return safeCheck("installed", () => checkSkillsInstalled(config, installation));
  }

  private async resolvePluginsCheck(
    config: ProjectConfig | null,
    installation: CheckedInstallation,
    failedContent: ReadonlySet<CheckKind>,
  ): Promise<CheckResult> {
    if (!config) return skippedResult("plugins");

    const blocked = contentBlockedResult("plugins", failedContent);
    if (blocked) return blocked;

    return safeCheck("plugins", () => checkPluginSkillsInstalled(config, installation));
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
