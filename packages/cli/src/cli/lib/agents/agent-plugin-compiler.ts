import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { readFile, copy, isPathWithin } from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import {
  agentPluginName,
  clearEarlierBuild,
  generateAgentPluginManifest,
  getPluginAgentsDir,
  holdsContentNoBuildMade,
  writePluginManifest,
  getPluginManifestPath,
} from "../plugins";
import { listAgentMdFiles } from "./list-compiled-agents";
import { agentCodec } from "../installation/install-layout";
import {
  computeShippedHash,
  computeStringHash,
  readEarlierBuild,
  versionAfterRebuild,
  writeContentHash,
} from "../versioning";
import { extractFrontmatter } from "../../utils/frontmatter";
import { plural } from "../../utils/string";
import { DEFAULT_VERSION, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import type { AgentFrontmatter, PluginManifest } from "../../types";
import { agentFrontmatterValidationSchema, formatZodIssues } from "../schemas";

type AgentPluginOptions = {
  agentPath: string;
  outputDir: string;
};

type CompiledAgentPlugin = {
  pluginPath: string;
  manifest: PluginManifest;
  agentName: string;
};

/** Carries the reason out, so the throw in `compileAgentPlugin` names what actually went wrong. */
type AgentFrontmatterParse =
  | { ok: true; frontmatter: Pick<AgentFrontmatter, "name" | "description"> }
  | { ok: false; reason: string };

const NO_FRONTMATTER_REASON = "no YAML frontmatter block";

function parseAgentFrontmatter(content: string): AgentFrontmatterParse {
  const raw = extractFrontmatter(content);
  if (!raw) {
    return { ok: false, reason: NO_FRONTMATTER_REASON };
  }

  const result = agentFrontmatterValidationSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, reason: formatZodIssues(result.error.issues) };
  }

  return {
    ok: true,
    frontmatter: { name: result.data.name, description: result.data.description },
  };
}

/**
 * A plugin's folder is cleared before each build, so it must not hold the agent's own source, nor
 * files no build made. The name needs no check: the frontmatter schema holds it to kebab-case.
 */
async function assertClearable(pluginDir: string, agentPath: string): Promise<void> {
  const agent = `Agent '${path.basename(agentPath)}'`;
  const file = `File: ${agentPath}`;

  if (isPathWithin(agentPath, pluginDir)) {
    throw new Error(
      `${agent} would be built into ${pluginDir}, which holds its own source, so building it would overwrite that source. Build into an output directory outside the agents directory. ${file}`,
    );
  }
  if (await holdsContentNoBuildMade(pluginDir)) {
    throw new Error(
      `${agent} would be built into ${pluginDir}, which holds no ${path.join(PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)} and is not empty, so no earlier build made it and a rebuild would delete what it holds. Move its contents out, or build into another output directory. ${file}`,
    );
  }
}

/** A plugin is built from the agent's frontmatter, so one that is absent or invalid refuses. */
async function readAgentToBuild(
  agentPath: string,
): Promise<{ content: string; frontmatter: Pick<AgentFrontmatter, "name" | "description"> }> {
  const content = await readFile(agentPath);
  const parsed = parseAgentFrontmatter(content);

  if (!parsed.ok) {
    throw new Error(
      `Agent '${path.basename(agentPath)}' has invalid or missing YAML frontmatter: ${parsed.reason}. ` +
        `File: ${agentPath}`,
    );
  }

  return { content, frontmatter: parsed.frontmatter };
}

async function copyAgentInto(
  pluginDir: string,
  agentPath: string,
  agentName: string,
): Promise<void> {
  const pluginAgentFile = `${agentName}${agentCodec("claude").extension}`;
  await copy(agentPath, path.join(getPluginAgentsDir(pluginDir), pluginAgentFile));
  verbose(`  Copied agent ${path.basename(agentPath)} -> agents/${pluginAgentFile}`);
}

async function compileAgentPlugin(options: AgentPluginOptions): Promise<CompiledAgentPlugin> {
  const { agentPath, outputDir } = options;
  const { content, frontmatter } = await readAgentToBuild(agentPath);

  const agentName = frontmatter.name;
  const pluginDir = path.join(outputDir, agentPluginName(agentName));
  await assertClearable(pluginDir, agentPath);

  verbose(`Compiling agent plugin: ${agentName} from ${agentPath}`);

  const manifestAt = (version: string): PluginManifest =>
    generateAgentPluginManifest({ agentName, description: frontmatter.description, version });

  // Read before the clear: what the earlier build shipped decides whether the version moves.
  const earlierBuild = await readEarlierBuild(pluginDir, getPluginManifestPath);
  await clearEarlierBuild(pluginDir);

  // At the earlier build's version, so the version alone cannot set the two builds apart; and
  // first, so a build that stops halfway leaves a folder the next build may clear.
  await writePluginManifest(pluginDir, manifestAt(earlierBuild?.version ?? DEFAULT_VERSION));

  // Nothing reads it back. Every plugin built so far ships it, so dropping it would bump them all.
  await writeContentHash(pluginDir, computeStringHash(content), getPluginManifestPath);

  await copyAgentInto(pluginDir, agentPath, agentName);

  const manifest = manifestAt(
    versionAfterRebuild(earlierBuild, await computeShippedHash(pluginDir)),
  );
  await writePluginManifest(pluginDir, manifest);
  verbose(`  Wrote plugin.json for ${agentName} (v${manifest.version})`);

  return {
    pluginPath: pluginDir,
    manifest,
    agentName,
  };
}

export async function compileAllAgentPlugins(
  agentsDir: string,
  outputDir: string,
): Promise<CompiledAgentPlugin[]> {
  const results: CompiledAgentPlugin[] = [];

  const agentMdFiles = await listAgentMdFiles(agentsDir);

  for (const agentFile of agentMdFiles) {
    const agentPath = path.join(agentsDir, agentFile);

    try {
      const result = await compileAgentPlugin({
        agentPath,
        outputDir,
      });
      results.push(result);
      log(`  [OK] ${agentPluginName(result.agentName)}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      warn(`Failed to compile agent from '${agentFile}': ${errorMessage}`);
    }
  }

  return results;
}

export function printAgentCompilationSummary(results: CompiledAgentPlugin[]): void {
  log(`\nCompiled ${plural(results.length, "agent plugin")}:`);
  for (const result of results) {
    log(`  - ${agentPluginName(result.agentName)} (v${result.manifest.version})`);
  }
}
