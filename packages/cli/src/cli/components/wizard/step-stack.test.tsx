import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepStack } from "./step-stack";
import { useWizardStore } from "../../stores/wizard-store";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { SKILLS } from "../../lib/__tests__/test-fixtures";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { createMockResolvedStack } from "../../lib/__tests__/factories/stack-factories";
import { TEST_CATEGORIES } from "../../lib/__tests__/test-fixtures";

import type { MergedSkillsMatrix } from "../../types";
import {
  ARROW_DOWN,
  ARROW_UP,
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  SELECT_NAV_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

const createMockStackWithSkills = (): MergedSkillsMatrix => {
  const suggestedStacks = [
    createMockResolvedStack("react-fullstack", "React Fullstack", {
      description: "Full React stack with Zustand and Hono",
      allSkillIds: ["web-framework-react", "web-state-zustand", "api-framework-hono"],
    }),
    createMockResolvedStack("react-minimal", "React Minimal", {
      allSkillIds: ["web-framework-react"],
    }),
  ];

  return createMockMatrix(SKILLS.react, SKILLS.zustand, SKILLS.hono, {
    suggestedStacks,
    categories: {
      "web-framework": { ...TEST_CATEGORIES.framework, domain: "web" as const, exclusive: false },
      "api-api": { ...TEST_CATEGORIES.api, domain: "api" as const, exclusive: false, order: 1 },
      "cli-framework": {
        ...TEST_CATEGORIES.cliFramework,
        domain: "cli" as const,
        exclusive: false,
        order: 2,
      },
      "mobile-framework": {
        ...TEST_CATEGORIES.mobileFramework,
        domain: "mobile" as const,
        exclusive: false,
        order: 3,
      },
    },
  });
};

describe("StepStack component", () => {
  let cleanup: (() => void) | undefined;
  let mockMatrix: MergedSkillsMatrix;

  beforeEach(() => {
    mockMatrix = createMockStackWithSkills();
    initializeMatrix(mockMatrix);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("stack/scratch selection", () => {
    describe("rendering", () => {
      it("should render stack options and scratch option", () => {
        const { lastFrame, unmount } = render(<StepStack />);
        cleanup = unmount;

        const output = lastFrame();
        expect(output).toContain("React Fullstack");
        expect(output).toContain("React Minimal");
        expect(output).toContain("Start from scratch");
      });

      it("should render focused stack description (only focused item shows description)", () => {
        const { lastFrame, unmount } = render(<StepStack />);
        cleanup = unmount;

        const output = lastFrame();
        expect(output).toContain("Full React stack");
      });

      it("should render stack selection content (title rendered by wizard-layout)", () => {
        const { lastFrame, unmount } = render(<StepStack />);
        cleanup = unmount;

        const output = lastFrame();
        expect(output).toContain("React Fullstack");
        expect(output).toContain("Start from scratch");
      });

      it("should render section structure with scratch option", () => {
        const { lastFrame, unmount } = render(<StepStack />);
        cleanup = unmount;

        const output = lastFrame();
        expect(output).toContain("Start from scratch");
        expect(output).toContain("Select domains and skills manually");
      });
    });

    describe("stack selection", () => {
      it("should set approach and transition to domains step on Enter", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { approach, selectedStackId, step } = useWizardStore.getState();
        expect(approach).toBe("stack");
        expect(selectedStackId).toBe("react-fullstack");
        expect(step).toBe("domains");
      });

      it("should select second stack when navigated to", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedStackId } = useWizardStore.getState();
        expect(selectedStackId).toBe("react-minimal");
      });
    });

    describe("scratch selection", () => {
      it("should set approach and transition to domains step when scratch is selected", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { approach, selectedStackId, step } = useWizardStore.getState();
        expect(approach).toBe("scratch");
        expect(selectedStackId).toBeNull();
        expect(step).toBe("domains");
      });

      it("should pre-select domains except CLI when scratch is chosen", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedDomains } = useWizardStore.getState();
        expect(selectedDomains).toContain("web");
        expect(selectedDomains).toContain("api");
        expect(selectedDomains).toContain("mobile");
        expect(selectedDomains).not.toContain("cli");
      });
    });

    describe("cancel navigation", () => {
      it("should call onCancel when pressing Escape at initial view", async () => {
        const onCancel = vi.fn();
        const { stdin, unmount } = render(<StepStack onCancel={onCancel} />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ESCAPE);
        await delay(SELECT_NAV_DELAY_MS);

        expect(onCancel).toHaveBeenCalledTimes(1);
      });
    });

    describe("arrow key navigation", () => {
      it("should navigate down to second stack card", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedStackId } = useWizardStore.getState();
        expect(selectedStackId).toBe("react-minimal");
      });

      it("should navigate down then up back to first stack", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_UP);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedStackId } = useWizardStore.getState();
        expect(selectedStackId).toBe("react-fullstack");
      });

      it("should wrap to last item when pressing up from first item", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        // From index 0, UP wraps to scratch (index 2), UP again goes to react-minimal (index 1)
        stdin.write(ARROW_UP);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_UP);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedStackId } = useWizardStore.getState();
        expect(selectedStackId).toBe("react-minimal");
      });

      it("should wrap to first item when pressing down past last item", async () => {
        const { stdin, unmount } = render(<StepStack />);
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);

        // From index 0, DOWN x4: 0->1->2->0->1 (react-minimal)
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ARROW_DOWN);
        await delay(SELECT_NAV_DELAY_MS);
        stdin.write(ENTER);
        await delay(SELECT_NAV_DELAY_MS);

        const { selectedStackId } = useWizardStore.getState();
        expect(selectedStackId).toBe("react-minimal");
      });
    });

    describe("empty state", () => {
      it("should still show scratch option with no stacks available", () => {
        const emptyMatrix = createMockMatrix({}, { suggestedStacks: [] });
        initializeMatrix(emptyMatrix);

        const { lastFrame, unmount } = render(<StepStack />);
        cleanup = unmount;

        const output = lastFrame();
        expect(output).toContain("Start from scratch");
      });
    });
  });
});
