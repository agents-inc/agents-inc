import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { readFile, ensureDir, copy } from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import {
  agentPluginName,
  generateAgentPluginManifest,
  getPluginAgentsDir,
  writePluginManifest,
  getPluginManifestPath,
} from "../plugins";
import { listAgentMdFiles } from "./list-compiled-agents";
import { agentCodec } from "../installation/install-layout";
import { computeStringHash, determinePluginVersion, writeContentHash } from "../versioning";
import { extractFrontmatter } from "../../utils/frontmatter";
import { plural } from "../../utils/string";
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

async function compileAgentPlugin(options: AgentPluginOptions): Promise<CompiledAgentPlugin> {
  const { agentPath, outputDir } = options;
  const fileName = path.basename(agentPath);

  const content = await readFile(agentPath);
  const parsed = parseAgentFrontmatter(content);

  if (!parsed.ok) {
    throw new Error(
      `Agent '${fileName}' has invalid or missing YAML frontmatter: ${parsed.reason}. ` +
        `File: ${agentPath}`,
    );
  }

  const agentName = parsed.frontmatter.name;

  verbose(`Compiling agent plugin: ${agentName} from ${agentPath}`);

  const pluginDir = path.join(outputDir, agentPluginName(agentName));
  const agentsDir = getPluginAgentsDir(pluginDir);

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
    description: parsed.frontmatter.description,
    version,
  });

  await writePluginManifest(pluginDir, manifest);

  await writeContentHash(pluginDir, contentHash, getPluginManifestPath);

  verbose(`  Wrote plugin.json for ${agentName} (v${version})`);

  const pluginAgentFile = `${agentName}${agentCodec("claude").extension}`;
  await copy(agentPath, path.join(agentsDir, pluginAgentFile));
  verbose(`  Copied agent ${fileName} -> agents/${pluginAgentFile}`);

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
