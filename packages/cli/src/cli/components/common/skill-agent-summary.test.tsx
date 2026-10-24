import { renderToString } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillAgentSummary, type SkillAgentSummaryProps } from "./skill-agent-summary";
import { MIN_TERMINAL_SIZE } from "../../consts";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/skill-config-builders";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { WEB_PAIR_MATRIX, WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import type { SkillConfig } from "../../types/config";

const NOTHING_INSTALLED: SkillAgentSummaryProps = {
  skillConfigs: [],
  agentConfigs: [],
  installedSkillConfigs: null,
  installedAgentConfigs: null,
  isInitMode: false,
};

const renderSummary = (props: Partial<SkillAgentSummaryProps>) =>
  render(<SkillAgentSummary {...NOTHING_INSTALLED} {...props} />);

describe("SkillAgentSummary component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(WEB_PAIR_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("layout", () => {
    const COPIED_REACT_NOW_PLUGIN_ZUSTAND_AND_AN_AGENT: Partial<SkillAgentSummaryProps> = {
      installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
      skillConfigs: [
        ...buildSkillConfigs(["web-framework-react"]),
        ...buildSkillConfigs(["web-state-zustand"], { scope: "global", origin: "agents-inc" }),
      ],
      installedAgentConfigs: [],
      agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
    };

    it("lays skills and agents side by side under their scopes, divided by a rule", () => {
      const { lastFrame, unmount } = renderSummary(COPIED_REACT_NOW_PLUGIN_ZUSTAND_AND_AN_AGENT);
      cleanup = unmount;

      expect(lastFrame()).toMatchInlineSnapshot(`
        "Skills                                                           │  Agents
                                                                         │
         Project                                                         │   Project
        ~ React ⏏                                                        │  + web-developer
                                                                         │
         Global                                                          │
        + Zustand                                                        │"
      `);
    });

    it("marks a copied skill with the eject symbol and a plugin skill without it", () => {
      const { lastFrame, unmount } = renderSummary(COPIED_REACT_NOW_PLUGIN_ZUSTAND_AND_AN_AGENT);
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~ React ⏏");
      expect(output).toContain("+ Zustand");
      expect(output).not.toContain("Zustand ⏏");
    });

    /**
     * At 80 columns the right half starts and ends mid-column. The second skill is absent from
     * the matrix, so it is drawn by its id, which is longer than the half.
     */
    it("keeps the border and every letter beside a name too long for the right half at 80 columns", () => {
      const frame = renderToString(
        <SkillAgentSummary
          {...NOTHING_INSTALLED}
          skillConfigs={buildSkillConfigs([
            "web-framework-react",
            "web-testing-react-testing-library",
          ])}
          agentConfigs={buildAgentConfigs(["web-developer"])}
        />,
        { columns: MIN_TERMINAL_SIZE.COLS },
      );

      expect(frame).toMatchInlineSnapshot(`
        "Skills                                             │  Agents
                                                           │
         Project                                           │   Project
        + React ⏏                 + web-testing-react-test │  + web-developer
                                    ing-library ⏏          │"
      `);
    });

    it("heads no Project scope in either column when every row is global", () => {
      const { lastFrame, unmount } = renderSummary({
        skillConfigs: buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
        agentConfigs: buildAgentConfigs(["api-developer"], { scope: "global" }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ Zustand");
      expect(output).toContain("+ api-developer");
      expect(output).not.toContain("Project");
    });
  });

  describe("source mode changes", () => {
    it("should show ~ prefix when skill source changes from plugin to eject", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).not.toContain("→");
    });

    it("should show ~ prefix when skill source changes from eject to plugin", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
        skillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).not.toContain("→");
    });

    it("should not show ~ when skill source is unchanged", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).not.toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("•");
    });

    it("should show ~ for global-scoped skill source change", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("Global");
    });

    it("should show both source change and new skill markers together", () => {
      initializeMatrix(WEB_TRIO_MATRIX);

      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { origin: "agents-inc" }),
        ],
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~ React");
      expect(output).toContain("+ Vitest");
    });
  });

  describe("dual-scope G→P toggle diff", () => {
    it("in-session G→P toggle should show + at Project and • at Global (not -)", () => {
      // The tombstone marks dual scope, not a removal.
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
        ],
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ React");
      expect(output).toContain("• React");
      expect(output).not.toContain("- React");
      expect(output).not.toContain("~ React");
    });

    it("re-open with saved dual-scope state should show • at Project and • at Global (not +)", () => {
      const savedDualScope: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ];

      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: savedDualScope,
        skillConfigs: savedDualScope,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("- React");
      expect(output).not.toContain("~ React");
    });

    it("agent symmetry: in-session agent G→P toggle shows + at Project and • at Global", () => {
      const { lastFrame, unmount } = renderSummary({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        agentConfigs: [
          ...buildAgentConfigs(["web-developer"], { scope: "project" }),
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
        ],
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ web-developer");
      expect(output).toContain("• web-developer");
      expect(output).not.toContain("- web-developer");
      expect(output).not.toContain("~ web-developer");
    });

    it("agent symmetry: re-open with saved dual-scope agent shows • at both scopes", () => {
      const savedDualScope = [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      ];

      const { lastFrame, unmount } = renderSummary({
        installedAgentConfigs: savedDualScope,
        agentConfigs: savedDualScope,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• web-developer");
      expect(output).not.toContain("+ web-developer");
      expect(output).not.toContain("- web-developer");
      expect(output).not.toContain("~ web-developer");
    });

    it("P→G restoration should show - at Project and • at Global (not +)", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
        ],
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("- React");
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("~ React");
    });
  });

  describe("excluded global items", () => {
    it("should show correct entries for mixed re-scoped and excluded skills", () => {
      initializeMatrix(WEB_TRIO_MATRIX);

      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
        ],
      });
      cleanup = unmount;

      const output = lastFrame()!;

      // Once in Global (inherited), once in Project (added).
      const reactMatches = output.split("React").length - 1;
      expect(reactMatches).toBe(2);

      const vitestMatches = output.split("Vitest").length - 1;
      expect(vitestMatches).toBe(1);

      expect(output).toContain("Project");
      expect(output).toContain("Global");
    });
  });

  describe("rows removed in one render and restored in the next", () => {
    const INSTALLED: Partial<SkillAgentSummaryProps> = {
      installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-state-zustand"]),
      installedAgentConfigs: buildAgentConfigs(["web-developer", "api-developer"], {
        scope: "project",
      }),
    };

    it("shows each removed skill and agent once after the re-render", () => {
      const { lastFrame, rerender, unmount } = renderSummary(INSTALLED);
      cleanup = unmount;

      rerender(
        <SkillAgentSummary
          {...NOTHING_INSTALLED}
          {...INSTALLED}
          skillConfigs={buildSkillConfigs(["web-state-zustand"])}
          agentConfigs={buildAgentConfigs(["api-developer"], { scope: "project" })}
        />,
      );

      expect(lastFrame()).toMatchInlineSnapshot(`
        "Skills                                                           │  Agents
                                                                         │
         Project                                                         │   Project
        • Zustand ⏏                     - React ⏏                        │  • api-developer
                                                                         │  - web-developer"
      `);
    });
  });

  describe("entries that stay where they are and still change", () => {
    const REACT_AND_WEB_DEVELOPER: Partial<SkillAgentSummaryProps> = {
      skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
      installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
    };

    it("marks a skill the run writes over with ↻ and a sub-agent that changes with ~", () => {
      const { lastFrame, unmount } = renderSummary({
        ...REACT_AND_WEB_DEVELOPER,
        overwrittenSkillIds: new Set(["web-framework-react"]),
        changedAgentNames: new Set(["web-developer"]),
      });
      cleanup = unmount;

      expect(lastFrame()).toMatchInlineSnapshot(`
        "Skills                                                           │  Agents
                                                                         │
         Project                                                         │   Project
        ↻ React ⏏                                                        │  ~ web-developer"
      `);
    });

    it("marks both unchanged when the run says nothing changes them", () => {
      const { lastFrame, unmount } = renderSummary(REACT_AND_WEB_DEVELOPER);
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• React ⏏");
      expect(output).toContain("• web-developer");
      expect(output).not.toContain("↻");
      expect(output).not.toContain("~");
    });
  });

  describe("an installation shown as it stands", () => {
    it("should mark every row unchanged when the installed configuration is the current one", () => {
      const skillConfigs = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
      ];
      const agentConfigs = [
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
      ];

      const { lastFrame, unmount } = renderSummary({
        skillConfigs,
        agentConfigs,
        installedSkillConfigs: skillConfigs,
        installedAgentConfigs: agentConfigs,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• React");
      expect(output).toContain("• Zustand");
      expect(output).toContain("• web-developer");
      expect(output).toContain("• api-developer");
      expect(output).not.toContain("+ ");
      expect(output).not.toContain("- ");
      expect(output).not.toContain("~ ");
    });
  });

  /** One rule for every row: the name its entry records, else the catalogue's, else the id. */
  describe("the name each skill row is drawn by", () => {
    it("is the name its entry records, over the catalogue's", () => {
      const { lastFrame, unmount } = renderSummary({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { displayName: "Acme React" }),
        installedSkillConfigs: buildSkillConfigs(["web-state-zustand"], {
          displayName: "Acme Zustand",
        }),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output, "an arriving row is named by the entry the run writes").toContain(
        "+ Acme React ⏏",
      );
      expect(output, "a leaving row is named by the entry the install recorded").toContain(
        "- Acme Zustand ⏏",
      );
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("- Zustand");
    });

    it("is the catalogue's for an entry that records none", () => {
      const { lastFrame, unmount } = renderSummary({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedSkillConfigs: buildSkillConfigs(["web-state-zustand"]),
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ React ⏏");
      expect(output).toContain("- Zustand ⏏");
    });

    it("is the id for an entry that records none, of a skill the catalogue lacks", () => {
      const { lastFrame, unmount } = renderSummary({
        skillConfigs: buildSkillConfigs(["api-framework-hono"]),
      });
      cleanup = unmount;

      expect(lastFrame()).toContain("+ api-framework-hono ⏏");
    });

    it("is drawn on one line, whatever the record holds", () => {
      const { lastFrame, unmount } = renderSummary({
        installedSkillConfigs: buildSkillConfigs(["web-testing-react-testing-library"], {
          displayName: "Testing\nLibrary",
        }),
      });
      cleanup = unmount;

      expect(lastFrame()).toContain("- Testing Library ⏏");
    });
  });
});
