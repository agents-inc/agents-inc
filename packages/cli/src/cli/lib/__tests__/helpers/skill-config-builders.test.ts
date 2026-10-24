import { describe, expect, it } from "vitest";

import {
  buildSkillConfig,
  buildSkillConfigs,
  FACTORY_DEFAULT_SCOPE,
} from "./skill-config-builders.js";

const REACT = "web-framework-react";
const ZUSTAND = "web-state-zustand";

describe("buildSkillConfig", () => {
  it("defaults to a project copy and writes no optional field it was not given", () => {
    expect(buildSkillConfig(REACT)).toStrictEqual({
      id: REACT,
      scope: FACTORY_DEFAULT_SCOPE,
      origin: "eject",
    });
  });

  it("carries a display name it is given beside every other override", () => {
    expect(
      buildSkillConfig(REACT, {
        scope: "global",
        origin: "agents-inc",
        displayName: "Acme React",
        excluded: true,
      }),
      "a spec building an entry that records a name must get the name back, or it asserts on an entry with none",
    ).toStrictEqual({
      id: REACT,
      scope: "global",
      origin: "agents-inc",
      displayName: "Acme React",
      excluded: true,
    });
  });

  it("carries an empty display name as given, rather than leaving it out", () => {
    expect(buildSkillConfig(REACT, { displayName: "" })).toStrictEqual({
      id: REACT,
      scope: FACTORY_DEFAULT_SCOPE,
      origin: "eject",
      displayName: "",
    });
  });
});

describe("buildSkillConfigs", () => {
  it("gives every entry the display name it is given", () => {
    expect(buildSkillConfigs([REACT, ZUSTAND], { displayName: "Shared" })).toStrictEqual([
      { id: REACT, scope: FACTORY_DEFAULT_SCOPE, origin: "eject", displayName: "Shared" },
      { id: ZUSTAND, scope: FACTORY_DEFAULT_SCOPE, origin: "eject", displayName: "Shared" },
    ]);
  });
});
