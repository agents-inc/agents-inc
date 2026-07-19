import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";

/**
 * D-217 — Compiled agents must reference each skill in the format dictated
 * by THAT skill's source: plugin-source skills as `skillId:skillId` (the
 * `PluginSkillRef` form), eject-source skills as bare `skillId`. Mixed-mode
 * agents (some plugin + some eject in the same agent) must emit BOTH
 * formats in the same `.claude/agents/<name>.md`.
 *
 * Pre-D-217 the install path applied `installMode` at the whole-agent level
 * via `compileAgentForPlugin`'s 5th arg, so a mixed-mode agent got either
 * all-plugin form OR all-bare form — never both. This breaks Claude Code's
 * plugin resolver when the agent reaches into a plugin-installed skill but
 * the frontmatter says bare id.
 *
 * Companion finding: `.ai-docs/agent-findings/2026-04-16-silent-plugin-install-skip-on-missing-marketplace.md`
 * documents the canonical `s.source !== "eject"` predicate.
 *
 * This suite is skipped without the Claude CLI because per-skill install
 * routing requires `claude plugin install` for the plugin-side skill.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "mixed-mode agents emit per-skill ref formats in compiled output",
  () => {
    let pluginSource: E2EPluginSource | undefined;

    beforeAll(async () => {
      await ensureBinaryExists();
      pluginSource = await createE2EPluginSource();
    }, TIMEOUTS.SETUP * 2);

    afterAll(async () => {
      if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
    });

    describe("init plugin then edit toggle ONE skill to local: mixed compiled output", () => {
      let initWizard: InitWizard | undefined;
      let prompt: InteractivePrompt | undefined;
      let tempDir: string | undefined;

      afterEach(async () => {
        await initWizard?.destroy();
        initWizard = undefined;
        await prompt?.destroy();
        prompt = undefined;
        if (tempDir) {
          await cleanupTempDir(tempDir);
          tempDir = undefined;
        }
      });

      it(
        "web-developer.md frontmatter and body each carry the format dictated by the skill's own source",
        { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
        async () => {
          // Phase 1: init with the plugin source using defaults — every
          // skill ends at `source: "<marketplaceName>"` (plugin). This is
          // the same path covered by `init-wizard-stack.e2e.test.ts:71-93`,
          // which confirms react renders as `web-framework-react:web-framework-react`
          // in pure plugin mode.
          tempDir = await createTempDir();
          const projectDir = path.join(tempDir, "project");

          initWizard = await InitWizard.launch({
            source: { sourceDir: pluginSource!.sourceDir, tempDir: pluginSource!.tempDir },
            projectDir,
          });
          const initResult = await initWizard.completeWithDefaults();
          expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);

          // Sanity check: post-init, react frontmatter uses pluginRef form
          // (matches the existing init-wizard-stack.e2e.test.ts assertion).
          await expect(initResult.project).toHaveAgentFrontmatter("web-developer", {
            skills: ["web-framework-react:web-framework-react"],
          });
          await initResult.destroy();

          // Phase 2: edit + flip the FIRST source-row's source from the
          // plugin marketplace (col 1) back to eject (col 0) via arrow-left
          // + Space. The first row in the customize grid for this stack is
          // web-framework-react. After the toggle: react = eject, rest stay
          // plugin.
          //
          // We use InteractivePrompt because per-skill source navigation
          // (arrow-left/right + Space inside the SourceGrid) is exposed
          // there but not on the SourcesStep page object — the existing
          // mixed-source lifecycle test (source-switching-per-skill) sets
          // the precedent.
          await createPermissionsFile(projectDir);
          prompt = new InteractivePrompt(
            ["edit", "--source", pluginSource!.sourceDir],
            projectDir,
            {
              env: { AGENTSINC_SOURCE: undefined },
              rows: 60,
              cols: 120,
            },
          );

          await prompt.waitForRawText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_LOAD);
          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.DOMAIN_API, TIMEOUTS.WIZARD_LOAD);
          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.DOMAIN_META, TIMEOUTS.WIZARD_LOAD);
          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.SOURCES, TIMEOUTS.WIZARD_LOAD);

          // After plugin-mode init, react's selected column is the marketplace
          // plugin (col 1). Default grid focus is (row 0, col 0). Press
          // Space at col 0 selects "Local" (eject) for react. The other
          // skills' rows are not touched, so they retain plugin source.
          await prompt.space();

          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.AGENTS, TIMEOUTS.WIZARD_LOAD);
          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.CONFIRM, TIMEOUTS.WIZARD_LOAD);
          await prompt.pressEnter();
          await prompt.waitForRawText(STEP_TEXT.EDIT_SUCCESS, TIMEOUTS.PLUGIN_INSTALL);
          const editExitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
          expect(editExitCode).toBe(EXIT_CODES.SUCCESS);

          // Phase 3: assert config.ts records the per-skill split.
          // web-framework-react → "eject" after the toggle.
          // The other web-developer skills (vitest, zustand, meta skills) →
          // marketplaceName (still plugin).
          const configPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
          expect(await fileExists(configPath)).toBe(true);
          const configContent = await readTestFile(configPath);

          // Both skills present as separate SkillConfig entries. Compact JSON
          // shape (no inner spaces) is stable across the config-generator.
          expect(configContent).toContain('"id":"web-framework-react"');
          expect(configContent).toContain('"id":"web-state-zustand"');

          // react flipped to eject; the regex tolerates either scope so the
          // test does not depend on whether the install routes to project
          // or global agent dirs (matches the existing init-wizard-stack
          // test which asserts on result.project regardless of scope).
          expect(configContent).toMatch(
            /"id":"web-framework-react","scope":"(?:project|global)","source":"eject"/,
          );

          // zustand stays plugin — verifies the toggle was scoped to react.
          // The source is "agents-inc" (the skill author from metadata.yaml,
          // NOT the dynamic marketplaceName). This is set by the multi-source
          // loader from each skill's metadata.yaml `author` field.
          expect(configContent).toMatch(
            /"id":"web-state-zustand","scope":"(?:project|global)","source":"agents-inc"/,
          );

          // Phase 4: assert the compiled web-developer.md honors per-skill
          // source for frontmatter emission — the D-217 contract.
          //
          // The fixture mirrors the real CLI stack shape: only the framework
          // skill is preloaded on `web-developer`. Pre-D-217 the install
          // path applied installMode at the whole-agent level; the single
          // preloaded skill would render as `id:id` even after its source
          // was toggled to eject, because a single plugin skill elsewhere
          // in the agent (or the whole-agent installMode decision) would
          // force plugin form. Post-fix, each preloaded skill's frontmatter
          // emission is governed strictly by its own source.
          await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

          // Post-toggle: the toggled skill (react) appears in BARE form in
          // the frontmatter because its source is now "eject". The fixture
          // mirrors the real CLI stack shape where only the framework skill
          // is preloaded on `web-developer` — meta skills are dynamic (not
          // preloaded), so they never appear in agent frontmatter, only in
          // the body's Skill Activation Protocol table. Each preloaded
          // skill's emission is governed by its own source.
          await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
            skills: ["web-framework-react"],
          });

          // The compiled agent body must NOT contain react in pluginRef
          // form — this is the D-217 negative invariant. Pre-D-217 with the
          // whole-agent installMode gate, ANY skill in a plugin-mode agent
          // would have rendered as `id:id` everywhere it appeared. Post-fix,
          // each skill's emission is governed by its own source.
          await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
            notContains: ["web-framework-react:web-framework-react"],
          });

          // Cross-check: the post-init agent (before the toggle) DID contain
          // react in pluginRef form (asserted in Phase 1's sanity check
          // above). The same agent file post-toggle does NOT — proves the
          // edit-path recompile re-emitted with the new per-skill source
          // rather than caching the prior format.

          // Phase 5: filesystem routing — the toggled skill (react) lands
          // at .claude/skills/. The eject-side artifact existing is the
          // crucial side-effect that proves the per-skill source took
          // effect at the install path level (not just in compiled output).
          //
          // KNOWN GAP: we do NOT assert on settings.json plugin enablement
          // for the un-toggled skills here. Plugin install/uninstall during
          // edit-mode source migration is governed by mode-migrator.ts and
          // depends on which skills the migrator considers "newly plugin"
          // vs "already plugin". The settings.json shape is verified by
          // dedicated tests (e.g. init-dashboard-edit-plugin-install.e2e).
          // D-217 is strictly about the COMPILED-AGENT format-per-skill
          // contract; the install-side routing is covered separately.
          await expect({ dir: projectDir }).toHaveSkillCopied("web-framework-react");
        },
      );
    });
  },
);
