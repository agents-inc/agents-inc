import { describe, expect, it } from "vitest";

import { INTERNAL_RETRIES } from "./constants.js";
import { retrySpaceUntilToggled } from "./retry-space.js";

/**
 * The Space retry loop, driven against a forced first-press loss.
 *
 * The race it exists for is not reproducible on a real PTY — Ink registers a
 * remounted `CategoryGrid`'s `useInput` handler in an effect, and a keystroke
 * that arrives between the commit and the effect flush is discarded with no
 * trace on any surface. So the loop is driven here through fakes that lose a
 * press on demand, and the two properties that matter are asserted on the
 * press LEDGER rather than on the wall clock.
 *
 * The second property is the load-bearing one. Space is a TOGGLE, so a blind
 * re-press of a press that DID land turns the selection back off — converting
 * a dropped keystroke into a double keystroke, which is worse than the bug
 * being fixed. Every test below therefore states how many presses the loop
 * spent, not merely that it finished.
 */
describe("retrySpaceUntilToggled", () => {
  /**
   * A toggle that can be told to swallow its first `swallow` presses, and a
   * confirmation that reads the same state the presses write. `pressed` is the
   * ledger every assertion here is made against — a press the fake swallowed
   * still counts, because the harness spent the keystroke either way.
   */
  const togglingWorld = (swallow: number) => {
    const world = { pressed: 0, on: false };
    return {
      world,
      press: async (): Promise<void> => {
        world.pressed += 1;
        if (world.pressed > swallow) world.on = !world.on;
      },
      confirmToggled: async (): Promise<void> => {
        if (!world.on) throw new Error("the frame still shows the skill unselected");
      },
    };
  };

  it("spends exactly one press when the first press lands", async () => {
    const { world, press, confirmToggled } = togglingWorld(0);

    await retrySpaceUntilToggled(press, confirmToggled);

    expect(
      world.pressed,
      "a landed press must never be re-pressed — Space is a toggle, so a second press undoes it",
    ).toBe(1);
    expect(world.on, "the loop must leave the skill in the state it was driving towards").toBe(
      true,
    );
  });

  it("re-presses a swallowed press until the frame shows the toggle", async () => {
    const { world, press, confirmToggled } = togglingWorld(1);

    await retrySpaceUntilToggled(press, confirmToggled);

    expect(world.pressed, "the swallowed press must be re-pressed exactly once").toBe(2);
    expect(world.on, "the retry must land the toggle the swallowed press owed").toBe(true);
  });

  it("throws the confirmation's own error when every press is swallowed", async () => {
    const { world, press, confirmToggled } = togglingWorld(Number.POSITIVE_INFINITY);

    await expect(retrySpaceUntilToggled(press, confirmToggled)).rejects.toThrow(
      "the frame still shows the skill unselected",
    );

    expect(world.pressed, "the loop is bounded by the framework's shared re-press budget").toBe(
      INTERNAL_RETRIES.MAX_ATTEMPTS,
    );
  });

  it("tells the confirmation which attempt it is confirming", async () => {
    const { press, confirmToggled } = togglingWorld(2);
    const confirmedAttempts: number[] = [];

    await retrySpaceUntilToggled(press, async (attempt) => {
      confirmedAttempts.push(attempt);
      await confirmToggled();
    });

    // The first attempt is the only one with no second press in flight behind
    // it, so it is the only one a confirmation may accept without re-reading.
    // A confirmation that cannot tell attempt 0 from attempt 2 either pays that
    // re-read on every toggle in the suite or never pays it at all.
    expect(
      confirmedAttempts,
      "each confirmation must be told how many presses preceded it",
    ).toStrictEqual([0, 1, 2]);
  });
});
