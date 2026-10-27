import { beforeEach, describe, expect, it } from "vitest";
import { summaryPanelText, type SummaryPanelProps } from "./summary-panel";
import {
  ALL_SKILLS_EJECTED_LABEL,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  MIN_TERMINAL_SIZE,
  formatSourceDisplayName,
} from "../../consts";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/skill-config-builders";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { SKILLS } from "../../lib/__tests__/test-fixtures";

const STACK_NAME = "Next.js Full-Stack";

const DEFAULT_MARKETPLACE_LABEL = formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME);

/** No display label, so each renders its own name; written in sorted order. */
const CUSTOM_MARKETPLACE = "acme-skills";
const OTHER_MARKETPLACE = "zeta-skills";
const JOINED_MARKETPLACES = `${CUSTOM_MARKETPLACE} · ${OTHER_MARKETPLACE}`;

/** Kebab-case like every marketplace name, so it has no space to wrap at. */
const LONG_MARKETPLACE =
  "acme-corporation-internal-agent-skills-marketplace-for-platform-engineering-teams-and-contractors";
const LONG_STACK_NAME =
  "Next.js Full-Stack With Hono, Drizzle, Better Auth, React Query, Zustand and Vitest Testing";

const NOTHING_SELECTED: SummaryPanelProps = {
  skillConfigs: [],
  agentConfigs: [],
  installedSkillConfigs: null,
  installedAgentConfigs: null,
  isInitMode: false,
  stackName: undefined,
};

/** The panel as the commands print it, at the width ink-testing-library draws a frame. */
const PRINTED_COLUMNS = 100;

const printedPanel = (props: Partial<SummaryPanelProps> = {}): string =>
  summaryPanelText({ ...NOTHING_SELECTED, ...props }, PRINTED_COLUMNS);

describe("SummaryPanel component", () => {
  beforeEach(() => {
    initializeMatrix(WEB_TRIO_MATRIX);
  });

  describe("header", () => {
    it("rules the header off from the summary with one line below it and none around it", () => {
      expect(printedPanel()).toMatchInlineSnapshot(`
        "┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
        │  Marketplace Agents Inc                                                                          │
        │  Stack none                                                                                      │
        │                                                                                                  │
        │  ──────────────────────────────────────────────────────────────────────────────────────────────  │
        │                                                                                                  │
        └──────────────────────────────────────────────────────────────────────────────────────────────────┘"
      `);
    });

    it("should name the default public marketplace when nothing is selected", () => {
      const output = printedPanel();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should say every skill is ejected when no selected skill names a marketplace", () => {
      const output = printedPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: EJECT_SOURCE }),
      });
      expect(output).toContain(`Marketplace ${ALL_SKILLS_EJECTED_LABEL}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should name the marketplace the selected skills come from", () => {
      const output = printedPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
      });
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should join every distinct marketplace in play", () => {
      const output = printedPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: OTHER_MARKETPLACE }),
        ],
      });
      expect(output).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should order the marketplaces the same way whatever order the configs hold", () => {
      const output = printedPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: OTHER_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
        ],
      });
      expect(output).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should name a shared marketplace once", () => {
      const output = printedPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id, SKILLS.vitest.id], {
          origin: CUSTOM_MARKETPLACE,
        }),
      });
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(`${CUSTOM_MARKETPLACE} · ${CUSTOM_MARKETPLACE}`);
    });

    it("should keep naming a marketplace when only some of the skills are ejected", () => {
      const output = printedPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { origin: EJECT_SOURCE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: CUSTOM_MARKETPLACE }),
        ],
      });
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should name the marketplace of a masked global install", () => {
      // The summary renders a tombstone as a row, so the header owns it too.
      const output = printedPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], {
          scope: "global",
          origin: CUSTOM_MARKETPLACE,
          excluded: true,
        }),
      });
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
    });

    it("should say every skill was ejected when it keeps none and removes only ejected ones", () => {
      const output = printedPanel({
        installedSkillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: EJECT_SOURCE }),
      });
      expect(output).toContain(`Marketplace ${ALL_SKILLS_EJECTED_LABEL}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should name the marketplace the skills it removes came from when it keeps none", () => {
      const output = printedPanel({
        installedSkillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
      });
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should name the stack it is given", () => {
      const output = printedPanel({ stackName: STACK_NAME });
      expect(output).toContain(`Stack ${STACK_NAME}`);
    });

    it("should render a stack of none when it is given no stack", () => {
      const output = printedPanel();
      expect(output).toContain("Stack none");
    });
  });

  /**
   * Each name is longer than the line beside its label at both widths. A label sharing a row with
   * such a name keeps its gap and every letter only when the name alone may shrink. The control is
   * names that fit: pinned here at 80 columns, and under "header" above at 100.
   */
  describe("header, beside names longer than their line", () => {
    const LONG_NAMES: Partial<SummaryPanelProps> = {
      skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: LONG_MARKETPLACE }),
      stackName: LONG_STACK_NAME,
    };

    it("keeps both labels a space from names that fit their line at 80 columns", () => {
      const text = summaryPanelText(
        {
          ...NOTHING_SELECTED,
          skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
          stackName: STACK_NAME,
        },
        MIN_TERMINAL_SIZE.COLS,
      );

      expect(text).toMatchInlineSnapshot(`
        "┌──────────────────────────────────────────────────────────────────────────────┐
        │  Marketplace acme-skills                                                     │
        │  Stack Next.js Full-Stack                                                    │
        │                                                                              │
        │  ──────────────────────────────────────────────────────────────────────────  │
        │                                                                              │
        │  Skills                                         │  Agents                    │
        │                                                 │                            │
        │   Project                                       │                            │
        │  + React                                        │                            │
        └──────────────────────────────────────────────────────────────────────────────┘"
      `);
    });

    it("keeps both labels whole and wraps each name under itself at 80 columns", () => {
      const text = summaryPanelText({ ...NOTHING_SELECTED, ...LONG_NAMES }, MIN_TERMINAL_SIZE.COLS);

      expect(text).toMatchInlineSnapshot(`
        "┌──────────────────────────────────────────────────────────────────────────────┐
        │  Marketplace acme-corporation-internal-agent-skills-marketplace-for-platfor  │
        │              m-engineering-teams-and-contractors                             │
        │  Stack Next.js Full-Stack With Hono, Drizzle, Better Auth, React Query,      │
        │        Zustand and Vitest Testing                                            │
        │                                                                              │
        │  ──────────────────────────────────────────────────────────────────────────  │
        │                                                                              │
        │  Skills                                         │  Agents                    │
        │                                                 │                            │
        │   Project                                       │                            │
        │  + React                                        │                            │
        └──────────────────────────────────────────────────────────────────────────────┘"
      `);
    });

    it("keeps both labels whole and wraps each name under itself at 100 columns", () => {
      expect(printedPanel(LONG_NAMES)).toMatchInlineSnapshot(`
        "┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
        │  Marketplace acme-corporation-internal-agent-skills-marketplace-for-platform-engineering-teams-  │
        │              and-contractors                                                                     │
        │  Stack Next.js Full-Stack With Hono, Drizzle, Better Auth, React Query, Zustand and Vitest       │
        │        Testing                                                                                   │
        │                                                                                                  │
        │  ──────────────────────────────────────────────────────────────────────────────────────────────  │
        │                                                                                                  │
        │  Skills                                                       │  Agents                          │
        │                                                               │                                  │
        │   Project                                                     │                                  │
        │  + React                                                      │                                  │
        └──────────────────────────────────────────────────────────────────────────────────────────────────┘"
      `);
    });
  });

  describe("summary", () => {
    it("should render the skills and agents it is given", () => {
      const output = printedPanel({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });
      expect(output).toContain("+ React");
      expect(output).toContain("+ web-developer");
    });

    it("should diff the summary against the installation it is given", () => {
      const output = printedPanel({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedAgentConfigs: buildAgentConfigs(["web-developer"]),
      });
      expect(output).toContain("- React");
      expect(output).toContain("- web-developer");
    });

    it("should not mark a global skill removed when it is told this is an init", () => {
      const output = printedPanel({
        isInitMode: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });
      expect(output).not.toContain("React");
    });

    it("should render the header even when there is nothing to summarize", () => {
      const output = printedPanel();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain("Skills");
    });
  });

  describe("as text printed once", () => {
    const NARROW_COLUMNS = 60;

    it("draws the whole panel as wide as the columns it is given, with nothing to scroll", () => {
      const text = summaryPanelText(
        {
          ...NOTHING_SELECTED,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["web-developer"]),
        },
        NARROW_COLUMNS,
      );

      expect(text).toMatchInlineSnapshot(`
        "┌──────────────────────────────────────────────────────────┐
        │  Marketplace All skills ejected                          │
        │  Stack none                                              │
        │                                                          │
        │  ──────────────────────────────────────────────────────  │
        │                                                          │
        │  Skills                            │  Agents             │
        │                                    │                     │
        │   Project                          │   Project           │
        │  + React ⏏                         │  + web-developer    │
        └──────────────────────────────────────────────────────────┘"
      `);
    });
  });
});
