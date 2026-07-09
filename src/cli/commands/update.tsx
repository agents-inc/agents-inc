import React from "react";

import { Flags, Args } from "@oclif/core";
import { printTable } from "@oclif/table";
import { render } from "ink";
import os from "os";
import path from "path";

import { BaseCommand } from "../base-command.js";
import { getErrorMessage } from "../utils/errors.js";
import { copy } from "../utils/fs.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  loadSource,
  compareSkillsWithSource,
  compileAgents,
  collectScopedSkillDirs,
  findSkillMatch,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { CLI_INVOKE_COMMAND, LOCAL_SKILLS_PATH } from "../consts.js";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
} from "../utils/messages.js";
import { Confirm } from "../components/common/confirm.js";
import { injectForkedFromMetadata, type SkillComparisonResult } from "../lib/skills/index.js";
import type { SourceLoadResult } from "../lib/loading/source-loader.js";

type UpdateConfirmProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

const UpdateConfirm: React.FC<UpdateConfirmProps> = ({ onConfirm, onCancel }) => {
  return (
    <Confirm
      message="Proceed with update?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      defaultValue={false}
    />
  );
};

type UpdateContext = {
  projectDir: string;
  homeDir: string;
  sourceResult: SourceLoadResult;
  allResults: SkillComparisonResult[];
  skillBaseDir: Map<string, string>;
};

export default class Update extends BaseCommand {
  static summary = "Update local skills from source";

  static description =
    "Update local skills from the source repository. By default, checks all skills for updates. Specify a skill name to update only that skill.";

  static args = {
    skill: Args.string({
      description: "Specific skill to update (optional)",
      required: false,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> my-skill",
    "<%= config.bin %> <%= command.id %> --yes",
    "<%= config.bin %> <%= command.id %> --source /path/to/marketplace",
  ];

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Update);
    const projectDir = process.cwd();

    try {
      const context = await this.loadContext(flags, projectDir);
      if (!context) return;

      const outdatedSkills = this.resolveTargetSkills(args.skill, context);
      if (!outdatedSkills) return;

      this.printUpdateTable(outdatedSkills);

      const confirmed = flags.yes || (await this.confirmUpdate());
      if (!confirmed) return;

      this.log("");

      const updateResult = await this.executeUpdates(outdatedSkills, context);
      this.printUpdateResults(updateResult);

      const recompiledAgents = await this.recompileAfterUpdate(updateResult, context);

      this.printCompletionSummary(updateResult, recompiledAgents);
    } catch (error) {
      const message = getErrorMessage(error);
      this.error(`Update failed: ${message}`, { exit: EXIT_CODES.ERROR });
    }
  }

  private async loadContext(
    flags: { source?: string },
    projectDir: string,
  ): Promise<UpdateContext | null> {
    const homeDir = os.homedir();
    const { hasProject, hasGlobal } = await collectScopedSkillDirs(projectDir);

    if (!hasProject && !hasGlobal) {
      this.warn(ERROR_MESSAGES.NO_LOCAL_SKILLS);
      return null;
    }

    this.log(STATUS_MESSAGES.LOADING_SKILLS);

    const { sourceResult } = await loadSource({
      sourceFlag: flags.source,
      projectDir,
    });

    this.log(
      `Loaded from ${sourceResult.isLocal ? "local" : "remote"}: ${sourceResult.sourcePath}`,
    );

    const comparison = await compareSkillsWithSource(
      projectDir,
      sourceResult.sourcePath,
      sourceResult.matrix,
    );

    const skillBaseDir = new Map<string, string>();
    for (const r of comparison.projectResults) skillBaseDir.set(r.id, projectDir);
    for (const r of comparison.globalResults) {
      if (!skillBaseDir.has(r.id)) skillBaseDir.set(r.id, homeDir);
    }

    return {
      projectDir,
      homeDir,
      sourceResult,
      allResults: comparison.merged,
      skillBaseDir,
    };
  }

  private resolveTargetSkills(
    skillArg: string | undefined,
    context: UpdateContext,
  ): SkillComparisonResult[] | null {
    let outdatedSkills = context.allResults.filter((r) => r.status === "outdated");

    if (skillArg) {
      const { match: foundSkill, similar } = findSkillMatch(skillArg, context.allResults);

      if (!foundSkill) {
        this.log("");
        this.log(`Error: Skill "${skillArg}" not found.`);
        this.log("");

        if (similar.length > 0) {
          this.log("Did you mean one of these?");
          for (const name of similar) {
            this.log(`  - ${name}`);
          }
          this.log("");
        }

        this.log(`Run \`${CLI_INVOKE_COMMAND} search ${skillArg}\` to search available skills.`);
        this.log("");
        this.error(ERROR_MESSAGES.SKILL_NOT_FOUND, { exit: EXIT_CODES.ERROR });
      }

      if (foundSkill.status === "current") {
        this.log("");
        this.log(`Skill "${foundSkill.id}" is already up to date.`);
        this.log("");
        this.log(`  Local hash:  ${foundSkill.localHash}`);
        this.log(`  Source hash: ${foundSkill.sourceHash}`);
        this.log("");
        return null;
      }

      if (foundSkill.status === "local-only") {
        this.log("");
        this.log(`Skill "${foundSkill.id}" is a local-only skill (not forked from source).`);
        this.log("Cannot update local-only skills.");
        this.log("");
        return null;
      }

      outdatedSkills = [foundSkill];
    }

    if (outdatedSkills.length === 0) {
      this.log("");
      this.logSuccess(SUCCESS_MESSAGES.ALL_SKILLS_UP_TO_DATE);
      this.log("");
      return null;
    }

    return outdatedSkills;
  }

  private printUpdateTable(outdatedSkills: SkillComparisonResult[]): void {
    this.log("");
    this.log("The following skills will be updated:");
    this.log("");

    printTable({
      data: outdatedSkills.map((skill) => ({
        skill: skill.id,
        localHash: skill.localHash ?? "-",
        sourceHash: skill.sourceHash ?? "-",
      })),
      columns: [
        { key: "skill", name: "Skill" },
        { key: "localHash", name: "Local Hash" },
        { key: "sourceHash", name: "Source Hash" },
      ],
      headerOptions: { bold: true },
    });

    this.log("");
    this.log(`${outdatedSkills.length} skill(s) will be updated.`);
    this.log("");
  }

  private async confirmUpdate(): Promise<boolean> {
    let confirmed = false;
    let cancelled = false;

    const { waitUntilExit } = render(
      <UpdateConfirm
        onConfirm={() => {
          confirmed = true;
        }}
        onCancel={() => {
          cancelled = true;
        }}
      />,
    );

    await waitUntilExit();

    if (cancelled) {
      this.log("Update cancelled");
      this.exit(EXIT_CODES.CANCELLED);
    }

    if (!confirmed) {
      this.log(INFO_MESSAGES.NO_CHANGES_MADE);
      return false;
    }

    return true;
  }

  private async executeUpdates(
    outdatedSkills: SkillComparisonResult[],
    context: UpdateContext,
  ): Promise<UpdateLocalSkillsResult> {
    return updateLocalSkills({
      skills: outdatedSkills,
      sourceResult: context.sourceResult,
      skillBaseDir: context.skillBaseDir,
      onProgress: (skillId) => this.log(`Updating ${skillId}...`),
    });
  }

  private printUpdateResults(updateResult: UpdateLocalSkillsResult): void {
    for (const item of updateResult.updated) {
      this.log(`  Updated ${item.id}`);
    }
    for (const item of updateResult.failed) {
      this.log(`  Failed to update ${item.id}: ${item.error}`);
    }
  }

  private async recompileAfterUpdate(
    updateResult: UpdateLocalSkillsResult,
    context: UpdateContext,
  ): Promise<string[]> {
    if (updateResult.totalUpdated === 0) return [];

    this.log("");
    this.log(STATUS_MESSAGES.RECOMPILING_AGENTS);

    try {
      const { allSkills } = await discoverInstalledSkills(context.projectDir);
      const recompileResult = await compileAgents({
        projectDir: context.projectDir,
        sourcePath: context.sourceResult.sourcePath,
        skills: allSkills,
      });

      const recompiledAgents = recompileResult.compiled;

      if (recompiledAgents.length > 0) {
        this.log("Agents recompiled");
        for (const agent of recompiledAgents) {
          this.log(`  Recompiled: ${agent}`);
        }
      } else {
        this.log(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE);
      }

      if (recompileResult.warnings.length > 0) {
        for (const warning of recompileResult.warnings) {
          this.warn(warning);
        }
      }

      return recompiledAgents;
    } catch (error) {
      this.warn("Agent recompilation failed");
      this.warn(`Could not recompile agents: ${getErrorMessage(error)}`);
      return [];
    }
  }

  private printCompletionSummary(
    updateResult: UpdateLocalSkillsResult,
    recompiledAgents: string[],
  ): void {
    this.log("");
    if (updateResult.totalFailed === 0) {
      const agentMsg =
        recompiledAgents.length > 0 ? `, ${recompiledAgents.length} agent(s) recompiled` : "";
      this.logSuccess(`Update complete! ${updateResult.totalUpdated} skill(s) updated${agentMsg}.`);
    } else {
      this.warn(
        `Update finished with errors: ${updateResult.totalUpdated} updated, ${updateResult.totalFailed} failed.`,
      );
    }
    this.log("");

    if (updateResult.totalFailed > 0) {
      this.error("Some updates failed", { exit: EXIT_CODES.ERROR });
    }
  }
}

type SkillUpdateResult = {
  id: string;
  success: boolean;
  newHash: string | null;
  error?: string;
};

type UpdateLocalSkillsResult = {
  updated: SkillUpdateResult[];
  failed: SkillUpdateResult[];
  totalUpdated: number;
  totalFailed: number;
};

type UpdateLocalSkillsOptions = {
  skills: SkillComparisonResult[];
  sourceResult: SourceLoadResult;
  skillBaseDir: Map<string, string>;
  /** Called before each skill update starts. Use for progress logging. */
  onProgress?: (skillId: string) => void;
};

/**
 * Updates local skills by copying from source and injecting metadata.
 *
 * For each outdated skill, copies the source version to the local skills
 * directory and injects forked-from metadata for change tracking.
 */
async function updateLocalSkills(
  options: UpdateLocalSkillsOptions,
): Promise<UpdateLocalSkillsResult> {
  const { skills, sourceResult, skillBaseDir, onProgress } = options;
  const updated: SkillUpdateResult[] = [];
  const failed: SkillUpdateResult[] = [];

  for (const skill of skills) {
    onProgress?.(skill.id);
    if (!skill.sourcePath || !skill.sourceHash) {
      failed.push({
        id: skill.id,
        success: false,
        newHash: null,
        error: "No source path available",
      });
      continue;
    }

    const baseDir = skillBaseDir.get(skill.id) ?? process.cwd();
    const localSkillsPath = path.join(baseDir, LOCAL_SKILLS_PATH);
    const destPath = path.join(localSkillsPath, skill.dirName);
    const srcPath = path.join(sourceResult.sourcePath, "src", skill.sourcePath);

    try {
      await copy(srcPath, destPath);
      await injectForkedFromMetadata(destPath, skill.id, skill.sourceHash);
      updated.push({ id: skill.id, success: true, newHash: skill.sourceHash });
    } catch (error) {
      failed.push({ id: skill.id, success: false, newHash: null, error: getErrorMessage(error) });
    }
  }

  return {
    updated,
    failed,
    totalUpdated: updated.length,
    totalFailed: failed.length,
  };
}
