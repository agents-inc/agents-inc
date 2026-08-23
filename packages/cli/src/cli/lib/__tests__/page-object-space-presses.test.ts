import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { callSiteOwners } from "./helpers/source-call-sites.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PAGE_OBJECTS = "e2e/pages/**/*.ts";
const NOT_A_PAGE_OBJECT = ["e2e/pages/**/*.test.ts"];

/** How the page object reaches Space, and how a bypass would read. */
const PRESS_SPACE = "this.pressSpace(";
const WRITE_SPACE = "this.session.space(";

/**
 * Every place in the page-object layer that presses Space, and what each one
 * does about the press afterwards.
 *
 * Space is the only key in this framework whose retry is unsafe by default.
 * Enter and Tab are monotonic — "did the next step paint", "did focus move" —
 * so `retryEnterUntil` and `BuildStep.advanceCategoryFocus` confirm that
 * something happened and re-press when it did not. Space TOGGLES, so the same
 * loop written the same way converts a dropped keystroke into a double
 * keystroke, and a skill toggled twice reads exactly like a skill never
 * toggled. Every other assertion in the suite reads where the selection ENDED,
 * so nothing but this roster can see the difference.
 *
 * The recurrence this exists against is a NEW step-page-object method that
 * presses Space and says nothing about how it knows the press landed. Such a
 * method fails here until it is either given a confirmation or written into
 * this table with the reason it cannot have one — which is a decision, made
 * once, in a place a reader can find, rather than a review someone has to
 * remember to do.
 *
 * `posture` is the claim; each entry's comment is the evidence for it.
 */
const SPACE_PRESS_SITES = [
  {
    file: "e2e/pages/steps/agents-step.ts",
    member: "toggleAgent",
    // Confirmed: `toggleListRowUntilRendered` holds the press to the FOCUSED
    // row's own rendered text, read once before the first press and compared
    // after each. The agents list renders a `[✓]` / `[ ]` checkbox per row, so
    // this surface has the text-observable selected state the build grid's
    // cells do not — which is the whole reason it could be closed and
    // `toggleFocusedSkill` cannot.
    posture: "confirmed-on-row-text",
  },
  {
    file: "e2e/pages/steps/agents-step.ts",
    member: "toggleFocusedAgentAwaiting",
    // Confirmed: waits for the caller's sentinel in RAW output after a
    // pre-press cursor, so the press is proved to have been processed.
    posture: "confirmed-on-raw-output",
  },
  {
    file: "e2e/pages/steps/build-step.ts",
    member: "toggleFocusedSkill",
    // OPEN-LOOP AND UNCLOSEABLE, for two independent reasons, both written out
    // at the method: under NO_COLOR the focused CELL has no text signal, so the
    // method cannot name its own subject; and callers press Space here to
    // assert a global-locked row is INERT, so "nothing moved" is a correct
    // outcome as often as it is a swallowed keystroke. `selectSkill` is the
    // confirmed path, and it is the one that knows which skill it means.
    posture: "open-loop",
  },
  {
    file: "e2e/pages/steps/build-step.ts",
    member: "toggleFocusedSkillAwaiting",
    // Confirmed: raw output after a pre-press cursor, as the agents twin.
    posture: "confirmed-on-raw-output",
  },
  {
    file: "e2e/pages/steps/domain-step.ts",
    member: "toggleDomain",
    // Confirmed on the same loop and the same signal as `toggleAgent` — the
    // domain rows carry the `[✓]` markers `deselectAll` in this very file
    // already reads before it decides to press.
    posture: "confirmed-on-row-text",
  },
  {
    file: "e2e/pages/steps/domain-step.ts",
    member: "deselectAll",
    // Reads the focused row's `✓` before each press and presses only where one
    // is there, so a swallowed press leaves a domain selected rather than
    // toggling one the caller did not ask for. Not a confirmation — it never
    // re-reads after pressing — but it is the safe half of one.
    posture: "reads-before-pressing",
  },
  {
    file: "e2e/pages/steps/sources-step.ts",
    member: "selectFocusedSourceCell",
    // UNCONFIRMED. The Sources grid's install-mode control is two-state rather
    // than a toggle, so a re-press is idempotent — but which cell is focused is
    // as unobservable here as in the build grid, so there is no subject to
    // confirm against.
    posture: "open-loop",
  },
  {
    file: "e2e/pages/steps/sources-step.ts",
    member: "commitFocusedColumnOnEveryRow",
    // UNCONFIRMED, and the walk's own bound is fixture-sized — see
    // `SOURCE_ROW_WALK_LENGTH` in `sources-step.ts` and the open item
    // `anti-patterns.md` records against it. Same reasoning as
    // `selectFocusedSourceCell`, which is the single-row form.
    posture: "open-loop",
  },
] as const;

/**
 * The single place a Space byte is written. Everything above reaches it, and a
 * method that reached past it would carry neither the keystroke delay nor the
 * ledger entry the press-count assertions are made against.
 */
const SPACE_WRITER = { file: "e2e/pages/base-step.ts", member: "pressSpace" } as const;

type PressSite = { file: string; member: string };

async function pressSitesFor(call: string): Promise<{ sites: PressSite[]; unattributed: number }> {
  const files = (await fg(PAGE_OBJECTS, { cwd: CLI_ROOT, ignore: NOT_A_PAGE_OBJECT })).sort();

  const scanned = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(path.join(CLI_ROOT, file), "utf-8");
      const { owners, unattributed } = callSiteOwners(source, call);
      return { sites: owners.map((member) => ({ file, member })), unattributed };
    }),
  );

  return {
    sites: scanned.flatMap((entry) => entry.sites),
    unattributed: scanned.reduce((total, entry) => total + entry.unattributed, 0),
  };
}

describe("every Space press in the page-object layer is accounted for", () => {
  it("presses Space only from a rostered method", async () => {
    const { sites, unattributed } = await pressSitesFor(PRESS_SPACE);

    // Subject guard: a glob that matched nothing, or a reader that understood
    // none of what it matched, would satisfy the comparison below for free. It
    // asks only whether the scan is READING — pinning the count here instead
    // would fire first on every roster mismatch and take the red away from the
    // assertion whose message says what to do about it.
    expect(
      sites.length,
      "no Space press was found at all — the scan has stopped reading",
    ).toBeGreaterThan(0);
    expect(
      unattributed,
      "a Space press sits outside any class member this reader recognises, so the roster below is not the whole set",
    ).toBe(0);

    expect(
      sites,
      "a page-object method presses Space without saying how it knows the press landed — give it a confirmation, or add it to SPACE_PRESS_SITES with the reason it cannot have one",
    ).toStrictEqual(SPACE_PRESS_SITES.map((site) => ({ file: site.file, member: site.member })));
  });

  it("writes the Space byte from one method only", async () => {
    const { sites, unattributed } = await pressSitesFor(WRITE_SPACE);

    expect(unattributed, "a raw Space write sits outside any class member").toBe(0);
    expect(
      sites,
      "a page object reaches past BaseStep.pressSpace, so its press carries neither the keystroke delay nor a ledger entry",
    ).toStrictEqual([SPACE_WRITER]);
  });
});
