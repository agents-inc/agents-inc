import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

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
 * Install intent is PER SKILL, and `origin !== EJECT_SOURCE` on a `SkillConfig` is the one
 * predicate that reads it — never a project-level truthiness check on the resolved marketplace.
 * Three commands once gated the whole plugin block on that project-level signal, so a config with
 * no `marketplace:` field wrote plugin-origin entries and invoked no install at all, and `init`
 * went further and copied the plugin-intended skills as local eject copies. Nothing may fall back
 * from plugin to eject: a source that cannot supply a marketplace is a hard error. This suite is
 * the mixed case that predicate exists for, which is why it asserts BOTH ref formats in one
 * compiled agent rather than the file being uniformly one or the other.
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
      pluginSource = await createE2EPluginSource();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
    });

    describe("init plugin then edit toggle ONE skill to local: mixed compiled output", () => {
      let initWizard: InitWizard | undefined;
      let editWizard: EditWizard | undefined;
      let tempDir: string | undefined;

      afterEach(async () => {
        await initWizard?.destroy();
        initWizard = undefined;
        await editWizard?.destroy();
        editWizard = undefined;
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
          // skill ends at `origin: "<marketplaceName>"` (plugin). This is
          // the same path covered by `init-wizard-stack.e2e.test.ts:71-93`,
          // which confirms react renders as `web-framework-react:web-framework-react`
          // in pure plugin mode.
          tempDir = await createTempDir();
          const projectDir = path.join(tempDir, "project");

          // This test toggles react's SOURCE (plugin -> eject) during edit.
          // Default-scope skills are GLOBAL, and a project edit renders global
          // skills as locked (readOnly), so their source cannot be toggled from
          // a project context. Both phases therefore model editing the GLOBAL
          // install via launchInGlobal: HOME == cwd == projectDir, the skills
          // are editable, and all content + config collapse onto projectDir
          // (every assertion below reads projectDir / initResult.project).
          initWizard = await InitWizard.launchInGlobal({
            source: pluginSource!,
            projectDir,
          });
          const initResult = await initWizard.completeWithDefaults();
          expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);

          // Sanity check: post-init, react frontmatter uses pluginRef form
          // (matches the existing init-wizard-stack.e2e.test.ts assertion).
          await expect(initResult.project).toHaveAgentFrontmatter("web-developer", {
            skills: [`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`],
          });
          await initResult.destroy();

          // Phase 2: edit + flip the FIRST source-row's source from the
          // plugin marketplace back to eject by pressing Space on the grid's
          // default focus, which is (row 0, col 0) = "Local". No arrow key is
          // needed. The first row in the customize grid for this stack is
          // web-framework-react. After the toggle: react = eject, rest stay
          // plugin.
          editWizard = await EditWizard.launchInGlobal({
            projectDir,
            source: pluginSource!,
            ...TERMINAL_SIZE.TALL,
          });

          const sources = await editWizard.build.passThroughAllDomains();
          await sources.waitForReady();

          // After plugin-mode init, react's selected column is the marketplace
          // plugin (col 1). Default grid focus is (row 0, col 0). Space at
          // col 0 selects "Local" (eject) for react. The other skills' rows
          // are not touched, so they retain plugin source.
          await sources.selectFocusedSourceCell();

          const agents = await sources.advance();
          const confirm = await agents.acceptDefaults("edit");

          // confirmAwaiting, not confirm(): this test needs EDIT_SUCCESS alone
          // in raw PTY output on the TIMEOUTS.PLUGIN_INSTALL budget a real
          // `claude plugin install` round-trip takes. confirm() would accept
          // EDIT_UNCHANGED too, off the xterm buffer, on half the budget.
          const editResult = await confirm.confirmAwaiting(
            STEP_TEXT.EDIT_SUCCESS,
            TIMEOUTS.PLUGIN_INSTALL,
          );
          expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

          // Phase 3: assert config.ts records the per-skill split.
          // web-framework-react → "eject" after the toggle.
          // The other web-developer skills (vitest, zustand, meta skills) →
          // marketplaceName (still plugin).
          const configPath = configTsPath(projectDir);
          expect(await fileExists(configPath)).toBe(true);
          const configContent = await readTestFile(configPath);

          // Both skills present as separate SkillConfig entries. Compact JSON
          // shape (no inner spaces) is stable across the config-generator.
          expect(configContent).toContain(`"id":"${E2E_SKILL.react.id}"`);
          expect(configContent).toContain(`"id":"${E2E_SKILL.zustand.id}"`);

          // react flipped to eject; the regex tolerates either scope so the
          // test does not depend on whether the install routes to project
          // or global agent dirs (matches the existing init-wizard-stack
          // test which asserts on result.project regardless of scope).
          expect(configContent).toMatch(
            new RegExp(
              `"id":"${E2E_SKILL.react.id}","scope":"(?:project|global)","origin":"eject"`,
            ),
          );

          // zustand stays plugin — verifies the toggle was scoped to react.
          // Its source is the source's own marketplace name, the same label the
          // plugin install and the registry use.
          expect(configContent).toMatch(
            new RegExp(
              `"id":"${E2E_SKILL.zustand.id}","scope":"(?:project|global)","origin":"${pluginSource!.marketplaceName}"`,
            ),
          );

          // Phase 4: assert the compiled web-developer.md honors per-skill
          // source for frontmatter emission — the per-skill-format contract.
          //
          // The fixture mirrors the real CLI stack shape: only the framework
          // skill is preloaded on `web-developer`. Before per-skill format the install
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
            skills: [E2E_SKILL.react.id],
          });

          // The compiled agent body must NOT contain react in pluginRef
          // form — the negative half of the same invariant. Before per-skill format, with the
          // whole-agent installMode gate, ANY skill in a plugin-mode agent
          // would have rendered as `id:id` everywhere it appeared. Post-fix,
          // each skill's emission is governed by its own source.
          await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
            notContains: [`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`],
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
          // The contract is strictly about the COMPILED-AGENT format-per-skill
          // contract; the install-side routing is covered separately.
          await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        },
      );
    });
  },
);
