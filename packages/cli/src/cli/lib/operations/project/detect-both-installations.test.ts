import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectBothInstallations } from "./detect-both-installations.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";

/** A sub-agent makes a config an installation rather than an empty shell. */
const AN_INSTALLATION = buildProjectConfig({ agents: buildAgentConfigs(["web-developer"]) });

describe("detectBothInstallations", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-both-installations-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const hasBoth = async () => (await detectBothInstallations(projectDir)).hasBoth;

  it("answers no while neither scope holds an installation", async () => {
    expect(await hasBoth()).toBe(false);
  });

  it("answers no for a global installation alone", async () => {
    await writeTestTsConfig(home.dir, AN_INSTALLATION);

    expect(await hasBoth()).toBe(false);
  });

  it("answers no for a project installation alone", async () => {
    await writeTestTsConfig(projectDir, AN_INSTALLATION);

    expect(await hasBoth()).toBe(false);
  });

  it("answers yes once both scopes hold one", async () => {
    await writeTestTsConfig(home.dir, AN_INSTALLATION);
    await writeTestTsConfig(projectDir, AN_INSTALLATION);

    expect(await hasBoth()).toBe(true);
  });
});
