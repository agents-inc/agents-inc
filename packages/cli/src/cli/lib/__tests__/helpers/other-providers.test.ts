import { describe, expect, it } from "vitest";

import { PROVIDERS, type Provider } from "../../../consts.js";
import { otherThan } from "./other-providers.js";

const OTHERS = {
  claude: ["codex"],
  codex: ["claude"],
} as const satisfies Record<Provider, readonly Provider[]>;

describe("otherThan", () => {
  it.each(PROVIDERS)("names every provider but %s, and only those", (provider) => {
    expect(otherThan(provider)).toStrictEqual(OTHERS[provider]);
  });
});
