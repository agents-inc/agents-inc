import { describe, expect, it } from "vitest";

import { envReadsIn } from "./env-reads.js";

const NOTHING_READ = { named: [], viaConstant: [], wholeObject: 0, unrecognised: [] };

describe("envReadsIn", () => {
  it("finds nothing in a source that never touches the environment", () => {
    expect(envReadsIn("export const answer = 42;\n")).toStrictEqual(NOTHING_READ);
  });

  it("names a dotted read", () => {
    expect(envReadsIn('const url = process.env.AGENTS_INC_API_URL ?? "";')).toStrictEqual({
      ...NOTHING_READ,
      named: ["AGENTS_INC_API_URL"],
    });
  });

  it("names a bracketed string-literal read", () => {
    expect(envReadsIn('if (process.env["VITEST"]) return;')).toStrictEqual({
      ...NOTHING_READ,
      named: ["VITEST"],
    });
  });

  it("reports the identifier a bracketed read goes through rather than guessing its value", () => {
    expect(envReadsIn("const value = process.env[SOURCE_ENV_VAR];")).toStrictEqual({
      ...NOTHING_READ,
      viaConstant: ["SOURCE_ENV_VAR"],
    });
  });

  it("counts a spread of the whole object, which names no variable and forwards every one", () => {
    expect(envReadsIn("const env = { ...process.env, ...overrides };")).toStrictEqual({
      ...NOTHING_READ,
      wholeObject: 1,
    });
  });

  // The field the whole reader exists for. A shape it cannot classify has to arrive as a
  // report, because a reader that dropped it would answer "this file reads nothing" for a file
  // that reads everything — and a gate asking "is every read pinned" would agree.
  it("reports a shape it cannot classify instead of dropping it", () => {
    expect(envReadsIn("const every = Object.keys(process.env);")).toStrictEqual({
      ...NOTHING_READ,
      unrecognised: ["process.env);"],
    });
  });

  it("keeps every occurrence, in file order, including repeats of one variable", () => {
    const source = [
      "const cache = process.env.XDG_CACHE_HOME;",
      "const again = process.env.XDG_CACHE_HOME;",
      "const auth = process.env.GIGET_AUTH;",
    ].join("\n");

    expect(envReadsIn(source).named).toStrictEqual([
      "XDG_CACHE_HOME",
      "XDG_CACHE_HOME",
      "GIGET_AUTH",
    ]);
  });

  it("does not read a spread as an unclassifiable shape, nor a dotted read as a spread", () => {
    const source = "const env = { ...process.env, HOME: home };\nconst home = process.env.HOME;";

    expect(envReadsIn(source)).toStrictEqual({
      ...NOTHING_READ,
      named: ["HOME"],
      wholeObject: 1,
    });
  });
});
