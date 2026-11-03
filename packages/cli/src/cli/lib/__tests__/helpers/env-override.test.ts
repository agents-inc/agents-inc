import { afterEach, describe, expect, it } from "vitest";

import { captureEnv, overrideEnv } from "./env-override.js";

const VARIABLE = "AGENTS_INC_ENV_OVERRIDE_SPEC";

describe("overrideEnv", () => {
  afterEach(() => {
    delete process.env[VARIABLE];
  });

  it("sets the variable, and its restore puts back the value it replaced", () => {
    process.env[VARIABLE] = "as found";

    const restore = overrideEnv(VARIABLE, "overridden");
    expect(process.env[VARIABLE]).toBe("overridden");

    restore();
    expect(process.env[VARIABLE]).toBe("as found");
  });

  it("removes the variable again when it was absent before the override", () => {
    const restore = overrideEnv(VARIABLE, "overridden");

    restore();
    expect(Object.hasOwn(process.env, VARIABLE)).toBe(false);
  });
});

describe("captureEnv", () => {
  afterEach(() => {
    delete process.env[VARIABLE];
  });

  it("undoes whatever happened to the variable after it was captured", () => {
    process.env[VARIABLE] = "as found";
    const restore = captureEnv(VARIABLE);

    delete process.env[VARIABLE];
    restore();

    expect(process.env[VARIABLE]).toBe("as found");
  });
});
