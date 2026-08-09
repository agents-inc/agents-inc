import { describe, it, expect } from "vitest";

import { elementAt, firstElement } from "./element-at.js";

const LETTERS = ["a", "b", "c"];

describe("elementAt", () => {
  it("returns the element at the given index", () => {
    expect(elementAt(LETTERS, 1)).toBe("b");
  });

  it("throws naming the index and the collection length when the index is past the end", () => {
    expect(() => elementAt(LETTERS, 5)).toThrow(
      "Expected an element at index 5, but the collection holds 3.",
    );
  });

  it("throws on an empty collection", () => {
    expect(() => elementAt([], 0)).toThrow(
      "Expected an element at index 0, but the collection holds 0.",
    );
  });

  it("throws when the slot exists but holds undefined", () => {
    expect(() => elementAt([undefined], 0)).toThrow("Expected an element at index 0");
  });

  it("narrows the return type so a property read needs no further guard", () => {
    const rows: { id: string }[] = [{ id: "only" }];
    expect(elementAt(rows, 0).id).toBe("only");
  });
});

describe("firstElement", () => {
  it("returns the first element", () => {
    expect(firstElement(LETTERS)).toBe("a");
  });

  it("throws on an empty collection", () => {
    expect(() => firstElement([])).toThrow(
      "Expected an element at index 0, but the collection holds 0.",
    );
  });
});
