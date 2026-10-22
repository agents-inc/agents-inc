import path from "path";
import { mkdir, realpath, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { judgeOwnership } from "./ownership.js";
import { hostsOf, type CheckedInstallation, type ConfigState } from "./installation-reads.js";
import { agentsDir, skillsDir } from "../installation/install-layout.js";
import { stampProvenanceMarker } from "../agents/agent-provenance.js";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { renderAgentMd, renderMetadataYaml } from "../__tests__/content-generators.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { STANDARD_FILES } from "../../consts.js";
import type { ProjectConfig } from "../../types/index.js";

/** The `forkedFrom` block the copier stamps: what makes a skill folder this CLI's own. */
const CLI_PROVENANCE = {
  skillId: "web-framework-react",
  contentHash: "abc1234",
  date: "2026-01-01",
};

const NOTHING_UNOWNED = { skills: [], agents: [] };

async function writeSkillThisCliCopied(dir: string, name: string): Promise<void> {
  await mkdir(path.join(dir, name), { recursive: true });
  await writeFile(
    path.join(dir, name, STANDARD_FILES.METADATA_YAML),
    renderMetadataYaml({
      category: "web-framework",
      contentHash: CLI_PROVENANCE.contentHash,
      forkedFrom: CLI_PROVENANCE,
    }),
  );
}

/** Installed by something else: no `metadata.yaml`, so no provenance. */
async function writeUsersOwnSkill(dir: string, name: string): Promise<void> {
  await mkdir(path.join(dir, name), { recursive: true });
}

async function writeAgentThisCliCompiled(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.md`), stampProvenanceMarker(renderAgentMd(name)));
}

async function writeHandWrittenAgent(dir: string, fileName: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), renderAgentMd(path.parse(fileName).name));
}

function ownConfig(config: ProjectConfig): ConfigState {
  return { kind: "loaded", config, inherited: false };
}

function inheritedConfig(config: ProjectConfig): ConfigState {
  return { kind: "loaded", config, inherited: true };
}

describe("judgeOwnership", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-doctor-ownership-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    projectDir = await realpath(projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  function onClaude(dir: string): CheckedInstallation {
    return { projectDir: dir, hosts: hostsOf("claude") };
  }

  it("names the agent files a project's own config does not claim, and judges none of its skill folders", async () => {
    const config = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"]),
      agents: buildAgentConfigs(["web-developer"]),
    });
    const skills = skillsDir("claude", "project", projectDir);
    const agents = agentsDir("claude", "project", projectDir);
    await writeSkillThisCliCopied(skills, "web-framework-react");
    await writeSkillThisCliCopied(skills, "web-state-zustand");
    await writeAgentThisCliCompiled(agents, "web-developer");
    await writeHandWrittenAgent(agents, "pm.md");

    expect(await judgeOwnership(ownConfig(config), config, onClaude(projectDir))).toStrictEqual({
      unowned: NOTHING_UNOWNED,
      orphanedAgentFiles: ["pm.md"],
    });
  });

  it("leaves the skill folders `eject skills` copies in alone, in the project and at home, beside a config listing none", async () => {
    const config = buildProjectConfig({ skills: [], agents: buildAgentConfigs(["web-developer"]) });
    await writeSkillThisCliCopied(skillsDir("claude", "project", projectDir), "web-state-zustand");
    await writeSkillThisCliCopied(skillsDir("claude", "global", projectDir), "web-framework-react");
    await writeAgentThisCliCompiled(agentsDir("claude", "project", projectDir), "web-developer");

    expect(await judgeOwnership(ownConfig(config), config, onClaude(projectDir))).toStrictEqual({
      unowned: NOTHING_UNOWNED,
      orphanedAgentFiles: [],
    });
  });

  it("names, by path, only what this CLI provably wrote where no configuration is in play", async () => {
    const skills = skillsDir("claude", "project", projectDir);
    const agents = agentsDir("claude", "project", projectDir);
    await writeSkillThisCliCopied(skills, "web-state-zustand");
    await writeUsersOwnSkill(skills, "context7-mcp");
    await writeAgentThisCliCompiled(agents, "pm");
    await writeHandWrittenAgent(agents, "reviewer.md");

    expect(await judgeOwnership({ kind: "absent" }, null, onClaude(projectDir))).toStrictEqual({
      unowned: {
        skills: [path.join(skills, "web-state-zustand")],
        agents: [path.join(agents, "pm.md")],
      },
      orphanedAgentFiles: [],
    });
  });

  it("judges a project inheriting the global config's agent files by provenance in its own folder and by claims in the global one, and none of its skill folders", async () => {
    const config = buildProjectConfig({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
    });
    const projectAgents = agentsDir("claude", "project", projectDir);
    const globalAgents = agentsDir("claude", "global", projectDir);
    await writeAgentThisCliCompiled(projectAgents, "pm");
    await writeAgentThisCliCompiled(globalAgents, "web-developer");
    await writeHandWrittenAgent(globalAgents, "reviewer.md");
    await writeSkillThisCliCopied(skillsDir("claude", "project", projectDir), "web-state-zustand");
    await writeSkillThisCliCopied(skillsDir("claude", "global", projectDir), "web-framework-react");

    expect(
      await judgeOwnership(inheritedConfig(config), config, onClaude(projectDir)),
    ).toStrictEqual({
      unowned: { skills: [], agents: [path.join(projectAgents, "pm.md")] },
      orphanedAgentFiles: ["reviewer.md"],
    });
  });

  it("counts an excluded project entry as claiming nothing, and an excluded global one as still serving other projects", async () => {
    const config = buildProjectConfig({
      skills: [],
      agents: [
        ...buildAgentConfigs(["web-developer"], { excluded: true }),
        ...buildAgentConfigs(["pm"], { scope: "global", excluded: true }),
      ],
    });
    await writeAgentThisCliCompiled(agentsDir("claude", "project", projectDir), "web-developer");
    await writeAgentThisCliCompiled(agentsDir("claude", "global", projectDir), "pm");

    expect(await judgeOwnership(ownConfig(config), config, onClaude(projectDir))).toStrictEqual({
      unowned: NOTHING_UNOWNED,
      orphanedAgentFiles: ["web-developer.md"],
    });
  });

  it("leaves another provider's global folders out of a project judged beside its own config", async () => {
    const config = buildProjectConfig({ skills: [], agents: buildAgentConfigs(["web-developer"]) });
    const codexAgents = agentsDir("codex", "project", projectDir);
    await writeHandWrittenAgent(codexAgents, "web-developer.toml");
    await writeHandWrittenAgent(codexAgents, "pm.toml");
    await writeAgentThisCliCompiled(agentsDir("claude", "global", projectDir), "reviewer");

    const installation: CheckedInstallation = {
      projectDir,
      hosts: { project: "codex", global: "claude" },
    };

    expect(await judgeOwnership(ownConfig(config), config, installation)).toStrictEqual({
      unowned: NOTHING_UNOWNED,
      orphanedAgentFiles: ["pm.toml"],
    });
  });

  it("judges the one agents folder both scopes share at home once, against both scopes' claims", async () => {
    const config = buildProjectConfig({
      skills: [],
      agents: [
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["pm"], { scope: "global" }),
      ],
    });
    const shared = agentsDir("claude", "global", home.dir);
    await writeAgentThisCliCompiled(shared, "web-developer");
    await writeAgentThisCliCompiled(shared, "pm");
    await writeHandWrittenAgent(shared, "reviewer.md");

    expect(await judgeOwnership(ownConfig(config), config, onClaude(home.dir))).toStrictEqual({
      unowned: NOTHING_UNOWNED,
      orphanedAgentFiles: ["reviewer.md"],
    });
  });

  it("names what this CLI wrote into the folders both scopes share at home once, under ~", async () => {
    await writeAgentThisCliCompiled(agentsDir("claude", "global", home.dir), "pm");
    await writeSkillThisCliCopied(skillsDir("claude", "global", home.dir), "web-state-zustand");

    expect(await judgeOwnership({ kind: "absent" }, null, onClaude(home.dir))).toStrictEqual({
      unowned: {
        skills: [path.join("~", ".claude", "skills", "web-state-zustand")],
        agents: [path.join("~", ".claude", "agents", "pm.md")],
      },
      orphanedAgentFiles: [],
    });
  });
});
