import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { readFile, ensureDir, copy } from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import {
  generateAgentPluginManifest,
  writePluginManifest,
  getPluginManifestPath,
} from "../plugins";
import { listAgentMdFiles } from "./list-compiled-agents";
import { computeStringHash, determinePluginVersion, writeContentHash } from "../versioning";
import { extractFrontmatter } from "../../utils/frontmatter";
import type { AgentFrontmatter, PluginManifest } from "../../types";
import { agentFrontmatterValidationSchema, formatZodIssues } from "../schemas";

export type AgentPluginOptions = {
  agentPath: string;
  outputDir: string;
};

export type CompiledAgentPlugin = {
  pluginPath: string;
  manifest: PluginManifest;
  agentName: string;
};

function parseAgentFrontmatter(
  content: string,
  filePath: string,
): Pick<AgentFrontmatter, "name" | "description"> | null {
  const raw = extractFrontmatter(content);
  if (!raw) {
    return null;
  }

  const result = agentFrontmatterValidationSchema.safeParse(raw);
  if (!result.success) {
    warn(`Invalid agent frontmatter in ${filePath}: ${formatZodIssues(result.error.issues)}`);
    return null;
  }

  return { name: result.data.name, description: result.data.description };
}

export async function compileAgentPlugin(
  options: AgentPluginOptions,
): Promise<CompiledAgentPlugin> {
  const { agentPath, outputDir } = options;
  const fileName = path.basename(agentPath);

  const content = await readFile(agentPath);
  const frontmatter = parseAgentFrontmatter(content, agentPath);

  if (!frontmatter) {
    throw new Error(
      `Agent '${fileName}' has invalid or missing YAML frontmatter. ` +
        `Required fields: 'name' and 'description'. File: ${agentPath}`,
    );
  }

  const agentName = frontmatter.name;

  verbose(`Compiling agent plugin: ${agentName} from ${agentPath}`);

  const pluginDir = path.join(outputDir, `agent-${agentName}`);
  const agentsDir = path.join(pluginDir, "agents");

  await ensureDir(pluginDir);
  await ensureDir(agentsDir);

  const newHash = computeStringHash(content);
  const { version, contentHash } = await determinePluginVersion(
    newHash,
    pluginDir,
    getPluginManifestPath,
  );

  const manifest = generateAgentPluginManifest({
    agentName,
    description: frontmatter.description,
    version,
  });

  await writePluginManifest(pluginDir, manifest);

  await writeContentHash(pluginDir, contentHash, getPluginManifestPath);

  verbose(`  Wrote plugin.json for ${agentName} (v${version})`);

  await copy(agentPath, path.join(agentsDir, `${agentName}.md`));
  verbose(`  Copied agent ${fileName} -> agents/${agentName}.md`);

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
      log(`  [OK] agent-${result.agentName}`);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      warn(`Failed to compile agent from '${agentFile}': ${errorMessage}`);
    }
  }

  return results;
}

export function printAgentCompilationSummary(results: CompiledAgentPlugin[]): void {
  log(`\nCompiled ${results.length} agent plugins:`);
  for (const result of results) {
    log(`  - agent-${result.agentName} (v${result.manifest.version})`);
  }
}
