import { Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import { sortBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { EDITOR_ADDRESS } from "../consts.js";
import { loadSource } from "../lib/operations/index.js";
import type { ResolvedSkill } from "../types/index.js";
import { STATUS_MESSAGES } from "../utils/messages.js";
import { plural, stripTerminalControls, truncateText } from "../utils/string.js";
import { typedValues } from "../utils/typed-object.js";

const MAX_DESCRIPTION_WIDTH = 50;

/** Plain strings: sanitised values are no longer known to be in their unions. */
type ResultRow = {
  id: string;
  name: string;
  source: string;
  category: string;
  description: string;
};

export default class Search extends BaseCommand {
  static summary = "Search the catalog of available skills";
  static description =
    "Read-only catalog browse. Searches the marketplace this installation reads from, " +
    "plus the local skills already on disk, by id, displayName, slug, description, or " +
    `category. To install one, add it in ${EDITOR_ADDRESS}.`;

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
    // The configs name the marketplace searched, so an unreadable one is not read past.
    await this.ensureConfigReadable(process.cwd());
    await this.runSearch(args.query);
  }

  private async runSearch(query: string): Promise<void> {
    try {
      this.log(STATUS_MESSAGES.LOADING_SKILLS);
      const results = skillsMatching(await loadSearchableSkills(), query);

      this.log("");
      if (results.length === 0) {
        this.warn(`No skills found matching "${query}"`);
        return;
      }

      this.log(`Found ${plural(results.length, "skill")} matching "${query}"`);
      this.log("");
      printResultsTable(results);
      this.log("");
    } catch (error) {
      this.handleError(error);
    }
  }
}

/** The marketplace matrix, with on-disk local skills already merged in by `loadSource`. */
async function loadSearchableSkills(): Promise<ResolvedSkill[]> {
  const { sourceResult } = await loadSource({ projectDir: process.cwd() });

  return typedValues(sourceResult.matrix.skills);
}

/** In display-name order, case aside. */
function skillsMatching(skills: ResolvedSkill[], query: string): ResolvedSkill[] {
  return sortBy(
    skills.filter((skill) => matchesQuery(skill, query)),
    (skill) => skill.displayName.toLowerCase(),
  );
}

function printResultsTable(results: ResolvedSkill[]): void {
  printTable({
    data: results.map(toResultRow),
    columns: [
      { key: "id", name: "ID" },
      { key: "name", name: "Name" },
      { key: "source", name: "Origin" },
      { key: "category", name: "Category" },
      { key: "description", name: "Description" },
    ],
    headerOptions: { bold: true },
  });
}

/** Strips terminal controls: a third-party marketplace's text could otherwise repaint the table. */
function toResultRow(skill: ResolvedSkill): ResultRow {
  return {
    id: stripTerminalControls(skill.id),
    name: stripTerminalControls(skill.displayName),
    source: stripTerminalControls(activeSourceName(skill)),
    category: stripTerminalControls(skill.category),
    description: truncateText(skill.description, MAX_DESCRIPTION_WIDTH),
  };
}

/** `loadSource` always tags an origin, so an untagged skill is a bug, not a fallback case. */
function activeSourceName(skill: ResolvedSkill): string {
  const { activeSource } = skill;
  if (!activeSource) {
    throw new Error(
      `Skill "${skill.id}" was loaded with no origin, so where it comes from is unknown`,
    );
  }
  return activeSource.name;
}

function matchesQuery(skill: ResolvedSkill, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return [skill.id, skill.displayName, skill.slug, skill.description, skill.category].some(
    (field) => field.toLowerCase().includes(lowerQuery),
  );
}
