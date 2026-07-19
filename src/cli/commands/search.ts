import { Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import path from "path";
import { sortBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { DEFAULT_SKILLS_SUBDIR, STANDARD_FILES } from "../consts.js";
import { resolveAllSources } from "../lib/configuration/index.js";
import { fetchFromSource, parseFrontmatter } from "../lib/loading/index.js";
import { loadSource } from "../lib/operations/index.js";
import type { SourceEntry } from "../types/config.js";
import type { CategoryPath, ResolvedSkill, SkillSlug } from "../types/index.js";
import { fileExists, listDirectories, readFile } from "../utils/fs.js";
import { STATUS_MESSAGES } from "../utils/messages.js";
import { truncateText } from "../utils/string.js";

const MAX_DESCRIPTION_WIDTH = 50;
const PRIMARY_SOURCE_NAME = "marketplace";

type SearchableSkill = ResolvedSkill & { sourceName: string };

export default class Search extends BaseCommand {
  static summary = "Search the catalog of available skills across all registered sources";
  static description =
    "Read-only catalog browse. Searches every registered source (primary + extras) " +
    "by id, displayName, slug, description, or category. Use `import skill` to install.";

  static examples = [
    {
      description: "Search for React skills",
      command: "<%= config.bin %> search react",
    },
    {
      description: "Search by any keyword (matches id, name, description, category)",
      command: "<%= config.bin %> search state",
    },
  ];

  static args = {
    query: Args.string({
      description: "Search query (matches id, displayName, slug, description, category)",
      required: true,
    }),
  };

  // Override parent baseFlags to drop --source (search is a zero-flag command)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {};

  async run(): Promise<void> {
    const { args } = await this.parse(Search);
    await this.runSearch(args.query);
  }

  private async runSearch(query: string): Promise<void> {
    try {
      this.log(STATUS_MESSAGES.LOADING_SKILLS);

      const projectDir = process.cwd();
      const allSkills = await loadSkillsFromAllSources(projectDir);

      const results = sortBy(
        allSkills.filter((skill) => matchesQuery(skill, query)),
        (r) => r.displayName.toLowerCase(),
      );

      this.log("");
      if (results.length === 0) {
        this.warn(`No skills found matching "${query}"`);
        return;
      }

      this.logInfo(
        `Found ${results.length} skill${results.length === 1 ? "" : "s"} matching "${query}"`,
      );
      this.log("");

      printTable({
        data: results.map((skill) => ({
          id: skill.displayName,
          source: skill.sourceName,
          category: skill.category,
          description: truncateText(skill.description, MAX_DESCRIPTION_WIDTH),
        })),
        columns: [
          { key: "id", name: "ID" },
          { key: "source", name: "Source" },
          { key: "category", name: "Category" },
          { key: "description", name: "Description" },
        ],
        headerOptions: { bold: true },
      });
      this.log("");
    } catch (error) {
      this.handleError(error);
    }
  }
}

async function loadSkillsFromAllSources(projectDir: string): Promise<SearchableSkill[]> {
  const { sourceResult } = await loadSource({ projectDir });
  const { matrix } = sourceResult;

  const primarySkills: SearchableSkill[] = Object.values(matrix.skills)
    .filter((skill): skill is ResolvedSkill => skill !== undefined)
    .map((skill) => ({ ...skill, sourceName: PRIMARY_SOURCE_NAME }));

  const { extras } = await resolveAllSources(projectDir);

  const extraSkillArrays = await Promise.all(extras.map(fetchSkillsFromExternalSource));

  return [...primarySkills, ...extraSkillArrays.flat()];
}

async function fetchSkillsFromExternalSource(source: SourceEntry): Promise<SearchableSkill[]> {
  try {
    const result = await fetchFromSource(source.url, {});
    const skillsDir = path.join(result.path, DEFAULT_SKILLS_SUBDIR);

    if (!(await fileExists(skillsDir))) {
      return [];
    }

    const skillDirs = await listDirectories(skillsDir);
    const loaded = await Promise.all(
      skillDirs.map((skillDir) => loadExternalSkill(skillsDir, skillDir, source.name)),
    );
    return loaded.filter((skill) => skill !== null);
  } catch {
    // Source unavailable, return empty
    return [];
  }
}

/** Loads one external skill dir as a SearchableSkill, or null when it has no valid SKILL.md. */
async function loadExternalSkill(
  skillsDir: string,
  skillDir: string,
  sourceName: string,
): Promise<SearchableSkill | null> {
  const skillMdPath = path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD);
  if (!(await fileExists(skillMdPath))) return null;

  const content = await readFile(skillMdPath);
  const frontmatter = parseFrontmatter(content, skillMdPath);
  if (!frontmatter) return null;

  return {
    id: frontmatter.name,
    description: frontmatter.description,
    // Boundary cast: directory name used as slug for third-party source skill
    slug: skillDir as SkillSlug,
    displayName: skillDir,
    // Boundary cast: external source skills have no real category; "imported" is a display-only placeholder
    category: "imported" as CategoryPath,
    author: `@${sourceName}`,
    conflictsWith: [],
    isRecommended: false,
    requires: [],
    alternatives: [],
    discourages: [],
    compatibleWith: [],
    path: path.join(skillsDir, skillDir),
    sourceName,
  };
}

function matchesQuery(skill: ResolvedSkill, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return [skill.id, skill.displayName, skill.slug, skill.description, skill.category].some(
    (field) => field.toLowerCase().includes(lowerQuery),
  );
}
