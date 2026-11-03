import path from "path";
import { describe, expect, it } from "vitest";

import { toPosixPath } from "./posix-path.js";

describe("toPosixPath", () => {
  it("joins a native path's segments with a forward slash", () => {
    expect(toPosixPath(path.join("skills", "web-framework-react", "SKILL.md"))).toBe(
      "skills/web-framework-react/SKILL.md",
    );
  });

  it("keeps a path with no separator as written", () => {
    expect(toPosixPath("config.ts")).toBe("config.ts");
  });
});
