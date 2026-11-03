import { describe, expect, it } from "vitest";

import { parseJsonOrUndefined } from "./json.js";

describe("parseJsonOrUndefined", () => {
  it("answers the value JSON text holds", () => {
    expect(parseJsonOrUndefined('{"name":"agents-inc","skills":[]}')).toStrictEqual({
      name: "agents-inc",
      skills: [],
    });
  });

  it("answers undefined for text that is not JSON", () => {
    expect(parseJsonOrUndefined("{ name: agents-inc")).toBeUndefined();
  });
});
