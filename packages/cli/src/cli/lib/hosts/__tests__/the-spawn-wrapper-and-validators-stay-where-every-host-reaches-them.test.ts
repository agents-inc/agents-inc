import { describe, expect, it } from "vitest";

import * as exec from "../../../utils/exec.js";

/** The allowed half of the seam census: an extraction that emptied `exec.ts` would also pass it. */
const NAMES_EXEC_KEEPS = [
  "execCommand",
  "validateMarketplaceSource",
  "validatePluginName",
  "validatePluginPath",
] as const;

describe("the spawn wrapper and the argument validators", () => {
  it("stay in exec.ts, where every host reaches them", () => {
    expect(
      NAMES_EXEC_KEEPS.filter((name) => typeof exec[name] === "function"),
      "exec.ts was emptied rather than narrowed: a host now spawns its own child process, or validates its own arguments — and an injection guard that moved into one host is an injection guard the next host does not have",
    ).toStrictEqual([...NAMES_EXEC_KEEPS]);
  });
});
