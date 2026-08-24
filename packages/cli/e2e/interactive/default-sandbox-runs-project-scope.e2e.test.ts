import { afterEach, describe, expect, it } from "vitest";

import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E test proving the DEFAULT sandbox genuinely runs a project `edit` at
 * project scope.
 *
 * The default sandbox sets HOME to the project directory
 * (terminal-session.ts `HOME: cwd`). At runtime `edit` computes
 * `isEditingFromGlobalScope: isHomeDirectory(cwd)`, and `isHomeDirectory`
 * compares `realpathSync(cwd)` against `realpathSync(os.homedir())`. With
 * HOME === projectDir === cwd the two collapse onto the same directory, so the
 * wizard believes it is editing the GLOBAL installation and hides the Scope
 * (s) hotkey from the build-step footer.
 *
 * A project `edit` launched through the default sandbox (no explicit env.HOME)
 * MUST instead run at genuine project scope, so the build-step footer SHOWS the
 * Scope (s) hotkey. This test asserts that intended behavior. It fails on
 * `main` (default HOME collapses onto projectDir) and passes once the default
 * sandbox HOME is a directory separate from projectDir.
 */
describe("default sandbox — project-scope edit", () => {
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it("shows the Scope hotkey in the build-step footer under the default sandbox HOME", async () => {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
      domains: ["web"],
    });

    // Deliberately omit env.HOME so the wizard inherits the default sandbox
    // HOME (= projectDir). This exercises the buggy default; a distinct HOME
    // would mask it.
    wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

    const buildOutput = wizard.build.getOutput();

    // Proof the wizard reached the fully-painted build step (so a failure below
    // is the hidden hotkey, not a setup/timeout): the build-only Labels footer
    // hint and the first category (Framework) are both present.
    expect(buildOutput).toContain(STEP_TEXT.BUILD_FOOTER);
    expect(buildOutput).toContain(STEP_TEXT.BUILD);

    // A genuine project-scope edit shows the Scope (s) hotkey in the footer.
    // Under the default sandbox HOME=projectDir the edit runs in global-edit
    // mode (isEditingFromGlobalScope=true) and hides it.
    expect(buildOutput).toContain(STEP_TEXT.SCOPE);
  });
});
