import { Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import { sortBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { loadSource } from "../lib/operations/index.js";
import type { ResolvedSkill } from "../types/index.js";
import { STATUS_MESSAGES } from "../utils/messages.js";
import { stripTerminalControls, truncateText } from "../utils/string.js";
import { typedValues } from "../utils/typed-object.js";

const MAX_DESCRIPTION_WIDTH = 50;

/**
 * One row of the results table. Every column is rendered for its cell, so all five are plain
 * strings — including the two that used to be carried through as the skill's own `SkillId` and
 * `CategoryPath`.
 *
 * They stopped being the skill's own values when they started being sanitised, and the type says
 * so rather than casting the sanitised string back into a union it is no longer known to be in.
 * Nothing downstream of this looks a row up by id: it is five strings and a table.
 */
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
 * itself, so the read is one load and no network beyond it.
 */
async function loadSearchableSkills(): Promise<ResolvedSkill[]> {
  const { sourceResult } = await loadSource({ projectDir: process.cwd() });

  return typedValues(sourceResult.matrix.skills);
}

/**
 * The machine id and the display name are different answers and get a column each — `edit`
 * takes the id, a human reads the name.
 *
 * Every one of the five is a string a catalogue author wrote, and this is where they stop being
 * that and become cells. `--marketplace` is a supported input, so a stranger's repository reaches
 * this table by the product's advertised route: an unsanitised `displayName` carrying an
 * erase-line and a carriage return repaints the row, and `@oclif/table` sizes the column on the
 * escape bytes as well, so the border moves too. Only `description` carries a budget, because
 * only `description` is prose; the other four are identifiers and are shown whole.
 */
function toResultRow(skill: ResolvedSkill): ResultRow {
  return {
    id: stripTerminalControls(skill.id),
    name: stripTerminalControls(skill.displayName),
    source: stripTerminalControls(activeSourceName(skill)),
    category: stripTerminalControls(skill.category),
    description: truncateText(skill.description, MAX_DESCRIPTION_WIDTH),
  };
}

/**
 * Where this installation reads the skill from: the local copy when one is on disk, otherwise
 * the marketplace the load resolved. Both names are written by the tagging pass
 * (`loadSkillsFromAllSources`), which `loadSource` always runs — a skill that reached the table
 * untagged would have no origin to report, so say so rather than name one it might not have.
 */
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
