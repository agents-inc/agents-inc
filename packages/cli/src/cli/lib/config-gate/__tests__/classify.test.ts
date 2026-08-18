import { describe, expect, it, vi } from "vitest";
import { classifyGlobalChange, consequenceTier } from "../classify.js";
import { resolveGateDeps } from "../deps.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation.js";
import { EJECT_SOURCE } from "../../../consts.js";
import type { ProjectConfig } from "../../../types/index.js";

/**
 * The classification table for `config-gate/classify.ts` — the module that
 * decides, for one config write, which of the four work tiers it belongs to.
 *
 * THE TIERS
 *
 * T1 — the full guarantee. The write moves something the generated type unions
 *      or the compiled agents are derived from, so it owes: regenerate
 *      `config-types.ts`, propagate to every registered project, recompile those
 *      projects' agents.
 * T2 — config half only. A scalar the unions do not encode changed, so the write
 *      propagates the config to registered projects but regenerates no types and
 *      recompiles no agents.
 * T3 — bookkeeping. Only the `projects[]` registration list changed. Nothing is
 *      propagated, and the matrix/agent-definition dependencies propagation
 *      needs are never loaded.
 * T4 — no-op. The write is byte-identical to what is already on disk, so no file
 *      is touched at all.
 *
 * The `source-change-on-existing-id` case is T1 rather than T2 on purpose: the
 * per-skill `source` decides the reference form a compiled agent emits
 * (`<id>:<id>` for a marketplace-sourced skill, the bare id for an ejected one),
 * so a source change that skipped the recompile leaves every registered
 * project's agents naming a reference that no longer resolves.
 */

const MARKETPLACE = "test-marketplace";

/** The global config every case diffs against: one skill, one agent, one project. */
const BASELINE: ProjectConfig = buildProjectConfig({
  name: "global",
  skills: buildSkillConfigs(["web-framework-react"], { scope: "global", origin: MARKETPLACE }),
  agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
  selectedDomains: ["web"],
  stack: { "web-developer": { "web-framework": [{ id: "web-framework-react", preloaded: true }] } },
  marketplace: "github:test-org/skills",
  projects: ["/tmp/registered-project"],
});

/** The tier a write of `next` over the baseline obliges. */
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
