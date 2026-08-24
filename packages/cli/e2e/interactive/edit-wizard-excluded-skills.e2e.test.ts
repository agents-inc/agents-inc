import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  writeProjectConfig,
  createLocalSkill,
  renderMetadataYaml,
} from "../helpers/test-utils.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

/**
 * Bug D-193 regression test: excluded skills must not appear as selected
 * in the edit wizard's build step.
 *
 * Skills with `excluded: true` in config should be filtered from
 * `currentSkillIds` so they are not pre-selected. They are still preserved
 * in the config and visible in the info panel / confirm step via
 * `SkillAgentSummary`.
 *
 * Code path under test:
 *   edit.tsx -> buildEditContext() -> currentSkillIds filtering
 *   lib/wizard/build-step-logic.ts -> buildCategoriesForDomain()
 */

describe("edit wizard — excluded skills", () => {
  let tempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "should not show excluded skills as selected in build step",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Setup: react (normal), vitest (excluded)
      await writeProjectConfig(projectDir, {
        name: "excluded-skills-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject", excluded: true },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      // Create local skill directory only for the non-excluded skill.
      // The excluded skill has no local directory — it was excluded by the user.
      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          cliDescription: "React framework",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      const buildOutput = wizard.build.getOutput();

      // Framework is an exclusive category with a selection counter.
      // react is NOT excluded → it should be pre-selected: (1 of 1).
      expect(buildOutput).toContain("(1 of 1)");

      // Both skills appear in the build step (all skills in the source are shown).
      expect(buildOutput).toContain(E2E_SKILL.react.display);

      // The Testing category should be visible (vitest is in the source).
      expect(buildOutput).toContain("Testing");

      // The excluded vitest skill must NOT be pre-selected.
      // Testing category counter should show (0 of 1), not (1 of 1).
      expect(buildOutput).toContain("(0 of 1)");

      // Navigate through wizard without changes: Build → Sources → Agents → Confirm
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // The skill the user kept is the one the config still carries actively; the
      // excluded one is a tombstone and is pinned as such directly below.
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // The excluded flag must survive the edit. Read structurally: a no-op edit
      // writes nothing at all, so asserting on the emitted text would be asserting
      // that a write happened rather than that the flag was preserved.
      expect(await readSkillEntries(projectDir, E2E_SKILL.vitest.id)).toStrictEqual([
        { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject", excluded: true },
      ]);

      // Hydrating the agent selection from the config's own agents[] makes this
      // passthrough a genuine no-op, so the edit returns early: nothing is written
      // and nothing is recompiled. Asserting the report is what proves the run
      // reached that decision rather than failing silently before it.
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
    },
  );

  it(
    "should preserve excluded skill in config after no-op edit",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Setup: react (normal), vitest (excluded)
      await writeProjectConfig(projectDir, {
        name: "excluded-preserve-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject", excluded: true },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          cliDescription: "React framework",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      // Navigate through wizard without changes: Build → Sources → Agents → Confirm
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // The skill the user kept is the one the config still carries actively; the
      // excluded one is a tombstone and is pinned as such directly below.
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // The excluded flag must survive the edit. Read structurally: a no-op edit
      // writes nothing at all, so asserting on the emitted text would be asserting
      // that a write happened rather than that the flag was preserved.
      expect(await readSkillEntries(projectDir, E2E_SKILL.vitest.id)).toStrictEqual([
        { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject", excluded: true },
      ]);

      // Hydrating the agent selection from the config's own agents[] makes this
      // passthrough a genuine no-op, so the edit returns early: nothing is written
      // and nothing is recompiled. Asserting the report is what proves the run
      // reached that decision rather than failing silently before it.
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
    },
  );

  it(
    "should show non-excluded skills correctly as selected alongside excluded skills",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Setup: react (normal), vitest (normal), zustand (excluded)
      await writeProjectConfig(projectDir, {
        name: "mixed-excluded-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject", excluded: true },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      // Create local skill directories for non-excluded skills only
      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          cliDescription: "React framework",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: "vitest",
          cliDescription: "Vitest testing",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      const buildOutput = wizard.build.getOutput();

      // Framework (exclusive): react is selected → (1 of 1)
      expect(buildOutput).toContain("(1 of 1)");

      // Both non-excluded skills should appear with their names
      expect(buildOutput).toContain(E2E_SKILL.react.display);

      // The Testing category is visible (vitest is in the source)
      expect(buildOutput).toContain("Testing");

      // Navigate through wizard to verify it completes successfully
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify config after save: both kept skills are active, and the excluded one is
      // a tombstone rather than an entry this installation has — pinned below.
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      });

      // The excluded flag must survive the edit — read structurally, as above.
      expect(await readSkillEntries(projectDir, E2E_SKILL.zustand.id)).toStrictEqual([
        { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject", excluded: true },
      ]);

      // Hydrating the agent selection from the config's own agents[] makes this
      // passthrough a genuine no-op, so the edit returns early: nothing is written
      // and nothing is recompiled. Asserting the report is what proves the run
      // reached that decision rather than failing silently before it.
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
    },
  );

  it(
    "should show skill as selected when it has both excluded tombstone and active project entry",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Setup: zustand has a dual entry — global excluded tombstone + active project entry.
      // This happens when a skill is toggled from global to project scope (G→P).
      await writeProjectConfig(projectDir, {
        name: "dual-entry-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.zustand.id, scope: "global", origin: "eject", excluded: true },
          { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject" },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      // Create local skill directories for both non-excluded skills
      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          cliDescription: "React framework",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      await createLocalSkill(projectDir, E2E_SKILL.zustand.id, {
        description: "State management",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.zustand.display,
          category: "web-client-state",
          slug: "zustand",
          cliDescription: "State management",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      const buildOutput = wizard.build.getOutput();

      // Framework (exclusive): react is selected → (1 of 1)
      expect(buildOutput).toContain("(1 of 1)");

      // The active project entry for zustand must not be filtered out
      // by the excluded tombstone. zustand should be visible and selectable.
      expect(buildOutput).toContain(E2E_SKILL.zustand.display);

      // Navigate through wizard without changes: Build → Sources → Agents → Confirm
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both skills must be present in config
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.zustand.id],
      });

      // Both scope entries must survive: the global tombstone and the active
      // project entry. Read structurally — a no-op edit writes nothing, and a
      // raw-text check would also pass on any two unrelated rows carrying those
      // scopes rather than on this skill's own pair.
      expect(await readSkillEntries(projectDir, E2E_SKILL.zustand.id)).toStrictEqual([
        { id: E2E_SKILL.zustand.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject" },
      ]);

      // The zustand local skill directory must still exist after save
      await expect({ dir: projectDir }).toHaveLocalSkills([E2E_SKILL.zustand.id]);

      // Hydrating the agent selection from the config's own agents[] makes this
      // passthrough a genuine no-op, so the edit returns early: nothing is written
      // and nothing is recompiled. Asserting the report is what proves the run
      // reached that decision rather than failing silently before it.
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
    },
  );

  it(
    "should preserve both tombstone and active entry after no-op edit with dual entries",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Same dual-entry setup: global excluded tombstone + active project entry
      await writeProjectConfig(projectDir, {
        name: "dual-entry-preserve-test",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.zustand.id, scope: "global", origin: "eject", excluded: true },
          { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject" },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
      });

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: "react",
          cliDescription: "React framework",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      await createLocalSkill(projectDir, E2E_SKILL.zustand.id, {
        description: "State management",
        metadata: renderMetadataYaml({
          domain: "web",
          displayName: E2E_SKILL.zustand.display,
          category: "web-client-state",
          slug: "zustand",
          cliDescription: "State management",
          usageGuidance: "Testing",
          contentHash: "e2e-hash",
        }),
      });

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      // Navigate through wizard without changes: Build → Sources → Agents → Confirm
      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both skills must be present in config
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.zustand.id],
      });

      // Both scope entries must survive: the global tombstone and the active
      // project entry. Read structurally — a no-op edit writes nothing, and a
      // raw-text check would also pass on any two unrelated rows carrying those
      // scopes rather than on this skill's own pair.
      expect(await readSkillEntries(projectDir, E2E_SKILL.zustand.id)).toStrictEqual([
        { id: E2E_SKILL.zustand.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.zustand.id, scope: "project", origin: "eject" },
      ]);

      // Hydrating the agent selection from the config's own agents[] makes this
      // passthrough a genuine no-op, so the edit returns early: nothing is written
      // and nothing is recompiled. Asserting the report is what proves the run
      // reached that decision rather than failing silently before it.
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_UNCHANGED);
    },
  );
});
