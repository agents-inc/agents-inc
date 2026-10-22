import { describe, expect, it } from "vitest";

import { check } from "./check-symbol-citations.js";

const TREES_THAT_CITE = ["e2e", "scripts", "src"];

describe("this repository", () => {
  const repository = check();

  it("reads every tree that carries citations, so an empty verdict is not an unread one", () => {
    expect(
      repository.citing,
      "a tree the walk stopped reaching reports exactly what a tree whose every citation resolves reports",
    ).toStrictEqual(TREES_THAT_CITE);
  });

  it("has no citation offering a reader a jump that lands nowhere", () => {
    expect(
      repository.unresolved,
      "typecheck and lint both pass over an unresolvable citation in silence, so this is the only thing that reads them",
    ).toStrictEqual([]);
    expect(repository.clean).toBe(true);
  });
});
