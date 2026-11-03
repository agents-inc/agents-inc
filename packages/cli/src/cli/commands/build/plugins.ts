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
import { readPluginManifest } from "../../lib/plugins";
import { plural } from "../../utils/string";

export default class BuildPlugins extends BaseCommand {
  static summary = "Build skills into standalone plugins";

  static description =
    "Build skills into standalone plugins. By default, compiles all skills. Use --skill to compile a specific skill only.";

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
      description: "Compile with verbose logging",
      command: "<%= config.bin %> <%= command.id %> --verbose",
    },
  ];

  static flags = {
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

      if (expectedSkillPlugins) {
        await this.pruneStalePlugins(outputDir, expectedSkillPlugins);
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
   * Returns the plugin names that should remain, or `null` to skip pruning: in single-skill mode,
   * or after a failure, since a failed skill is indistinguishable from a removed one.
   */
  private async compileSkills(
    skillFlag: string | undefined,
    skillsDir: string,
    outputDir: string,
  ): Promise<Set<string> | null> {
    if (skillFlag) {
      await this.compileOneSkill(path.resolve(skillsDir, skillFlag), outputDir);
      return null;
    }

    return this.compileEverySkill(skillsDir, outputDir);
  }

  private async compileOneSkill(skillPath: string, outputDir: string): Promise<void> {
    this.log(`Compiling skill at ${skillPath}...`);

    const result = await compileSkillPlugin({
      skillPath,
      outputDir,
    });

    this.log(`Compiled ${result.skillName}`);
    this.log(`  Plugin path: ${result.pluginPath}`);
  }

  private async compileEverySkill(
    skillsDir: string,
    outputDir: string,
  ): Promise<Set<string> | null> {
    this.log("Finding and compiling all skills...");

    const { compiled, failed } = await compileAllSkillPlugins(skillsDir, outputDir);

    this.log(`Compiled ${plural(compiled.length, "skill plugin")}`);
    printCompilationSummary(compiled);

    if (failed.length > 0) {
      this.warn(
        `Skipping stale-plugin pruning: ${plural(failed.length, "skill")} failed to compile ` +
          `(${failed.join(", ")}). A failed skill is indistinguishable from a removed one.`,
      );
      return null;
    }

    return new Set(compiled.map((result) => result.skillName));
  }

  private async pruneStalePlugins(
    outputDir: string,
    expectedSkillPlugins: ReadonlySet<string>,
  ): Promise<void> {
    const dirNames = await listDirectories(outputDir);

    for (const dirName of dirNames) {
      if (expectedSkillPlugins.has(dirName)) continue;

      const pluginDir = path.join(outputDir, dirName);
      const manifest = await readPluginManifest(pluginDir);
      if (!manifest) continue;

      await remove(pluginDir);
      this.log(`  Pruned stale plugin: ${dirName}`);
    }
  }
}
