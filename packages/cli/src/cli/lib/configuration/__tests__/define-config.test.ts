import { describe, it, expect } from "vitest";
import { defineConfig } from "../define-config";
import type { ProjectConfig } from "../../../types";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";

describe("defineConfig", () => {
  it("returns its input unchanged for a minimal config", () => {
    const config: ProjectConfig = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"]),
    });
    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  it("returns its input unchanged for a full config", () => {
    const config: ProjectConfig = buildProjectConfig({
      name: "full-project",
      description: "A complete project",
      agents: buildAgentConfigs(["web-developer", "api-developer"]),
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      author: "@vince",
      selectedDomains: ["web", "api"],
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
      },
    });
    const result = defineConfig(config);
    expect(result).toBe(config);
  });

  it("preserves object identity (identity function)", () => {
    const config: ProjectConfig = buildProjectConfig({
      name: "identity-test",
      agents: [],
      skills: [],
    });
    expect(defineConfig(config)).toBe(config);
  });
});
