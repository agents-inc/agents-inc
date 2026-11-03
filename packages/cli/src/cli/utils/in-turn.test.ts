import { describe, expect, it } from "vitest";

import { mapInTurn } from "./in-turn.js";

const SLOWEST_FIRST = [30, 10, 20];

function settleAfter(milliseconds: number, settled: number[]): Promise<number> {
  return new Promise((resolve) =>
    setTimeout(() => {
      settled.push(milliseconds);
      resolve(milliseconds * 2);
    }, milliseconds),
  );
}

describe("mapInTurn", () => {
  it("starts each step only after the one before it settles", async () => {
    const settled: number[] = [];

    await mapInTurn(SLOWEST_FIRST, (milliseconds) => settleAfter(milliseconds, settled));

    expect(settled).toStrictEqual(SLOWEST_FIRST);
  });

  it("answers each step's result in the items' order", async () => {
    const results = await mapInTurn(SLOWEST_FIRST, (milliseconds) => settleAfter(milliseconds, []));

    expect(results).toStrictEqual([60, 20, 40]);
  });

  it("answers nothing for no items", async () => {
    expect(await mapInTurn([], (item: number) => Promise.resolve(item))).toStrictEqual([]);
  });
});
