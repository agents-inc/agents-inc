import path from "path";
import { copy, ensureDir, directoryExists, glob } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { CLI_INVOKE_COMMAND, GITHUB_SOURCE } from "../../consts";
import type { Marketplace, MarketplacePlugin, SkillId } from "../../types";

export type FetchSkillsOptions = {
  forceRefresh?: boolean;
};

function resolvePluginSource(plugin: MarketplacePlugin, _marketplace: Marketplace): string {
  if (typeof plugin.source === "object" && plugin.source.url) {
    return plugin.source.url;
  }

  if (typeof plugin.source === "string") {
    return plugin.source;
  }

  if (typeof plugin.source === "object" && plugin.source.repo) {
    const ref = plugin.source.ref ? `#${plugin.source.ref}` : "";
    return `${GITHUB_SOURCE.GITHUB_PREFIX}${plugin.source.repo}${ref}`;
  }

  throw new Error(
    `Malformed marketplace plugin '${plugin.name}': source has neither url, repo, nor string value`,
  );
}

export async function fetchSkills(
  skillIds: SkillId[],
  marketplace: Marketplace,
  outputDir: string,
  sourcePath: string,
  _options: FetchSkillsOptions = {},
): Promise<SkillId[]> {
  const skillsOutputDir = path.join(outputDir, "skills");
  await ensureDir(skillsOutputDir);

  for (const skillId of skillIds) {
    logMarketplacePluginMatch(skillId, marketplace);

    const skillSourceDir = path.join(sourcePath, "src", "skills");

    const skillPath = await findSkillPath(skillSourceDir, skillId);

    if (!skillPath) {
      throw new Error(
        `Skill not found: ${skillId}\n\n` +
          `Looked in: ${skillSourceDir}\n` +
          `Run '${CLI_INVOKE_COMMAND} search ${skillId}' to find available skills, or '${CLI_INVOKE_COMMAND} init' to select skills interactively.`,
      );
    }

    const relativePath = path.relative(skillSourceDir, skillPath);
    const destPath = path.join(skillsOutputDir, relativePath);

    await ensureDir(path.dirname(destPath));
    await copy(skillPath, destPath);
    verbose(`Copied skill: ${skillId} -> ${destPath}`);
  }

  // Every failure path above throws, so all requested skills were copied.
  return skillIds;
}

/** Diagnostic only: notes when a requested skill also exists as a marketplace plugin. */
function logMarketplacePluginMatch(skillId: SkillId, marketplace: Marketplace): void {
  const plugin = marketplace.plugins.find((p) => p.name === skillId);
  if (!plugin) return;
  verbose(`Found skill plugin in marketplace: ${skillId}`);
  verbose(`Plugin source: ${resolvePluginSource(plugin, marketplace)}`);
}

async function findSkillPath(baseDir: string, skillId: SkillId): Promise<string | null> {
  if (!(await directoryExists(baseDir))) {
    verbose(`Skills base directory not found: ${baseDir}`);
    return null;
  }

  const matches = await glob(`**/${skillId}*/SKILL.md`, baseDir);

  if (matches.length > 0) {
    return path.join(baseDir, path.dirname(matches[0]));
  }

  return null;
}
