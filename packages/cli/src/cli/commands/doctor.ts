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

/**
 * Which state the config these rows describe is in. `detectInstallation` answers "is there an
 * installation here", not "is there a config here", and hands back the same `null` for an absent
 * file and for one that loads while declaring neither skills nor agents — two states that need
 * different sentences. The state missing from this union is the one that cannot reach this layer:
 * a config that cannot be READ is the content layer's finding, and it skips the operational layer.
 *
 * A loaded config says whether it is this directory's own or the global one it inherits: a
 * directory with no config of its own under a global installation reads the global config, and a
 * row naming this directory's path for it describes a file that is not there.
 */
type ConfigState =
  | { kind: "absent" }
  | { kind: "declares-nothing"; config: ProjectConfig }
  | { kind: "loaded"; config: ProjectConfig; inherited: boolean };

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
  if (detected?.config) {
    return {
      kind: "loaded",
      config: detected.config,
      inherited: inheritsTheGlobalConfig(detected.installation.projectDir, projectDir),
    };
  }

  const loaded = await loadInstalledConfig(projectDir);
  if (!loaded) return { kind: "absent" };

  return declaresNoContent(loaded.config)
    ? { kind: "declares-nothing", config: loaded.config }
    : { kind: "loaded", config: loaded.config, inherited: false };
}

/** Whether the config detection read for `projectDir` is the home directory's, inherited. */
function inheritsTheGlobalConfig(readFrom: string, projectDir: string): boolean {
  return isHomeDirectory(readFrom) && !isHomeDirectory(projectDir);
}

/**
 * `projectDir` rather than a module-level constant for the path this reports about: a scope's
 * source folder depends on the provider read off its disk, so nothing about it exists at module
 * load, and every line below has to name the folder this project is ACTUALLY on.
 */
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

  // Not a fault and nothing to repair — the file is valid, it just has nothing in it. The config
  // is still handed on: the rows below describe an empty install truthfully, where a `null` would
  // have them all report `Skipped (config invalid)` about a config that is valid.
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

/**
 * What a Config Valid row says, led by whose config it is: this project's, or the global
 * installation's — the nouns the Layout rows lead with.
 *
 * A directory with no config of its own under a global installation reads the global one, and the
 * row says so, naming the file it actually read rather than this directory's path for a file that
 * is not there.
 */
function configRowMessage(state: ConfigState, projectDir: string, verdict: string): string {
  if (state.kind === "loaded" && state.inherited)
    return `${theInheritedConfig()}, which ${verdict}`;
  return `${theOwnConfig(projectDir)} ${verdict}`;
}

/** `This project: .agents-inc/claude/config.ts`, or the global installation's from home. */
function theOwnConfig(projectDir: string): string {
  return `${scopeLabel(scopeOf(projectDir))}: ${configNamedFrom(projectDir)}`;
}

/** A project with no config of its own, and the global one it reads in its place. */
function theInheritedConfig(): string {
  return `${scopeLabel("project")}: no ${STANDARD_FILES.CONFIG_TS}, using ${scopeNoun("global")}'s (${configNamedFrom(os.homedir())})`;
}

/** The scope whose config a directory holds: the home directory's is the global one. */
function scopeOf(dir: string): ScopeKind {
  return isHomeDirectory(dir) ? "global" : "project";
}

/**
 * A config file as a row names it: relative to the project it belongs to, and from home for the
 * global one — named relative to a project, the global config is a file that project does not have.
 */
function configNamedFrom(root: string): string {
  const relPath = relativeConfigPath(root, providerInUse(root));
  return isHomeDirectory(root) ? `~/${relPath}` : relPath;
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

/**
 * Whether every configured sub-agent is compiled where its own host reads it.
 *
 * **Two things here were Claude's and are the host's**, and both were found by running the
 * command on a healthy Codex installation rather than by reading it:
 *
 * - the FILENAME was `${name}.md`. Claude reads `.md` and Codex reads `.toml`, so on Codex this
 *   looked for a file no release will ever write. {@link agentCodec} answers the extension, and
 *   this is the extension ban's own census in action — the eslint config leaves `.md` unbanned
 *   precisely because product modules like this one still spell it.
 * - the VERDICT was "needs recompilation", for a sub-agent {@link hostCompilesAgent} says this
 *   host does not carry at all. Recompiling writes nothing, so the row asked for a remedy that
 *   does not exist and turned an install working exactly as this release intends into a warning.
 *   With C5 that is no longer a whole provider but two named sub-agents — `agent-summoner` and
 *   `skill-summoner`, which Codex leaves out for v1 — so the row names them rather than the host.
 *
 * The host is read per SCOPE, the way `resolveInstallPaths` reads it beside this: two scopes can
 * be on two providers, and one answer for both is how a row reports about the wrong installation.
 */
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

  // The no-renderer answer leads when it is the whole story, because then nothing is wrong and
  // nothing can be done: a `warn` here would make every `doctor` on a Codex installation read as
  // a fault report about the one thing this release has already said it does not do yet. The
  // providers come off the rows themselves rather than off both scopes, so a project on one host
  // under a global on another names only the host whose sub-agents this is about.
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

/** One configured sub-agent as the Agents Compiled row sees it, and the host that decided it. */
type AgentCompileCheck = {
  name: AgentName;
  provider: Provider;
  state: "unrenderable" | "compiled" | "missing";
};

/**
 * Whether one sub-agent is left out by its scope's host, or else compiled or missing where that
 * host reads it — the extension and the directory are both the host's.
 */
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
  // The host's own agent files — `*.toml` roles on Codex, where a `*.md`-only listing found no
  // compiled agent and so no orphan either (the CLI-896 class, 2026-09-27).
  const codec = agentCodec(providerInUse(projectDir));
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

  const projectMdFiles = projectExists ? await listAgentFilesOf(projectAgentsDir, codec) : [];
  const globalMdFiles = globalExists ? await listAgentFilesOf(globalAgentsDir, codec) : [];

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

/**
 * The agents whose compiled `.md` sits in a directory whose roster does not name them. The
 * roster differs per directory — a project directory knows only its own active agents, the
 * global one knows every global-scoped agent including the excluded — so it is a parameter.
 */
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

/** "1/1 skill", "2/3 skills" — the noun agrees with the count it is out of. */
function ratio(found: number, total: number, noun: string): string {
  return `${found}/${plural(total, noun)}`;
}

/** "7 skills and 2 agents", dropping a half with nothing in it rather than saying "0 agents". */
function countedArtifacts(skills: string[], agents: string[]): string {
  return [
    ...(skills.length > 0 ? [plural(skills.length, "skill")] : []),
    ...(agents.length > 0 ? [plural(agents.length, "agent")] : []),
  ].join(" and ");
}

/**
 * Whether every eject-mode skill the configuration names is on disk where its own host reads it.
 *
 * **It composed `<scope root>/.claude/skills/<id>/SKILL.md` for every provider until
 * 2026-09-22**, which made a healthy Codex installation report every one of its skills missing
 * and told the reader to look in a directory that installation does not have. The write path had
 * already moved through the layout — `copyLocalSkills` writes `$CODEX_HOME/skills` and
 * `<repo>/.agents/skills` — so this row was the half that stayed behind, and it is the kind of
 * defect the host-path lint ban cannot report: the path was composed from a CONSTANT, and that
 * ban matches literals.
 *
 * The directory is asked per SKILL rather than once for the row, because scope decides it and a
 * configuration mixes scopes freely. The reader is told the directory that was actually looked
 * in, for the same reason — one sentence naming one folder cannot be true of two scopes on two
 * different hosts.
 */
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

/** One eject-mode skill as the Skills Installed row sees it, and where it was looked for. */
type EjectedSkillCheck = { id: SkillId; installed: boolean; lookedIn: string };

/**
 * Whether one eject-mode skill's `SKILL.md` is where its scope's host reads it.
 *
 * The provider is read off the scope's OWN root, the way `resolveInstallPaths` and
 * `discoverLocalProjectSkills` read it: two scopes can be on two different providers, and one
 * probe per skill is what keeps the directory and the reported prefix naming one of them.
 */
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
    message: `${ratio(pluginSkills.length, pluginSkills.length, "plugin-mode skill")} installed`,
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
 *
 * The count is what that marketplace carries, not the matrix this run loaded: the matrix also
 * holds the skills ejected here and the global installation's, which may come from another
 * marketplace altogether.
 */
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

function formatCheckName(name: string): string {
  return name.padEnd(CHECK_WIDTH);
}

/**
 * The glyph each row is headed with, every one of them from {@link UI_SYMBOLS}.
 *
 * The last two used to be literals here — `"!"` and `"-"` — and the second was the one that
 * mattered: `UI_SYMBOLS.SKIPPED` is an EN-DASH, so a stood-down row printed a different character
 * from the one the symbol table declares for exactly that state, while `UI_SYMBOLS.REMOVED` is
 * deliberately an ASCII hyphen for diff markers. Two glyphs a reader cannot tell apart, meaning
 * opposite things, and nothing pointing either literal at the table it belonged in.
 */
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

/** The column a row's details start at, under its message. */
const DETAIL_INDENT = `${ROW_INDENT}${" ".repeat(CHECK_WIDTH)}   `;

function formatCheckLine(name: string, result: CheckResult): string[] {
  const headerLine = `${ROW_INDENT}${formatCheckName(name)}${formatStatus(result.status)}  ${result.message}`;
  const detailLines = (result.details ?? []).flatMap(indentedDetailLines);
  return [headerLine, ...detailLines];
}

/**
 * A detail can be a whole refusal — a loader's message, paragraphs and all — so every one of its
 * lines is indented, and its blank lines dropped. Indenting the first alone printed the rest at
 * column 0, outside the row they belong to and between the rows below it.
 */
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
    // The remedy for a valid config with nothing in it. Not the tip above: there is nothing to
    // create and nothing to fix. `init` on this config opens the wizard rather than the dashboard
    // — that is what the detection returning null is FOR — so it is the way to fill it in.
    kind: "config-empty",
    status: "warn",
    tip: `  Tip: Nothing is configured yet — run '${CLI_INVOKE_COMMAND} init' to choose skills and sub-agents`,
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

/**
 * The one remedy that applies to a config that cannot be read, once per such config, naming the
 * folder it is taken from. `init` does not clear such a file — it refuses it — so the config tip
 * would send the reader in a circle; this is the way out every refusing command names, worded the
 * same way and sending the reader to the same folder: the project, or the home directory for the
 * global config.
 *
 * Read again rather than threaded out of the content pass, and only once that pass has failed. A
 * failure it cannot classify is already that pass's own failed row, so it adds no tip of its own.
 */
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

/** The row name every Layout row is printed under, one per scope. */
const LAYOUT_ROW_NAME = "Layout";

/** One scope's Layout row: which folder its installation is read from and written to. */
function toLayoutResult(scope: SourceScope): CheckResult {
  return {
    kind: "layout",
    status: "pass",
    message: layoutIsCurrent(scopeLabel(scope.kind), scope.relName),
  };
}

/** The row name the placement and installation-ambiguity findings are printed under. */
const PLACEMENTS_ROW_NAME = "Placements Offered";

/**
 * Whether this installation is one every other command will act on — as a ROW, not a throw.
 *
 * **It carries the two findings that make the rest of this report a claim about nothing.** A
 * configuration asking for a mode/scope cell its host does not offer is refused by `compile`,
 * `edit` and `update`; a scope holding an installation of each provider is refused by `edit`,
 * `uninstall`, `share` and `eject`. Until this row existed, `doctor` — the one command whose job
 * is saying whether an installation is healthy — walked straight past both and pronounced a clean
 * bill of health on a configuration no command would touch. A diagnostic that disagrees with every
 * command it is diagnosing is worse than a missing one.
 *
 * **It reports and never refuses**: a command that changes nothing must not refuse to LOOK,
 * because this is exactly the state a user needs to see in order to fix it.
 *
 * The message is the refusal's own, word for word, off the same host roster — so what a user is
 * told here and what they are told when `compile` stops are one sentence, not two that agree
 * today.
 *
 * **The summary counts FINDINGS, and said "unusable installation" until 2026-09-22.** The two
 * are not the same number in either direction: one installation with an unofferable placement AND
 * an ambiguous folder contributes two findings, while the ambiguity finding is itself about a
 * scope holding two installations. A count of one noun printed over a list of another is a
 * sentence a reader cannot check against the lines underneath it.
 */
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

/**
 * The two findings a command would stop on, in one list: a placement no host can fill, and a scope
 * holding an installation of each provider.
 *
 * Asked together rather than in sequence because neither answer depends on the other, and reported
 * together because they are one question for a user — "will anything act on this?" — with two ways
 * of being answered no.
 */
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

    // Directly under Layout, and above every row that reads content: Layout says which FOLDER this
    // report is about and this row says whether any command will act on what is in it.
    const placementsResult = await safeCheck("placements", () =>
      checkOfferedPlacements(projectDir),
    );
    this.logCheck(PLACEMENTS_ROW_NAME, placementsResult);

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

  /**
   * One `Layout` row per scope in play.
   *
   * Per scope rather than per machine: a project and the global installation are two
   * installations, and one row for the two can only name one of their folders.
   *
   * Printed right under `Config Valid`, because every row below it is read out of a config file
   * in the folder this row names.
   */
  private async reportLayout(projectDir: string): Promise<CheckResult[]> {
    const rows = (await sourceScopesInPlay(projectDir)).map(toLayoutResult);

    for (const row of rows) {
      this.logCheck(LAYOUT_ROW_NAME, row);
    }
    return rows;
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
