import { describe, expect, it, vi } from "vitest";
import { classifyGlobalChange, consequenceTier } from "../classify.js";
import { resolveGateDeps } from "../deps.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import { EJECT_SOURCE } from "../../../consts.js";
import type { ProjectConfig } from "../../../types/index.js";

/**
 * T1 regenerates types, propagates and recompiles; T2 propagates the config half only; T3 is
 * registration-only bookkeeping; T4 is a byte-identical no-op. A `source` change is T1 because it
 * changes the reference form a compiled agent emits.
 */

const MARKETPLACE = "test-marketplace";

const BASELINE: ProjectConfig = buildProjectConfig({
  name: "global",
  skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: MARKETPLACE }),
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
  selectedDomains: ["web"],
  stack: { "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: true }] } },
  marketplace: "github:test-org/skills",
  projects: ["/tmp/registered-project"],
});

function tierOf(next: ProjectConfig): string {
  return consequenceTier(classifyGlobalChange(BASELINE, next));
}

describe("classify", () => {
  describe("T1 — types, propagation and recompile", () => {
    it("classifies a source change on an already-configured skill id as T1 (types + propagate + recompile)", () => {
      const next = {
        ...BASELINE,
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: EJECT_SOURCE,
        }),
      };

      expect(classifyGlobalChange(BASELINE, next).skills.sourceChanged).toStrictEqual([
        "web-framework-react",
      ]);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies an added skill as T1 (types + propagate + recompile)", () => {
      const next = {
        ...BASELINE,
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
          scope: "global",
          origin: MARKETPLACE,
        }),
      };

      expect(classifyGlobalChange(BASELINE, next).skills.added).toStrictEqual([
        "api-framework-hono",
      ]);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies a removed skill as T1 (types + propagate + recompile)", () => {
      const next = { ...BASELINE, skills: [] };

      expect(classifyGlobalChange(BASELINE, next).skills.removed).toStrictEqual([
        "web-framework-react",
      ]);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies an added agent as T1 (types + propagate + recompile)", () => {
      const next = {
        ...BASELINE,
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
      };

      expect(classifyGlobalChange(BASELINE, next).agents.added).toStrictEqual(["api-developer"]);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies a removed agent as T1 (types + propagate + recompile)", () => {
      const next = { ...BASELINE, agents: [] };

      expect(classifyGlobalChange(BASELINE, next).agents.removed).toStrictEqual(["web-developer"]);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies a stack change as T1 (types + propagate + recompile)", () => {
      const next: ProjectConfig = {
        ...BASELINE,
        stack: { "web-developer": { "web-framework": [{ id: "web-framework-react" }] } },
      };

      expect(classifyGlobalChange(BASELINE, next).stackChanged).toBe(true);
      expect(tierOf(next)).toBe("T1");
    });

    it("classifies a selected-domains change as T1 (types + propagate + recompile)", () => {
      const next: ProjectConfig = { ...BASELINE, selectedDomains: ["web", "api"] };

      expect(classifyGlobalChange(BASELINE, next).selectedDomainsChanged).toBe(true);
      expect(tierOf(next)).toBe("T1");
    });
  });

  describe("T2 — config-half propagation only", () => {
    it("classifies a source-scalar-only change as T2 (propagate config, no types, no recompile)", () => {
      const next: ProjectConfig = { ...BASELINE, marketplace: "github:other-org/skills" };

      expect(classifyGlobalChange(BASELINE, next).scalarsChanged).toStrictEqual(["marketplace"]);
      expect(tierOf(next)).toBe("T2");
    });

    it("classifies a marketplace-name-scalar-only change as T2 (propagate config, no types, no recompile)", () => {
      const next: ProjectConfig = { ...BASELINE, marketplaceName: MARKETPLACE };

      expect(classifyGlobalChange(BASELINE, next).scalarsChanged).toStrictEqual([
        "marketplaceName",
      ]);
      expect(tierOf(next)).toBe("T2");
    });

    it("classifies an author-scalar-only change as T2 (propagate config, no types, no recompile)", () => {
      const next: ProjectConfig = { ...BASELINE, author: "@agents-inc" };

      expect(classifyGlobalChange(BASELINE, next).scalarsChanged).toStrictEqual(["author"]);
      expect(tierOf(next)).toBe("T2");
    });
  });

  describe("T3 — registration bookkeeping", () => {
    it("classifies a projects[]-only change as T3 (no propagation)", () => {
      const next: ProjectConfig = { ...BASELINE, projects: [] };

      const changes = classifyGlobalChange(BASELINE, next);
      expect(changes.projectsChanged).toBe(true);
      expect(changes.scalarsChanged).toStrictEqual([]);
      expect(tierOf(next)).toBe("T3");
    });

    it("never loads the matrix or agent definitions for a T3 write", async () => {
      const loadMatrix = vi.fn();
      const loadAgents = vi.fn();
      const tier = consequenceTier(classifyGlobalChange(BASELINE, { ...BASELINE, projects: [] }));

      expect(tier).toBe("T3");
      expect(await resolveGateDeps({ loadMatrix, loadAgents }, tier)).toBeNull();
      expect(loadMatrix, "a registration-only write must stay offline").not.toHaveBeenCalled();
      expect(loadAgents, "a registration-only write must stay offline").not.toHaveBeenCalled();
    });
  });

  describe("T4 — no-op", () => {
    it("classifies a byte-identical config as T4 (no write)", () => {
      expect(tierOf({ ...BASELINE })).toBe("T4");
    });
  });
});
