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

/**
 * The frontmatter a plugin build needs, or the reason it could not be had.
 *
 * The reason is carried out rather than discarded because the throw in
 * {@link compileAgentPlugin} is the only thing a `build` run surfaces for a failed agent, and it
 * used to name `name` and `description` whatever had actually gone wrong — so an agent rejected
 * for an unknown key or a bad enum value was reported as missing two fields it declared correctly.
 *
 * Nothing is warned here, deliberately. This function is private and has one caller, which throws
 * on every failure, and {@link compileAllAgentPlugins} catches that throw and warns the message —
 * so a warning here would print the same cause twice. The shared `parseFrontmatter` on the skill
 * side keeps its own warn for the opposite reason: most of its callers skip rather than throw.
 */
type AgentFrontmatterParse =
  | { ok: true; frontmatter: Pick<AgentFrontmatter, "name" | "description"> }
  | { ok: false; reason: string };

/** The reason when there is no frontmatter block at all, as opposed to one the schema refused. */
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

export async function compileAgentPlugin(
  options: AgentPluginOptions,
): Promise<CompiledAgentPlugin> {
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
    description: parsed.frontmatter.description,
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
