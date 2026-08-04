import { Box } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SummaryPanel } from "./summary-panel";
import {
  ALL_SKILLS_EJECTED_LABEL,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  formatSourceDisplayName,
} from "../../consts";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { createMockResolvedStack } from "../../lib/__tests__/factories/stack-factories";
import { silenceConsole } from "../../lib/__tests__/helpers/silence-console";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/wizard-simulation";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { SKILLS } from "../../lib/__tests__/test-fixtures";
import {
  ARROW_DOWN,
  ARROW_UP,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { useWizardStore } from "../../stores/wizard-store";

const STACK_ID = "nextjs-fullstack";
const STACK_NAME = "Next.js Full-Stack";
const UNKNOWN_STACK_ID = "ghost-stack";

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

const renderInClippedViewport = () =>
  render(
    <Box flexDirection="column" height={CLIPPING_HEIGHT_ROWS}>
      <SummaryPanel />
    </Box>,
  );

describe("SummaryPanel component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(
      createMockMatrix(SKILLS.react, SKILLS.vitest, {
        suggestedStacks: [createMockResolvedStack(STACK_ID, STACK_NAME)],
      }),
    );
    useWizardStore.setState({
      installedSkillConfigs: null,
      installedAgentConfigs: null,
      isInitMode: false,
      selectedStackId: null,
      skillConfigs: [],
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("header", () => {
    it("should name the default public marketplace when nothing is selected", () => {
      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should say every skill is ejected when no selected skill names a marketplace", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { source: EJECT_SOURCE }),
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${ALL_SKILLS_EJECTED_LABEL}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should name the marketplace the selected skills come from", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], { source: CUSTOM_MARKETPLACE }),
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(DEFAULT_MARKETPLACE_LABEL);
    });

    it("should join every distinct marketplace in play", () => {
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { source: CUSTOM_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { source: OTHER_MARKETPLACE }),
        ],
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should order the marketplaces the same way whatever order the configs hold", () => {
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.vitest.id], { source: OTHER_MARKETPLACE }),
          ...buildSkillConfigs([SKILLS.react.id], { source: CUSTOM_MARKETPLACE }),
        ],
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${JOINED_MARKETPLACES}`);
    });

    it("should name a shared marketplace once", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs([SKILLS.react.id, SKILLS.vitest.id], {
          source: CUSTOM_MARKETPLACE,
        }),
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(`${CUSTOM_MARKETPLACE} · ${CUSTOM_MARKETPLACE}`);
    });

    it("should keep naming a marketplace when only some of the skills are ejected", () => {
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs([SKILLS.react.id], { source: EJECT_SOURCE }),
          ...buildSkillConfigs([SKILLS.vitest.id], { source: CUSTOM_MARKETPLACE }),
        ],
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
      expect(output).not.toContain(ALL_SKILLS_EJECTED_LABEL);
    });

    it("should name the marketplace of a masked global install", () => {
      // A tombstone still records a real global install and where it came from, and the summary
      // below renders it as a row — so the header has to own it too.
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs([SKILLS.react.id], {
          scope: "global",
          source: CUSTOM_MARKETPLACE,
          excluded: true,
        }),
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      expect(lastFrame()).toContain(`Marketplace ${CUSTOM_MARKETPLACE}`);
    });

    it("should resolve the selected stack id to its display name", () => {
      useWizardStore.setState({ selectedStackId: STACK_ID });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      expect(lastFrame()).toContain(`Stack ${STACK_NAME}`);
    });

    it("should render a stack of none when no stack is selected", () => {
      useWizardStore.setState({ selectedStackId: null });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      expect(lastFrame()).toContain("Stack none");
    });

    describe("stack id the matrix does not hold", () => {
      silenceConsole(["error"]);

      it("should surface it as an error instead of labelling the row with the raw id", async () => {
        useWizardStore.setState({ selectedStackId: UNKNOWN_STACK_ID });

        // Ink's error boundary catches the throw and paints the message, so the
        // frame — not a rejected render() — is where the assertion lands. It
        // paints on a *re-render*, though, so the first frame can still be
        // empty: this read is a race, and it is only ever lost on a slower
        // machine. Locally it passed 15 times out of 15 and failed on CI's
        // first honest run of this suite. Hence the wait every other async
        // assertion in this file already does.
        const { lastFrame, unmount } = render(<SummaryPanel />);
        cleanup = unmount;
        await delay(RENDER_DELAY_MS);

        const output = lastFrame();
        expect(output).toContain(`Stack not found: ${UNKNOWN_STACK_ID}`);
        expect(output).not.toContain(`Stack ${UNKNOWN_STACK_ID}`);
      });
    });
  });

  describe("summary", () => {
    it("should render the skills and agents held in the store", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });

      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("+ React");
      expect(output).toContain("+ web-developer");
    });

    it("should render the header even when there is nothing to summarize", () => {
      const { lastFrame, unmount } = render(<SummaryPanel />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(`Marketplace ${DEFAULT_MARKETPLACE_LABEL}`);
      expect(output).not.toContain("Skills");
    });
  });

  describe("scrolling", () => {
    beforeEach(() => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });
    });

    it("should count the lines it clips when the content outgrows the viewport", async () => {
      const { lastFrame, unmount } = renderInClippedViewport();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      expect(lastFrame()).toContain(`${CLIPPED_LINES} more below`);
    });

    it("should move the content up one line per down-arrow press", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("1 more above");
      expect(output).toContain(`${CLIPPED_LINES - 1} more below`);
    });

    it("should stop at the top of the content on up-arrow", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport();
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).not.toContain("more above");
      expect(output).toContain(`${CLIPPED_LINES} more below`);
    });

    it("should stop at the last line of the content on further down-arrows", async () => {
      const { stdin, lastFrame, unmount } = renderInClippedViewport();
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
