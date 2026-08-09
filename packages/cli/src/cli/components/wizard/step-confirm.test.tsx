import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepConfirm } from "./step-confirm";
import { SkillAgentSummary } from "./skill-agent-summary";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../consts";
import {
  ARROW_DOWN,
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/wizard-simulation";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { WEB_PAIR_MATRIX, WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { useWizardStore } from "../../stores/wizard-store";
import type { SkillConfig } from "../../types/config";

describe("StepConfirm component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(WEB_PAIR_MATRIX);
    useWizardStore.setState({
      installedSkillConfigs: null,
      installedAgentConfigs: null,
      isInitMode: false,
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("skills tables", () => {
    it("should show global-scoped skills under Global scope label", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("React");
    });

    it("should show project-scoped skills under Project scope label", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("React");
    });

    it("should show both scope labels when both scopes have skills", () => {
      useWizardStore.setState({
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
        ],
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("Global");
    });

    it("should not show Project scope label when no project-scoped skills", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("Project");
      expect(output).toContain("Global");
    });

    it("should not show Global scope label when no global-scoped skills", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).not.toContain("Global");
    });
  });

  describe("panel header", () => {
    it("should render the marketplace and stack rows above the summary", () => {
      // The source is stated because the Marketplace row now derives from it — the factory's
      // default is `eject`, which names no marketplace at all.
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          source: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Marketplace Agents Inc");
      expect(output).toContain("Stack none");
      expect(output).toContain("React");
    });
  });

  describe("eject icon display", () => {
    it("should show eject icon for eject-source skills", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { source: "eject" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("⏏");
    });

    it("should not show eject icon for plugin-source skills", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).not.toContain("⏏");
    });
  });

  describe("new item markers - init mode (no prior installation)", () => {
    it("should show + prefix when installedSkillConfigs is absent", () => {
      useWizardStore.setState({
        skillConfigs: buildSkillConfigs(["web-framework-react", "web-state-zustand"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("+ React");
      expect(output).toContain("+ Zustand");
      expect(output).not.toContain("• React");
      expect(output).not.toContain("• Zustand");
    });

    it("should show + prefix for agents when installedAgentConfigs is absent", () => {
      useWizardStore.setState({ agentConfigs: buildAgentConfigs(["web-developer"]) });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("+ web-developer");
      expect(output).not.toContain("• web-developer");
    });
  });

  describe("new item markers - edit mode", () => {
    it("should show + for a skill not in installedSkillConfigs", () => {
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("+ React");
    });

    it("should show bullet for a skill that IS in installedSkillConfigs", () => {
      const configs = buildSkillConfigs(["web-framework-react"]);
      useWizardStore.setState({ installedSkillConfigs: configs, skillConfigs: configs });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
    });

    it("should show mix of + and bullet in same scope", () => {
      const existingConfigs = buildSkillConfigs(["web-framework-react"]);
      useWizardStore.setState({
        installedSkillConfigs: existingConfigs,
        skillConfigs: [...existingConfigs, ...buildSkillConfigs(["web-state-zustand"])],
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("+ Zustand");
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
    });

    it("should show + on new agent when installedAgentConfigs is empty", () => {
      useWizardStore.setState({
        installedAgentConfigs: [],
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("+ web-developer");
    });

    it("should show bullet on agent that was already in installedAgentConfigs", () => {
      const agents = buildAgentConfigs(["web-developer"]);
      useWizardStore.setState({ installedAgentConfigs: agents, agentConfigs: agents });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("• web-developer");
      expect(output).not.toContain("+ web-developer");
    });
  });

  describe("removed item markers - edit mode", () => {
    it("should show - for a skill in installedSkillConfigs but not in skillConfigs", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("- React");
    });

    it("should show - for a removed agent", () => {
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("- web-developer");
    });

    it("should show mix of bullet and - items", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-state-zustand"]),
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("- React");
      expect(output).toContain("- Zustand");
    });

    it("should show scope heading when all skills in scope are removed", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("Global");
    });
  });

  describe("init mode — global pre-selections should not show as removed", () => {
    it("should NOT show - for a deselected global skill during init", () => {
      useWizardStore.setState({
        isInitMode: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).not.toContain("React");
    });

    it("should NOT show - for a deselected global agent during init", () => {
      useWizardStore.setState({
        isInitMode: true,
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).not.toContain("web-developer");
    });

    it("should still show - for removed project skills during init", () => {
      useWizardStore.setState({
        isInitMode: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("- React");
    });

    it("should show - for deselected global skill in edit mode (isInitMode=false)", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("- React");
    });
  });

  describe("agents tables", () => {
    it("should show global agents under Global scope label", () => {
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("web-developer");
    });

    it("should show project agents under Project scope label", () => {
      useWizardStore.setState({
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("web-developer");
    });
  });

  describe("keyboard navigation", () => {
    it("should call onComplete when Enter is pressed", async () => {
      const onComplete = vi.fn();
      useWizardStore.setState({ skillConfigs: buildSkillConfigs(["web-framework-react"]) });

      const { stdin, unmount } = render(<StepConfirm onComplete={onComplete} onBack={vi.fn()} />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(RENDER_DELAY_MS);

      expect(onComplete).toHaveBeenCalled();
    });

    it("should call onBack when Escape is pressed", async () => {
      const onComplete = vi.fn();
      const onBack = vi.fn();
      useWizardStore.setState({ skillConfigs: buildSkillConfigs(["web-framework-react"]) });

      const { stdin, unmount } = render(<StepConfirm onComplete={onComplete} onBack={onBack} />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(RENDER_DELAY_MS);

      expect(onBack).toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should not leave or complete the step when the panel's scroll keys are pressed", async () => {
      const onComplete = vi.fn();
      const onBack = vi.fn();
      useWizardStore.setState({ skillConfigs: buildSkillConfigs(["web-framework-react"]) });

      const { stdin, unmount } = render(<StepConfirm onComplete={onComplete} onBack={onBack} />);
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(RENDER_DELAY_MS);

      expect(onComplete).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });
  });

  describe("excluded global items", () => {
    it("should show excluded global skill in Global section alongside active skills", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
          scope: "global",
        }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          ...buildSkillConfigs(["web-state-zustand"], { scope: "global", excluded: true }),
        ],
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
    });

    it("should not hide excluded global skill from output", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          excluded: true,
        }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("React");
    });

    it("should show excluded global agent in Global section", () => {
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
        agentConfigs: buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("web-developer");
    });

    it("should show Global section when only excluded global skills exist", () => {
      useWizardStore.setState({
        installedSkillConfigs: [],
        skillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          excluded: true,
        }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toContain("Global");
    });

    it("should not duplicate a re-scoped skill in the Global section", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        skillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
        ],
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      const output = lastFrame()!;
      // Once in Global (inherited •) + once in Project (re-scoped +) = 2, not 3
      const reactMatches = output.split("React").length - 1;
      expect(reactMatches).toBe(2);
    });

    it("should show correct entries for mixed re-scoped and excluded skills", () => {
      initializeMatrix(WEB_TRIO_MATRIX);
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: [
          { id: "web-framework-react", scope: "global", source: "agents-inc" },
          { id: "web-testing-vitest", scope: "global", source: "agents-inc" },
        ],
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={[
            { id: "web-framework-react", scope: "project", source: "agents-inc" },
            {
              id: "web-framework-react",
              scope: "global",
              source: "agents-inc",
              excluded: true,
            },
            {
              id: "web-testing-vitest",
              scope: "global",
              source: "agents-inc",
              excluded: true,
            },
          ]}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;

      // React should appear twice: once in Global (inherited •), once in Project (+)
      const reactMatches = output.split("React").length - 1;
      expect(reactMatches).toBe(2);

      // Vitest should appear once in Global (excluded)
      const vitestMatches = output.split("Vitest").length - 1;
      expect(vitestMatches).toBe(1);

      // Should show both scope sections
      expect(output).toContain("Project");
      expect(output).toContain("Global");
    });
  });

  describe("empty state", () => {
    it("should render without crash when no skillConfigs or agentConfigs provided", () => {
      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} onBack={vi.fn()} />);
      cleanup = unmount;

      expect(lastFrame()).toBeDefined();
    });
  });
});

describe("SkillAgentSummary component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(WEB_PAIR_MATRIX);
    useWizardStore.setState({
      installedSkillConfigs: null,
      installedAgentConfigs: null,
      isInitMode: false,
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("source mode changes", () => {
    it("should show ~ prefix when skill source changes from plugin to eject", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      // The compact "~" marker alone signals the source change; the verbose
      // "<old> → <new>" transition that overflowed the column is not rendered.
      expect(output).not.toContain("→");
    });

    it("should show ~ prefix when skill source changes from eject to plugin", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={buildSkillConfigs(["web-framework-react"], { source: "agents-inc" })}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      // The compact "~" marker alone signals the source change; the verbose
      // "<old> → <new>" transition that overflowed the column is not rendered.
      expect(output).not.toContain("→");
    });

    it("should not show ~ when skill source is unchanged", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={buildSkillConfigs(["web-framework-react"], { source: "agents-inc" })}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).not.toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("•");
    });

    it("should show ~ for global-scoped skill source change", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
        }),
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "global" })}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("Global");
    });

    it("should show both source change and new skill markers together", () => {
      initializeMatrix(WEB_TRIO_MATRIX);
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        installedAgentConfigs: null,
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={[
            ...buildSkillConfigs(["web-framework-react"]),
            ...buildSkillConfigs(["web-testing-vitest"], { source: "agents-inc" }),
          ]}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~ React");
      expect(output).toContain("+ Vitest");
    });
  });

  describe("dual-scope G→P toggle diff", () => {
    it("in-session G→P toggle should show + at Project and • at Global (not -)", () => {
      // Baseline: react is globally installed. User toggles G→P in this
      // session. Store emits dual-scope state: active project + global
      // tombstone. The global install survives (the tombstone is a
      // dual-scope indicator, not a removal signal). The Global row must
      // render as `•` (unchanged) — a `-` would falsely suggest the global
      // install was removed.
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={[
            ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
            ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
          ]}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ React");
      expect(output).toContain("• React");
      expect(output).not.toContain("- React");
      expect(output).not.toContain("~ React");
    });

    it("re-open with saved dual-scope state should show • at Project and • at Global (not +)", () => {
      // After the in-session G→P save, the next `cc edit` reads the dual-scope config:
      // active project + global tombstone. Both sides of the diff see the
      // same shape — the diff must be a no-op: `•` on both rows, not `+` on
      // the tombstone row (which would falsely re-tag the long-installed
      // global as newly added).
      const savedDualScope: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ];
      useWizardStore.setState({ installedSkillConfigs: savedDualScope });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary skillConfigs={savedDualScope} agentConfigs={[]} />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("- React");
      expect(output).not.toContain("~ React");
    });

    it("agent symmetry: in-session agent G→P toggle shows + at Project and • at Global", () => {
      // Symmetric scenario for agents — `toggleAgentScope` emits the same
      // dual-scope shape (active project + global tombstone) when the agent
      // was globally installed. The summary must render the surviving
      // global agent row as `•`, not `-`.
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          agentConfigs={[
            ...buildAgentConfigs(["web-developer"], { scope: "project" }),
            ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ]}
          skillConfigs={[]}
        />,
      );
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
      useWizardStore.setState({ installedAgentConfigs: savedDualScope });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary agentConfigs={savedDualScope} skillConfigs={[]} />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("• web-developer");
      expect(output).not.toContain("+ web-developer");
      expect(output).not.toContain("- web-developer");
      expect(output).not.toContain("~ web-developer");
    });

    it("P→G restoration should show - at Project and • at Global (not +)", () => {
      // Scenario: user had dual-scope state, then toggles P→G which drops
      // the project override AND strips the tombstone. Live is
      // `[{react, global}]`. The global install was always there (the
      // tombstone was the dual-scope indicator), so the Global row must be
      // `•`, not `+` — the user is restoring the pre-existing global
      // install, not adding a new one.
      useWizardStore.setState({
        installedSkillConfigs: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
        ],
      });

      const { lastFrame, unmount } = render(
        <SkillAgentSummary
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "global" })}
          agentConfigs={[]}
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("- React");
      expect(output).toContain("• React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("~ React");
    });
  });
});
