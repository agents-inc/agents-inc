import { Flags } from "@oclif/core";
import path from "path";

import { BaseCommand } from "../../base-command";
import { setVerbose } from "../../utils/logger";
import { listDirectories, remove } from "../../utils/fs";
import { DIRS, PLUGINS_DIST_PATH } from "../../consts";
import {
  compileAllSkillPlugins,
  compileSkillPlugin,
  printCompilationSummary,
} from "../../lib/skills";
import { compileAllAgentPlugins, printAgentCompilationSummary } from "../../lib/agents";
import { readPluginManifest } from "../../lib/plugins";

export default class BuildPlugins extends BaseCommand {
  static summary = "Build skills and agents into standalone plugins";

  static description =
    "Build skills and agents into standalone plugins. By default, compiles all skills. Use --skill to compile a specific skill only. Use --agents-dir to also compile agents.";

  static examples = [
    {
      description: "Compile every skill into plugins",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Compile a single skill by name",
      command: "<%= config.bin %> <%= command.id %> --skill cli-commander",
    },
    {
      description: "Write plugins to a custom output directory",
      command: "<%= config.bin %> <%= command.id %> --output-dir ./plugins",
    },
    {
      description: "Also compile agents from a directory",
      command: "<%= config.bin %> <%= command.id %> --agents-dir ./agents",
    },
    {
      description: "Compile with verbose logging",
      command: "<%= config.bin %> <%= command.id %> --verbose",
    },
  ];

  // Override parent baseFlags to drop --source (build plugins reads from local DIRS.skills, not a remote source)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {
    "agents-dir": Flags.string({
      char: "a",
      description: "Agents source directory (builds one plugin per agent)",
    }),
    "output-dir": Flags.string({
      char: "o",
      description: "Output directory",
      default: PLUGINS_DIST_PATH,
    }),
    skill: Flags.string({
      description: "Compile only a specific skill (path to skill directory)",
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose logging",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(BuildPlugins);
    setVerbose(flags.verbose);

    const projectRoot = process.cwd();
    const skillsDir = path.resolve(projectRoot, DIRS.skills);
    const outputDir = path.resolve(projectRoot, flags["output-dir"]);

    this.printHeader(skillsDir, outputDir);

    try {
      const expectedSkillPlugins = await this.compileSkills(flags.skill, skillsDir, outputDir);

      if (flags["agents-dir"]) {
        await this.compileAgents(projectRoot, flags["agents-dir"], outputDir);
      }

      if (expectedSkillPlugins) {
        await this.pruneStaleSkillPlugins(outputDir, expectedSkillPlugins);
      }

      this.log("");
      this.logSuccess("Plugin compilation complete!");
    } catch (error) {
      this.log("Compilation failed");
      this.handleError(error);
    }
  }

  private printHeader(skillsDir: string, outputDir: string): void {
    this.log("");
    this.log("Compiling skill plugins");
    this.log(`  Skills directory: ${skillsDir}`);
    this.log(`  Output directory: ${outputDir}`);
    this.log("");
  }

  /**
   * Compiles skills and returns the set of plugin directory names that should
   * exist afterward — used to prune stale plugins. Returns `null` when pruning
   * must be skipped: single-skill mode (would wipe every other plugin) or a
   * partial compile failure (a failed skill is indistinguishable from a removed
   * one, so deleting it would be a worse bug than the stale entry).
   */
  private async compileSkills(
    skillFlag: string | undefined,
    skillsDir: string,
    outputDir: string,
  ): Promise<Set<string> | null> {
    if (skillFlag) {
      const skillPath = path.resolve(skillsDir, skillFlag);
      this.log(`Compiling skill at ${skillPath}...`);

      const result = await compileSkillPlugin({
        skillPath,
        outputDir,
      });

      this.log(`Compiled ${result.skillName}`);
      this.log(`  Plugin path: ${result.pluginPath}`);
      return null;
    }

    this.log("Finding and compiling all skills...");

    const { compiled, failed } = await compileAllSkillPlugins(skillsDir, outputDir);

    this.log(`Compiled ${compiled.length} skill plugins`);
    printCompilationSummary(compiled);

    if (failed.length > 0) {
      this.warn(
        `Skipping stale-plugin pruning: ${failed.length} skill(s) failed to compile ` +
          `(${failed.join(", ")}). A failed skill is indistinguishable from a removed one.`,
      );
      return null;
    }

    return new Set(compiled.map((result) => result.skillName));
  }

  private async compileAgents(
    projectRoot: string,
    agentsDir: string,
    outputDir: string,
  ): Promise<void> {
    const resolvedAgentsDir = path.resolve(projectRoot, agentsDir);

    this.log("");
    this.log("Compiling agent plugins");
    this.log(`  Agents directory: ${resolvedAgentsDir}`);
    this.log("");

    this.log("Finding and compiling all agents...");

    const agentResults = await compileAllAgentPlugins(resolvedAgentsDir, outputDir);

    this.log(`Compiled ${agentResults.length} agent plugins`);
    printAgentCompilationSummary(agentResults);
  }

  /**
   * Removes skill-plugin directories in `outputDir` that no longer correspond to
   * a compiled skill. Only skill plugins are pruned: agent plugins are preserved
   * (this run has no authority over them) and non-plugin directories are left
   * untouched. Callers must only invoke this after a clean full-scan compile.
   */
  private async pruneStaleSkillPlugins(
    outputDir: string,
    expectedSkillPlugins: ReadonlySet<string>,
  ): Promise<void> {
    const dirNames = await listDirectories(outputDir);

    for (const dirName of dirNames) {
      if (expectedSkillPlugins.has(dirName)) continue;

      const pluginDir = path.join(outputDir, dirName);
      const manifest = await readPluginManifest(pluginDir);
      if (!manifest) continue;
      if (manifest.agents !== undefined) continue;

      await remove(pluginDir);
      this.log(`  Pruned stale plugin: ${dirName}`);
    }
  }
}
