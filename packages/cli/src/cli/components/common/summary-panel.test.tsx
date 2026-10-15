import { Box } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SummaryPanel, type SummaryPanelProps } from "./summary-panel";
import {
  ALL_SKILLS_EJECTED_LABEL,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  formatSourceDisplayName,
} from "../../consts";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/skill-config-builders";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { SKILLS } from "../../lib/__tests__/test-fixtures";
import {
  ARROW_DOWN,
  ARROW_UP,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

const STACK_NAME = "Next.js Full-Stack";

/** The label the default public marketplace resolves to — `SOURCE_DISPLAY_NAMES` maps its name. */
const DEFAULT_MARKETPLACE_LABEL = formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME);

/**
 * Marketplaces `SOURCE_DISPLAY_NAMES` holds no label for, so each must render its own name
 * unchanged — the custom-marketplace case. Both lowercase and alphabetically ordered as written,
 * so the joined expectation reads in the same order the row sorts them into.
 */
const CUSTOM_MARKETPLACE = "acme-skills";
const OTHER_MARKETPLACE = "zeta-skills";
const JOINED_MARKETPLACES = `${CUSTOM_MARKETPLACE} · ${OTHER_MARKETPLACE}`;

/** Shorter than the header plus summary, so the panel has to clip and say so. */
const CLIPPING_HEIGHT_ROWS = 8;
/** Content lines the panel cannot show at {@link CLIPPING_HEIGHT_ROWS}, and so the travel a full scroll takes. */
const CLIPPED_LINES = 4;

/** Nothing selected, no stack and no installation recorded; each case states only what it changes. */
const NOTHING_SELECTED: SummaryPanelProps = {
  skillConfigs: [],
  agentConfigs: [],
  installedSkillConfigs: null,
  installedAgentConfigs: null,
  isInitMode: false,
  stackName: undefined,
};

const renderPanel = (props: Partial<SummaryPanelProps> = {}) =>
  render(<SummaryPanel {...NOTHING_SELECTED} {...props} />);

const renderInClippedViewport = (props: Partial<SummaryPanelProps>) =>
  render(
    <Box flexDirection="column" height={CLIPPING_HEIGHT_ROWS}>
      <SummaryPanel {...NOTHING_SELECTED} {...props} />
    </Box>,
  );

describe("SummaryPanel component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(WEB_TRIO_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("header", () => {
    it("should name the default public marketplace when nothing is selected", () => {
      const { lastFrame, unmount } = renderPanel();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should say every skill is ejected when no selected skill names a marketplace", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: EJECT_SOURCE }),
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${ALL_SKILLS_EJECTED_LABEL}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should name the marketplace the selected skills come from", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should join every distinct marketplace in play", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: OTHER_MARKETPLACE }),
        ],
      });
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should order the marketplaces the same way whatever order the configs hold", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: OTHER_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.react.id], { origin: CUSTOM_MARKETPLACE }),
        ],
      });
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should name a shared marketplace once", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id, SKILLS.vitest.id], {
          origin: CUSTOM_MARKETPLACE,
        }),
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(`${CUSTOM_MARKETPLACE} · ${CUSTOM_MARKETPLACE}`);
    });

    it("should keep naming a marketplace when only some of the skills are ejected", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { origin: EJECT_SOURCE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { origin: CUSTOM_MARKETPLACE }),
        ],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should name the marketplace of a masked global install", () => {
      // A tombstone still records a real global install and where it came from, and the summary
      // below renders it as a row — so the header has to own it too.
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], {
          scope: "global",
          origin: CUSTOM_MARKETPLACE,
          excluded: true,
        }),
      });
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
    });

    it("should name the stack it is given", () => {
      const { lastFrame, unmount } = renderPanel({ stackName: STACK_NAME });
      cleanup = unmount;

      expect(lastFrame()).toContain(`Stack ${STACK_NAME}`);
    });

    it("should render a stack of none when it is given no stack", () => {
      const { lastFrame, unmount } = renderPanel();
      cleanup = unmount;

      expect(lastFrame()).toContain("Stack none");
    });
  });

  describe("summary", () => {
    it("should render the skills and agents it is given", () => {
      const { lastFrame, unmount } = renderPanel({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("+ React");
      expect(output).toContain("+ web-developer");
    });

    it("should diff the summary against the installation it is given", () => {
      const { lastFrame, unmount } = renderPanel({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedAgentConfigs: buildAgentConfigs(["web-developer"]),
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("- React");
      expect(output).toContain("- web-developer");
    });

    it("should not mark a global skill removed when it is told this is an init", () => {
      const { lastFrame, unmount } = renderPanel({
        isInitMode: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });
      cleanup = unmount;

      expect(lastFrame()).not.toContain("React");
    });

    it("should render the header even when there is nothing to summarize", () => {
      const { lastFrame, unmount } = renderPanel();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain("Skills");
    });
  });

  describe("scrolling", () => {
    const SUMMARISED: Partial<SummaryPanelProps> = {
      skillConfigs: buildSkillConfigs(["web-framework-react"]),
      agentConfigs: buildAgentConfigs(["web-developer"]),
    };

    it("should count the lines it clips when the content outgrows the viewport", async () => {
      const { lastFrame, unmount } = renderInClippedViewport(SUMMARISED);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain(`${CLIPPED_LINES} more below`);
    });

    it("should move the content up one line per down-arrow press", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport(SUMMARISED);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("1 more above");
      expect(output).toContain(`${CLIPPED_LINES - 1} more below`);
    });

    it("should stop at the top of the content on up-arrow", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport(SUMMARISED);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).not.toContain("more above");
      expect(output).toContain(`${CLIPPED_LINES} more below`);
    });

    it("should stop at the last line of the content on further down-arrows", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport(SUMMARISED);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      for (let press = 0; press < CLIPPED_LINES + 1; press++) {
        stdin.write(ARROW_DOWN);
        await delay(INPUT_DELAY_MS);
      }

      const output = lastFrame();
      expect(output).toContain(`${CLIPPED_LINES} more above`);
      expect(output).not.toContain("more below");
    });
  });
});
