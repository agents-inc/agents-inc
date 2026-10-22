import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BaseCommand } from "./base-command";
import { EXIT_CODES } from "./lib/exit-codes";
import { setVerbose } from "./utils/logger";
import { CLI_ROOT } from "./lib/__tests__/helpers/cli-runner";
import { setupIsolatedHome } from "./lib/__tests__/helpers/isolated-home";
import { writeRawTestConfig, writeTestTsConfig } from "./lib/__tests__/helpers/config-io";
import { createMockPluginHost } from "./lib/__tests__/helpers/mock-plugin-host";
import { buildSkillConfig } from "./lib/__tests__/helpers/index";
import { flattenCliOutput } from "./lib/__tests__/helpers/flatten-cli-output";
import {
  buildAgentConfigs,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
} from "./lib/__tests__/factories/config-factories";
import { buildGateReport } from "./lib/__tests__/factories/gate-report-factories";
import { renderUnparseableConfigTs } from "./lib/__tests__/factories/unloadable-config-factories";
import { renderMetadataYaml, renderSkillMd } from "./lib/__tests__/content-generators";
import {
  CATEGORY_EXCLUSIVITY_MATRIX,
  SINGLE_REACT_MATRIX,
} from "./lib/__tests__/mock-data/mock-matrices";
import { delay } from "./lib/__tests__/test-constants";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "./consts";
import type { GateReport } from "./lib/config-gate/index.js";
import type { PluginHost } from "./lib/hosts/plugin-host.js";
import type { PluginInstallResult } from "./lib/operations/skills/install-plugin-skills.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { MergedSkillsMatrix, ProjectConfig, SelectionValidation, SkillConfig } from "./types";
import type { SourceLoadResult } from "./lib/loading/source-loader.js";

/** What a probe run does with the command; set by each spec before it runs. */
type Script = (probe: Probe) => Promise<void> | void;

let script: Script = () => undefined;

/** A command whose run is the spec's script, with the protected surface opened to it. */
class Probe extends BaseCommand {
  async run(): Promise<void> {
    await script(this);
  }

  announce(): void {
    this.announcePluginInstall();
  }

  reportInstalls(result: PluginInstallResult): void {
    this.reportPluginInstalls(result);
  }

  fanOut(report: GateReport): void {
    this.reportFanOut(report);
  }

  outOfReach(report: GateReport): void {
    this.reportProjectsOutOfReach(report.propagated);
  }

  unassigned(config: ProjectConfig, selected: readonly SkillConfig[]): void {
    this.reportUnassignedSkills(config, selected);
  }

  savedSkillsReadable(
    saved: readonly SkillConfig[],
    matrix: MergedSkillsMatrix,
    projectDir: string,
  ): Promise<void> {
    return this.ensureSavedSkillsReadable(saved, matrix, projectDir);
  }

  projectScopedAtHome(
    selection: InstallSelection,
    projectDir: string,
    installedHere = false,
  ): void {
    this.refuseProjectScopedContentAtHome(selection, projectDir, installedHere);
  }

  placementsBeforeWriting(skills: readonly SkillConfig[], root: string): void {
    this.refuseUnofferablePlacementsBeforeWriting(skills, root);
  }

  sharedConfigBeforeAsking(
    selection: InstallSelection,
    root: string,
    sourceResult: SourceLoadResult,
  ): Promise<void> {
    return this.refuseSharedConfigBeforeAsking(selection, [], root, sourceResult);
  }

  marketplaceOrExit(
    sourceResult: SourceLoadResult,
    host: PluginHost,
    onRegistered: (marketplace: string) => void,
  ): Promise<string> {
    return this.requireMarketplaceOrExit(sourceResult, "install plugin skills", host, onRegistered);
  }

  brandingName(projectDir: string): Promise<string> {
    return this.resolveBrandingName(projectDir);
  }

  validationErrors(validation: SelectionValidation): void {
    this.reportValidationErrors(validation);
  }

  incomplete(what: string, recovery: string): void {
    this.reportIncompleteWork(what, recovery);
  }

  recorded(what: string, recovery: string): void {
    this.recordIncompleteWork(what, recovery);
  }

  endOfRun(): void {
    this.exitIfWorkIncomplete();
  }
}

/** `raw` keeps the escape sequences, which captureOutput strips by default. */
function runProbe(body: Script, { raw = false } = {}): ReturnType<typeof captureOutput> {
  script = body;
  return captureOutput(() => Probe.run([], { root: CLI_ROOT }), {
    print: false,
    stripAnsi: !raw,
  });
}

const PROJECT_DIR_NAME = "registered-project";

const RUN_STARTS_WAITING_TIMEOUT_MS = 10_000;

describe("BaseCommand", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-base-command-test-"));
  });

  afterEach(async () => {
    script = () => undefined;
    await cleanup();
  });

  describe("a terminal too small to draw in", () => {
    const real = { columns: process.stdout.columns, rows: process.stdout.rows };

    function sizeTheTerminal(columns: number, rows: number): void {
      Object.assign(process.stdout, { columns, rows });
    }

    /** Node's own count: a poll left running keeps the CLI's process alive after its run. */
    function runningTimers(): number {
      return process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
    }

    afterEach(() => {
      Object.assign(process.stdout, real);
      // Ends a wait a failed spec left pending, so its listener cannot leak into the next spec.
      process.stdout.emit("resize");
    });

    /** Until the run listens for a resize; the probe's oclif load is slow in a full parallel run. */
    async function untilTheRunWaits(listenersBefore: number): Promise<void> {
      await vi.waitFor(
        () => {
          expect(process.stdout.listenerCount("resize")).toBe(listenersBefore + 1);
        },
        { timeout: RUN_STARTS_WAITING_TIMEOUT_MS },
      );
    }

    it("clears the screen, says it is too narrow, and runs once it is resized", async () => {
      sizeTheTerminal(40, 30);
      const listenersBefore = process.stdout.listenerCount("resize");
      let ran = false;

      const run = runProbe(
        () => {
          ran = true;
        },
        { raw: true },
      );
      await untilTheRunWaits(listenersBefore);
      const ranWhileSmall = ran;
      sizeTheTerminal(120, 40);
      process.stdout.emit("resize");
      const settled = await Promise.race([run.then(() => "ran"), delay(200).then(() => "waiting")]);
      const { stdout } = await run;

      expect(ranWhileSmall).toBe(false);
      expect(settled, "a resize event ends the wait without the poll").toBe("ran");
      expect(stdout).toBe("\x1b[H\x1b[2J\x1b[3JTerminal too narrow (need 80). Please resize.\n");
      expect(process.stdout.listenerCount("resize")).toBe(listenersBefore);
    });

    it("says it is too short when it is wide enough", async () => {
      sizeTheTerminal(120, 10);

      const listenersBefore = process.stdout.listenerCount("resize");

      const run = runProbe(() => undefined);
      await untilTheRunWaits(listenersBefore);
      sizeTheTerminal(120, 40);
      process.stdout.emit("resize");
      const { stdout } = await run;

      expect(stdout).toContain("Terminal too short (need 20). Please resize.");
    });

    it("keeps waiting through a resize that leaves it too small", async () => {
      sizeTheTerminal(40, 30);
      const listenersBefore = process.stdout.listenerCount("resize");

      const run = runProbe(() => undefined);
      await untilTheRunWaits(listenersBefore);
      process.stdout.emit("resize");
      const settled = await Promise.race([run.then(() => "ran"), delay(200).then(() => "waiting")]);
      sizeTheTerminal(120, 40);
      process.stdout.emit("resize");
      await run;

      expect(settled).toBe("waiting");
    });

    it("leaves no poll running once the terminal is large enough", async () => {
      sizeTheTerminal(40, 30);
      const listenersBefore = process.stdout.listenerCount("resize");
      const timersBefore = runningTimers();

      const run = runProbe(() => undefined);
      await untilTheRunWaits(listenersBefore);
      sizeTheTerminal(120, 40);
      process.stdout.emit("resize");
      await run;

      expect(runningTimers()).toBe(timersBefore);
    });

    it("notices a resize no event reported, at the next poll", async () => {
      sizeTheTerminal(40, 30);
      let ran = false;

      const listenersBefore = process.stdout.listenerCount("resize");

      const run = runProbe(() => {
        ran = true;
      });
      await untilTheRunWaits(listenersBefore);
      sizeTheTerminal(120, 40);
      await delay(700);

      expect(ran).toBe(true);
      await run;
    });

    it("runs at once in a terminal large enough", async () => {
      sizeTheTerminal(120, 40);

      const { stdout } = await runProbe(() => undefined);

      expect(stdout).toBe("");
    });
  });

  describe("reporting plugin installs", () => {
    it("announces the install, names each plugin installed, then counts them", async () => {
      const { stdout } = await runProbe((probe) => {
        probe.announce();
        probe.reportInstalls({
          installed: [
            { id: "web-framework-react", ref: "web-framework-react@acme" },
            { id: "api-framework-hono", ref: "api-framework-hono@acme" },
          ],
          failed: [],
        });
      });

      expect(stdout).toBe(
        [
          "Installing skill plugins...",
          "  Installed web-framework-react@acme",
          "  Installed api-framework-hono@acme",
          "Installed 2 skill plugins",
          "",
          "",
        ].join("\n"),
      );
    });

    it("warns for each failed plugin and refuses to go on", async () => {
      const { stderr, error } = await runProbe((probe) => {
        probe.reportInstalls({
          installed: [],
          failed: [{ id: "web-framework-react", error: "not in the marketplace" }],
        });
      });

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Failed to install plugin web-framework-react: not in the marketplace",
      );
      expect(error?.message).toBe(
        "Failed to install 1 plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, run 'npx agents-inc update' to refresh the marketplace, or switch affected skills to eject mode.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  describe("reporting a write's reach into registered projects", () => {
    const at = (name: string): string => path.join(os.tmpdir(), name);

    it("says which projects it could not read, then how many it recompiled, with its warnings", async () => {
      const { stdout, stderr } = await runProbe((probe) => {
        probe.fanOut(
          buildGateReport({
            propagated: { updated: [at(PROJECT_DIR_NAME)], unreadable: [at("unreadable")] },
            recompile: {
              rewrittenCount: 1,
              unchangedCount: 2,
              failedCount: 1,
              warnings: ["one agent could not be written"],
            },
          }),
        );
      });

      expect(flattenCliOutput(stderr)).toBe(
        `Warning: Skipped ${at("unreadable")}: its config.ts can't be read. Warning: one agent could not be written`,
      );
      expect(stdout).toBe("Registered projects: 3 recompiled (1 failed)\n");
    });

    it("says nothing of a recompile when no registered project was updated", async () => {
      const { stdout, stderr } = await runProbe((probe) => {
        probe.fanOut(buildGateReport({ recompile: { warnings: ["never said"] } }));
      });

      expect(stdout).toBe("");
      expect(stderr).toBe("");
    });

    it("names each registered project that is gone or is another provider's", async () => {
      const { stderr } = await runProbe((probe) => {
        probe.outOfReach(
          buildGateReport({ propagated: { gone: [at("gone")], notOurs: [at("codex-one")] } }),
        );
      });

      expect(flattenCliOutput(stderr)).toBe(
        `Warning: Skipped ${at("gone")}: nothing is installed there any more. Warning: Skipped ${at("codex-one")}: it is another provider's installation.`,
      );
    });
  });

  describe("reporting what a selection's validation found", () => {
    function invalidWith(message: string): SelectionValidation {
      return {
        valid: false,
        errors: [{ type: "conflict", message, skills: ["web-framework-react"] }],
      };
    }

    it("warns each message with the terminal controls a payload could carry taken out", async () => {
      const { stderr } = await runProbe(
        (probe) =>
          probe.validationErrors(invalidWith("React \u001b]0;pwned\u0007conflicts\u001b[2J")),
        { raw: true },
      );

      expect(stderr).toBe(" ›   Warning: React conflicts\n");
    });

    it("warns a message with no terminal control in it word for word", async () => {
      const { stderr } = await runProbe(
        (probe) => probe.validationErrors(invalidWith("React conflicts with Vue")),
        { raw: true },
      );

      expect(stderr).toBe(" ›   Warning: React conflicts with Vue\n");
    });
  });

  describe("reporting skills no sub-agent loads", () => {
    it("names a selected skill no stack row assigns, and why a global sub-agent cannot take it", async () => {
      const react = buildSkillConfig("web-framework-react", { scope: "project" });
      const hono = buildSkillConfig("api-framework-hono", { scope: "project" });
      const config = buildProjectConfig({
        skills: [react, hono],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "project" }),
        ],
        stack: { "api-developer": { "api-api": [{ id: "api-framework-hono", preloaded: false }] } },
      });

      const { stderr } = await runProbe((probe) => {
        probe.unassigned(config, [react, hono]);
      });

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Skill 'web-framework-react' is assigned to no sub-agent — nothing will load it. Warning: Sub-agent 'web-developer' cannot carry project-scoped skill 'web-framework-react' — global-scoped sub-agents only carry global-scoped skills.",
      );
    });

    it("names a global-scoped skill without blaming any sub-agent's scope", async () => {
      const react = buildSkillConfig("web-framework-react", { scope: "global" });
      const config = buildProjectConfig({
        skills: [react],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { stderr } = await runProbe((probe) => {
        probe.unassigned(config, [react]);
      });

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Skill 'web-framework-react' is assigned to no sub-agent — nothing will load it.",
      );
    });

    it("blames no sub-agent for a global-scoped skill beside a project-scoped one", async () => {
      const react = buildSkillConfig("web-framework-react", { scope: "project" });
      const hono = buildSkillConfig("api-framework-hono", { scope: "global" });
      const config = buildProjectConfig({
        skills: [react, hono],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-tester"], { scope: "project" }),
        ],
        stack: {
          "web-tester": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
        },
      });

      const { stderr } = await runProbe((probe) => {
        probe.unassigned(config, [react, hono]);
      });

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Skill 'api-framework-hono' is assigned to no sub-agent — nothing will load it.",
      );
    });

    it("judges only the selection, never an excluded entry or one it did not select", async () => {
      const react = buildSkillConfig("web-framework-react", { scope: "project" });
      const hono = buildSkillConfig("api-framework-hono", { scope: "project", excluded: true });
      const vitest = buildSkillConfig("web-testing-vitest", { scope: "project" });
      const config = buildProjectConfig({
        skills: [react, hono, vitest],
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: {
          "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
        },
      });

      const { stderr } = await runProbe((probe) => {
        probe.unassigned(config, [react, hono]);
      });

      expect(stderr).toBe("");
    });

    it("blames the global sub-agents only for a skill whose active entry is project-scoped", async () => {
      const projectReact = buildSkillConfig("web-framework-react", { scope: "project" });
      const config = buildProjectConfig({
        skills: [
          projectReact,
          buildSkillConfig("api-framework-hono", { scope: "global" }),
          buildSkillConfig("web-testing-vitest", { scope: "project", excluded: true }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-tester"], { scope: "project" }),
        ],
      });

      const { stderr } = await runProbe((probe) => {
        probe.unassigned(config, [projectReact]);
      });

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Skill 'web-framework-react' is assigned to no sub-agent — nothing will load it. Warning: Sub-agents 'web-developer', 'api-developer' cannot carry project-scoped skill 'web-framework-react' — global-scoped sub-agents only carry global-scoped skills.",
      );
    });
  });

  describe("refusing a saved skill whose metadata no longer describes it", () => {
    const CYPRESS = "web-testing-cypress-e2e";

    async function writeEjectedCopy(metadata: string): Promise<string> {
      const skillDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, CYPRESS);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(CYPRESS));
      const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
      await writeFile(metadataPath, metadata);
      return metadataPath;
    }

    const saved = [buildSkillConfig(CYPRESS, { scope: "project", origin: "eject" })];

    it("names the copy the catalogue lacks, says why, and refuses", async () => {
      const metadataPath = await writeEjectedCopy("displayName: [unclosed\n");

      const { stdout, error } = await runProbe((probe) =>
        probe.savedSkillsReadable(saved, SINGLE_REACT_MATRIX, projectDir),
      );

      expect(stdout.startsWith(`  ${CYPRESS} — ${metadataPath}\n    `)).toBe(true);
      expect(error?.message).toContain(`'${CYPRESS}'`);
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("passes a copy whose metadata is usable", async () => {
      await writeEjectedCopy(
        renderMetadataYaml({
          displayName: "Cypress",
          category: "web-testing",
          slug: "cypress-e2e",
          domain: "web",
          contentHash: "e5f6a7b",
        }),
      );

      const { stdout, error } = await runProbe((probe) =>
        probe.savedSkillsReadable(saved, SINGLE_REACT_MATRIX, projectDir),
      );

      expect(error).toBeUndefined();
      expect(stdout).toBe("");
    });

    it("does not judge a saved skill the catalogue carries", async () => {
      const react = [
        buildSkillConfig("web-framework-react", { scope: "project", origin: "eject" }),
      ];
      const skillDir = path.join(
        projectDir,
        CLAUDE_DIR,
        STANDARD_DIRS.SKILLS,
        "web-framework-react",
      );
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        "displayName: [unclosed\n",
      );

      const { error } = await runProbe((probe) =>
        probe.savedSkillsReadable(react, SINGLE_REACT_MATRIX, projectDir),
      );

      expect(error).toBeUndefined();
    });
  });

  describe("refusing project-scoped content at the home directory", () => {
    const projectSkill = buildSkillConfig("web-framework-react", { scope: "project" });
    const globalSkill = buildSkillConfig("api-framework-hono", { scope: "global" });

    it("names each project-scoped skill and sub-agent it cannot write there", async () => {
      const selection = buildInstallSelection([projectSkill, globalSkill], {
        agentConfigs: [
          ...buildAgentConfigs(["web-developer"], { scope: "project" }),
          ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ],
      });

      const { error } = await runProbe((probe) => probe.projectScopedAtHome(selection, fakeHome));

      expect(error?.message).toBe(
        [
          "This configuration cannot be installed here: the home directory is the global scope, and a global installation holds only global-scoped content — so these project-scoped entries have nowhere to be written:",
          "  skill web-framework-react (scope: project)",
          "  sub-agent web-developer (scope: project)",
          "Run this from inside a project directory, or re-share it with each entry above at global scope.",
        ].join("\n"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("sends a global install it applies to to change itself through its own link instead", async () => {
      const selection = buildInstallSelection([projectSkill], {
        agentConfigs: buildAgentConfigs(["api-developer"], { scope: "global" }),
      });

      const { error } = await runProbe((probe) =>
        probe.projectScopedAtHome(selection, fakeHome, true),
      );

      expect(error?.message).toContain(
        "Run this from inside a project directory, or change the global install from here: run 'npx agents-inc edit', make the change in the editor, then apply the id it gives you with 'npx agents-inc edit --from <id>'.",
      );
      expect(error?.message).not.toContain("re-share");
    });

    it("refuses a project-scoped sub-agent alone", async () => {
      const selection = buildInstallSelection([globalSkill], {
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      const { error } = await runProbe((probe) => probe.projectScopedAtHome(selection, fakeHome));

      expect(error?.message).toContain("  sub-agent web-developer (scope: project)");
    });

    it("refuses a project-scoped skill alone", async () => {
      const selection = buildInstallSelection([projectSkill], {
        agentConfigs: buildAgentConfigs(["api-developer"], { scope: "global" }),
      });

      const { error } = await runProbe((probe) => probe.projectScopedAtHome(selection, fakeHome));

      expect(error?.message).toContain("  skill web-framework-react (scope: project)");
    });

    it("lets a selection of global-scoped content through", async () => {
      const selection = buildInstallSelection([globalSkill], {
        agentConfigs: buildAgentConfigs(["api-developer"], { scope: "global" }),
      });

      const { error } = await runProbe((probe) => probe.projectScopedAtHome(selection, fakeHome));

      expect(error).toBeUndefined();
    });

    it("lets project-scoped content through in a project", async () => {
      const selection = buildInstallSelection([projectSkill]);

      const { error } = await runProbe((probe) => probe.projectScopedAtHome(selection, projectDir));

      expect(error).toBeUndefined();
    });
  });

  describe("refusing a placement the host cannot fill, before anything is written", () => {
    it("refuses with the host's own finding", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(), ".agents-inc/codex");

      const { error } = await runProbe((probe) =>
        probe.placementsBeforeWriting(
          [buildSkillConfig("web-framework-react", { scope: "project", origin: "acme" })],
          projectDir,
        ),
      );

      expect(error?.message).toBe(
        "Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("lets a placement the host offers through", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(), ".agents-inc/codex");

      const { error } = await runProbe((probe) =>
        probe.placementsBeforeWriting(
          [buildSkillConfig("web-framework-react", { scope: "global", origin: "acme" })],
          projectDir,
        ),
      );

      expect(error).toBeUndefined();
    });
  });

  describe("refusing a shared configuration before asking to apply it", () => {
    const sourceResult = () =>
      buildSourceResult(CATEGORY_EXCLUSIVITY_MATRIX, path.join(projectDir, "marketplace"));

    it("refuses a placement the host cannot fill", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(), ".agents-inc/codex");
      const selection = buildInstallSelection([
        buildSkillConfig("web-framework-react", { scope: "project", origin: "acme" }),
      ]);

      const { error } = await runProbe((probe) =>
        probe.sharedConfigBeforeAsking(selection, projectDir, sourceResult()),
      );

      expect(error?.message).toBe(
        "Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
      );
    });

    it("refuses a stack the marketplace does not offer", async () => {
      const selection = buildInstallSelection([buildSkillConfig("web-framework-react")], {
        selectedStackId: "no-such-stack",
      });

      const { error } = await runProbe((probe) =>
        probe.sharedConfigBeforeAsking(selection, projectDir, sourceResult()),
      );

      expect(error?.message).toContain(
        `Stack 'no-such-stack' is not a stack the source '${path.join(projectDir, "marketplace")}' offers.`,
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("refuses a sub-agent's stack holding two skills of an exclusive category", async () => {
      const selection = buildInstallSelection([buildSkillConfig("web-framework-react")], {
        assignedStack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-vue-composition-api", preloaded: false },
            ],
          },
        },
      });

      const { error } = await runProbe((probe) =>
        probe.sharedConfigBeforeAsking(selection, projectDir, sourceResult()),
      );

      expect(error?.message).toMatch(/^Category 'web-framework' is exclusive but holds 2 skills: /);
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("lets a configuration through that names nothing it cannot write", async () => {
      const selection = buildInstallSelection([buildSkillConfig("web-framework-react")], {
        assignedStack: {
          "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: false }] },
        },
      });

      const { error } = await runProbe((probe) =>
        probe.sharedConfigBeforeAsking(selection, projectDir, sourceResult()),
      );

      expect(error).toBeUndefined();
    });
  });

  describe("requiring a marketplace for plugin installs", () => {
    function sourceResultNamed(marketplace: string | undefined): SourceLoadResult {
      return buildSourceResult(SINGLE_REACT_MATRIX, path.join(projectDir, "no-marketplace-here"), {
        ...(marketplace !== undefined && { marketplace }),
      });
    }

    it("answers the marketplace and says it registered one it had to register", async () => {
      const registered: string[] = [];
      const host = createMockPluginHost({ marketplaceExists: async () => false });
      let answered = "";

      await runProbe(async (probe) => {
        answered = await probe.marketplaceOrExit(sourceResultNamed("acme"), host, (name) => {
          registered.push(name);
        });
      });

      expect(answered).toBe("acme");
      expect(registered).toStrictEqual(["acme"]);
    });

    it("says nothing of registering a marketplace already there", async () => {
      const registered: string[] = [];
      let answered = "";

      await runProbe(async (probe) => {
        answered = await probe.marketplaceOrExit(
          sourceResultNamed("acme"),
          createMockPluginHost(),
          (name) => {
            registered.push(name);
          },
        );
      });

      expect(answered).toBe("acme");
      expect(registered).toStrictEqual([]);
    });

    it("refuses when no marketplace can be resolved", async () => {
      const { error } = await runProbe(async (probe) => {
        await probe.marketplaceOrExit(
          sourceResultNamed(undefined),
          createMockPluginHost(),
          () => undefined,
        );
      });

      expect(error?.message).toBe(
        `Cannot install plugin skills: marketplace could not be resolved from '${path.join(projectDir, "no-marketplace-here")}'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.`,
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  describe("reading the branding name", () => {
    afterEach(() => {
      setVerbose(false);
    });

    it("falls back to the product's name, and says why under --verbose, for a config it cannot read", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs());
      setVerbose(true);
      let name = "";

      const { stdout } = await runProbe(async (probe) => {
        name = await probe.brandingName(projectDir);
      });

      expect(name).toBe("Agents Inc.");
      expect(stdout).toContain("  Could not read branding from the config: ");
    });
  });

  describe("ending a run with work owed", () => {
    it("warns as it records, then lists every failure with its remedy and exits 5", async () => {
      const { stdout, stderr, error } = await runProbe((probe) => {
        probe.incomplete("Could not compile web-developer", "Run compile again");
        probe.recorded("Could not copy react", "Eject it again");
        probe.endOfRun();
      });

      expect(flattenCliOutput(stderr)).toBe("Warning: Could not compile web-developer");
      expect(stdout).toBe(
        [
          "",
          "Completed with 2 failure(s) — the changes above landed, these did not:",
          "  Could not compile web-developer",
          "    Run compile again",
          "  Could not copy react",
          "    Eject it again",
          "",
          "",
        ].join("\n"),
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
    });

    it("ends quietly and successfully with nothing owed", async () => {
      const { stdout, error } = await runProbe((probe) => {
        probe.endOfRun();
      });

      expect(stdout).toBe("");
      expect(error).toBeUndefined();
    });
  });
});
