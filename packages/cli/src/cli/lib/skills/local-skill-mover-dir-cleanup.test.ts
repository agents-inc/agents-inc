import path from "path";
import { writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger");

import { deleteLocalSkill } from "./local-skill-mover";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { writeTestSkill } from "../__tests__/helpers/disk-writers";
import { cleanupTempDir, createTempDir, directoryExists } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { CLAUDE_DIR } from "../../consts";

/**
 * Directory-collapse half of `deleteLocalSkill`, kept apart from
 * `local-skill-mover.test.ts` because that file mocks `utils/fs` wholesale —
 * whether a directory survives its last child is only observable against a real
 * filesystem, and asserting it through mocks would pin whichever fs helper the
 * implementation happens to call rather than the behaviour.
 */

const USER_OWNED_FILE = "notes.md";

describe("deleteLocalSkill directory collapse", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-skill-mover-collapse-");
    projectDir = path.join(tempDir, "project");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const skillsDir = (): string => resolveInstallPaths(projectDir, "project").skillsDir;

  it("removes the skills directory when the deleted skill was the last thing in it", async () => {
    const skillDir = await writeTestSkill(skillsDir(), SKILLS.react.id, { skipMetadata: true });
    expect(await directoryExists(skillDir), "the skill must exist before the delete").toBe(true);

    await deleteLocalSkill(projectDir, SKILLS.react.id);

    expect(await directoryExists(skillDir)).toBe(false);
    expect(
      await directoryExists(skillsDir()),
      "an emptied skills directory must not survive the removal",
    ).toBe(false);
    expect(
      await directoryExists(path.join(projectDir, CLAUDE_DIR)),
      ".claude itself is uninstall's decision — the edit path must leave it alone",
    ).toBe(true);
  });

  it("keeps the skills directory when another installed skill remains", async () => {
    await writeTestSkill(skillsDir(), SKILLS.react.id, { skipMetadata: true });
    const survivor = await writeTestSkill(skillsDir(), SKILLS.vitest.id, { skipMetadata: true });

    await deleteLocalSkill(projectDir, SKILLS.react.id);

    expect(await directoryExists(skillsDir())).toBe(true);
    expect(await directoryExists(survivor), "the sibling skill must be untouched").toBe(true);
  });

  it("keeps the skills directory when it still holds user-owned content", async () => {
    await writeTestSkill(skillsDir(), SKILLS.react.id, { skipMetadata: true });
    await writeFile(path.join(skillsDir(), USER_OWNED_FILE), "hand written\n");

    await deleteLocalSkill(projectDir, SKILLS.react.id);

    expect(
      await directoryExists(skillsDir()),
      "a directory that still holds anything must never be deleted",
    ).toBe(true);
  });

  it("leaves an absent skills directory absent", async () => {
    await deleteLocalSkill(projectDir, SKILLS.react.id);

    expect(await directoryExists(skillsDir())).toBe(false);
    expect(await directoryExists(projectDir)).toBe(false);
  });
});

/**
 * **The host decides which directory an ejected skill lives in — CLI-895, 2026-09-26.** On a Codex
 * project it is `<repo>/.agents/skills`, and `deleteLocalSkill` joined Claude's `.claude/skills`
 * whatever the host, so the copy Codex reads survived every delete. The paired Claude directory is
 * planted with the same skill as the control: the delete has to reach the Codex copy and ONLY it.
 */
describe("deleteLocalSkill on a Codex project", () => {
  /** The source folder a Codex installation is recognised by, as a user sees it. */
  const CODEX_SOURCE_REL = ".agents-inc/codex";

  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-skill-mover-codex-");
    projectDir = path.join(tempDir, "project");
    await writeTestTsConfig(projectDir, buildProjectConfig(), CODEX_SOURCE_REL);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("deletes the copy from the directory Codex reads, and leaves a Claude-path folder alone", async () => {
    const codexSkillsDir = resolveInstallPaths(projectDir, "project").skillsDir;
    expect(
      codexSkillsDir,
      "the project did not resolve onto Codex, so this case tests Claude again",
    ).not.toContain(CLAUDE_DIR);
    const codexCopy = await writeTestSkill(codexSkillsDir, SKILLS.react.id, { skipMetadata: true });
    const claudePathCopy = await writeTestSkill(
      path.join(projectDir, CLAUDE_DIR, "skills"),
      SKILLS.react.id,
      { skipMetadata: true },
    );

    await deleteLocalSkill(projectDir, SKILLS.react.id);

    expect(await directoryExists(codexCopy), "the copy Codex reads survived the delete").toBe(
      false,
    );
    expect(await directoryExists(claudePathCopy)).toBe(true);
  });
});
