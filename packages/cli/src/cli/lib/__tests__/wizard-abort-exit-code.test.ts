import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { callSiteOwners } from "./helpers/source-call-sites.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WIZARD_LAYER = "e2e/pages/wizards/**/*.ts";
const NOT_A_WIZARD_MODULE = ["e2e/pages/wizards/**/*.test.ts"];

/** How a wizard class reaches the PTY it owns — and therefore how it is told apart from a helper. */
const HOLDS_A_SESSION = "this.session.";

/** The verdict, and the member it has to sit in for every aborted session to be held to it. */
const CANCELLED_ASSERTION = "expectCancelledExit(";
const TEARDOWN_MEMBER = "abortAndDestroy";

/**
 * A Ctrl+C into a wizard must exit CANCELLED, and the assertion for it lives in the page object
 * rather than at the call sites — so this holds the page objects, which is the only place a
 * spec cannot opt out of.
 *
 * The recurrence it exists against is structural. `InitWizard` and `EditWizard` share no base
 * class: each was written by copying the other, and the exit-code assertion arrived in both by
 * that same copy. Thirty-five specs abort a wizard, five of them ever captured the exit code and
 * two pinned this value, so before the assertion moved into `abortAndDestroy` a wizard that
 * started exiting 0 on Ctrl+C would have been reported by nothing. Copying is not a mechanism —
 * a THIRD wizard written the same way inherits whatever its author remembered, and nothing in
 * the type system, the linter or the suite has an opinion about which half that is.
 *
 * **Membership is DERIVED, which is the half that stops the roster going stale.** A module in
 * this layer that touches `this.session.` owns a PTY it can end; one that does not is a helper.
 * `global-home.ts` is the live second kind — it allocates a directory and spawns nothing — so it
 * is absent below because the scan does not find it, not because anyone excluded it.
 *
 * What this cannot see is a wizard that reaches its session by some other spelling. That is the
 * standing limit of every text-level gate here and is stated in `helpers/source-call-sites.ts`;
 * the reply to it is that the two live wizards and the layer's own documented recipe
 * (`standards/e2e/page-objects.md` § Adding a New Wizard Type) all use this one.
 */
const SESSION_OWNING_WIZARDS = [
  "e2e/pages/wizards/edit-wizard.ts",
  "e2e/pages/wizards/init-wizard.ts",
] as const;

type WizardModule = { file: string; source: string };

async function wizardLayerModules(): Promise<WizardModule[]> {
  const files = (await fg(WIZARD_LAYER, { cwd: CLI_ROOT, ignore: NOT_A_WIZARD_MODULE })).sort();

  return Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(path.join(CLI_ROOT, file), "utf-8"),
    })),
  );
}

describe("every wizard page object that can end a session says what exit it expects", () => {
  it("finds the session-owning wizards by what they hold, not by a list", async () => {
    const modules = await wizardLayerModules();

    // Subject guard: a glob that stopped matching would satisfy the comparison below for free
    // on the day the roster empties too, and the two failures would be indistinguishable.
    expect(
      modules.length,
      "the wizard layer read shorter than its own roster — the scan has stopped reading",
    ).toBeGreaterThanOrEqual(SESSION_OWNING_WIZARDS.length);

    const sessionOwning = modules
      .filter((module) => module.source.includes(HOLDS_A_SESSION))
      .map((module) => module.file);

    expect(
      sessionOwning,
      "a third wizard page object owns a PTY session — add it below, and give its teardown the " +
        "exit-code verdict the two beside it carry",
    ).toStrictEqual([...SESSION_OWNING_WIZARDS]);
  });

  it(`asserts CANCELLED from ${TEARDOWN_MEMBER} on each of them`, async () => {
    const modules = await wizardLayerModules();

    const verdicts = modules.flatMap(({ file, source }) => {
      const { owners, unattributed } = callSiteOwners(source, CANCELLED_ASSERTION);
      return [
        ...owners.map((member) => ({ file, member })),
        ...Array(unattributed).fill({ file, member: "<outside any class member>" }),
      ];
    });

    expect(
      verdicts,
      `a wizard teardown that does not reach ${CANCELLED_ASSERTION} leaves every spec aborting ` +
        `through it checking nothing about how the process ended`,
    ).toStrictEqual(SESSION_OWNING_WIZARDS.map((file) => ({ file, member: TEARDOWN_MEMBER })));
  });
});
