import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isHomeDirectory } from "./is-home-directory.js";

/** A home that is not on disk, so the real-path compare cannot run and the plain one answers. */
const ABSENT_HOME = path.join(path.sep, "no-such-root", "home", "someone");

describe("isHomeDirectory for a home that cannot be resolved", () => {
  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(ABSENT_HOME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches the home by its spelling", () => {
    expect(isHomeDirectory(ABSENT_HOME)).toBe(true);
  });

  it("matches no other directory", () => {
    expect(isHomeDirectory(path.join(ABSENT_HOME, "project"))).toBe(false);
  });
});
