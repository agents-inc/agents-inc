import { describe, expect, it, vi } from "vitest";

// fast-glob answers in the order its concurrent directory reads finish, which no real directory
// reproduces on demand, so it answers here in an order a run once produced.
const { fastGlob } = vi.hoisted(() => ({
  fastGlob: vi.fn<(pattern: string, options: object) => Promise<string[]>>(),
}));
vi.mock("fast-glob", () => ({ default: fastGlob }));

import { glob } from "./fs";

/** `worse-skill` before `bad-skill` is the order that flaked the build:plugins specs. */
const AS_THE_READS_FINISHED = [
  "worse-skill/SKILL.md",
  "bad-skill/SKILL.md",
  "README.md",
  "web-framework-react/SKILL.md",
];

/** Code-unit order puts the capital first, where a locale-aware compare would not. */
const IN_BYTEWISE_ORDER = [
  "README.md",
  "bad-skill/SKILL.md",
  "web-framework-react/SKILL.md",
  "worse-skill/SKILL.md",
];

describe("glob", () => {
  it("answers its matches in bytewise order, whatever order the scan found them in", async () => {
    fastGlob.mockResolvedValue(AS_THE_READS_FINISHED);

    expect(await glob("**/*.md", "/skills")).toStrictEqual(IN_BYTEWISE_ORDER);
  });
});
