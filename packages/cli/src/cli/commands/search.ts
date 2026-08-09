import { Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import { sortBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { loadSource } from "../lib/operations/index.js";
import type { ResolvedSkill } from "../types/index.js";
import { STATUS_MESSAGES } from "../utils/messages.js";
import { truncateText } from "../utils/string.js";
import { typedValues } from "../utils/typed-object.js";

const MAX_DESCRIPTION_WIDTH = 50;
const PRIMARY_SOURCE_NAME = "marketplace";

type SearchableSkill = ResolvedSkill & { sourceName: string };

export default class Search extends BaseCommand {
  static summary = "Search the catalog of available skills";
  static description =
    "Read-only catalog browse. Searches the marketplace this installation reads from, " +
    "plus the local skills already on disk, by id, displayName, slug, description, or " +
    "category. Use `edit` to install what it finds.";

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

  static flags = {};

  async run(): Promise<void> {
    const { args } = await this.parse(Search);
    await this.runSearch(args.query);
  }

  private async runSearch(query: string): Promise<void> {
    try {
      this.log(STATUS_MESSAGES.LOADING_SKILLS);

      const allSkills = await loadSearchableSkills();

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

/**
 * Every skill the catalog can offer: the marketplace matrix, which `loadSource` has already
 * merged the on-disk local skills into. There is no second source to reach for — the
 * registered-extras array this used to fan out over was withdrawn with the marketplace axis
 * (CLI-450), so the read is one load and no network beyond it.
 */
async function loadSearchableSkills(): Promise<SearchableSkill[]> {
  const { sourceResult } = await loadSource({ projectDir: process.cwd() });

  return typedValues(sourceResult.matrix.skills).map((skill) => ({
    ...skill,
    sourceName: PRIMARY_SOURCE_NAME,
  }));
}

function matchesQuery(skill: ResolvedSkill, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return [skill.id, skill.displayName, skill.slug, skill.description, skill.category].some(
    (field) => field.toLowerCase().includes(lowerQuery),
  );
}
