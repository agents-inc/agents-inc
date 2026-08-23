import { describe, expect, it } from "vitest";

import { INTERNAL_RETRIES, TIMEOUTS } from "./constants.js";
import { toggleListRowUntilRendered } from "./list-row-toggle.js";

const LABEL = "Web Developer";
const SELECTED = "[✓]";
const UNSELECTED = "[ ]";

/** How the row reads when it is focused, which is the only row this loop ever judges. */
const focusedRow = (checkbox: string): string => `  ❯ ${checkbox} ${LABEL}`;

/**
 * A screen holding the focused row and an unfocused row carrying the same label — the shape the
 * agents list paints for a sub-agent that exists at both scopes.
 *
 * The twin is written BELOW the focused row deliberately. This module reads newest-to-oldest, so
 * a twin placed above would be skipped by a reader that had stopped looking at the focus marker
 * at all, and the test asserting the focused row is the subject would hold for the wrong reason.
 */
const screenAround = (checkbox: string): string =>
  [focusedRow(checkbox), `    ${UNSELECTED} ${LABEL} (other scope)`, `    ${UNSELECTED} API`].join(
    "\n",
  );

/**
 * The closed-loop toggle both list steps press Space through, driven against fakes.
 *
 * Same reasoning as `retry-space.e2e.test.ts` beside it, one layer up: the race is not
 * reproducible on a real PTY — Ink registers a remounted list's `useInput` handler in an effect,
 * and a keystroke arriving between the commit and the effect flush is discarded with no trace on
 * any surface. So the loop is driven here through a screen that can be told to lose a press, and
 * every assertion is made on the press LEDGER rather than on what the row ended up saying.
 *
 * **The ledger is the whole point, and the one-press case is the load-bearing test.** Space
 * TOGGLES, so a blind re-press of a press that DID land turns the selection back off — and an
 * agent toggled twice is indistinguishable from an agent never toggled on every surface the suite
 * reads. A loop that always re-pressed would satisfy every "did it end up selected" assertion in
 * this file and be a worse defect than the dropped keystroke it was written for.
 */
describe("toggleListRowUntilRendered", () => {
  /**
   * A focused row that can be told to swallow its first `swallow` presses. `pressed` counts every
   * press the harness spent, including the ones the fake swallowed — the keystroke was written to
   * the terminal either way, which is exactly what a ledger has to record.
   */
  const rowWorld = (swallow: number) => {
    const world = { pressed: 0, selected: false };
    return {
      world,
      subject: {
        method: "AgentsStep.toggleAgent",
        label: LABEL,
        readScreen: (): string => screenAround(world.selected ? SELECTED : UNSELECTED),
        press: async (): Promise<void> => {
          world.pressed += 1;
          if (world.pressed > swallow) world.selected = !world.selected;
        },
      },
    };
  };

  it("spends exactly one press when the first press lands", async () => {
    const { world, subject } = rowWorld(0);

    await toggleListRowUntilRendered(subject);

    expect(
      world.pressed,
      "a landed press must never be re-pressed — Space is a toggle, so a second press undoes it",
    ).toBe(1);
    expect(world.selected, "the loop must leave the row in the state it was driving towards").toBe(
      true,
    );
  });

  it("re-presses a swallowed press until the row renders the other way round", async () => {
    const { world, subject } = rowWorld(1);

    await toggleListRowUntilRendered(subject);

    expect(world.pressed, "the swallowed press must be re-pressed exactly once").toBe(2);
    expect(world.selected, "the retry must land the toggle the swallowed press owed").toBe(true);
  });

  it(
    "gives up on the framework's shared budget, naming the method and the row",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { world, subject } = rowWorld(Number.POSITIVE_INFINITY);

      await expect(toggleListRowUntilRendered(subject)).rejects.toThrow(
        /AgentsStep\.toggleAgent: the focused row "Web Developer" still renders/,
      );

      expect(world.pressed, "the loop is bounded by the framework's shared re-press budget").toBe(
        INTERNAL_RETRIES.MAX_ATTEMPTS,
      );
    },
  );

  it("presses nothing at all when the label is on no focused row", async () => {
    const { world, subject } = rowWorld(0);

    await expect(toggleListRowUntilRendered({ ...subject, label: "Nobody" })).rejects.toThrow(
      /no focused row is labelled "Nobody"/,
    );

    expect(
      world.pressed,
      "a subject the loop cannot even find must cost a keystroke it can never confirm",
    ).toBe(0);
  });

  it("judges the FOCUSED row rather than another row carrying the same label", async () => {
    // The unfocused row in `screenAround` never changes, so a loop reading it would poll to its
    // deadline and re-press on every attempt — the exact double-press this design refuses.
    const { world, subject } = rowWorld(0);

    await toggleListRowUntilRendered(subject);

    expect(world.pressed, "the unfocused twin must not be what the confirmation reads").toBe(1);
  });

  it(
    "answers a press that landed and was immediately undone with another press",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // Press 1 reads as swallowed; press 2 lands; press 1 then arrives and undoes it, so the
      // row is back where it started. The first look after press 2 sees the toggle and the
      // SECOND look — the one every attempt past the first pays for — sees it undone.
      const world = { pressed: 0, looksAfterSecondPress: 0 };
      const rendered = (): string => {
        if (world.pressed >= 3) return SELECTED;
        if (world.pressed !== 2) return UNSELECTED;
        world.looksAfterSecondPress += 1;
        return world.looksAfterSecondPress === 1 ? SELECTED : UNSELECTED;
      };

      await toggleListRowUntilRendered({
        method: "AgentsStep.toggleAgent",
        label: LABEL,
        readScreen: (): string => screenAround(rendered()),
        press: async (): Promise<void> => {
          world.pressed += 1;
        },
      });

      expect(
        world.pressed,
        "a toggle that came straight back to where it started must be re-pressed, not accepted",
      ).toBe(3);
    },
  );
});
