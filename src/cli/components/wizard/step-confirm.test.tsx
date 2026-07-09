import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepConfirm } from "./step-confirm";
import { SkillAgentSummary } from "./skill-agent-summary";
import { ENTER, ESCAPE, RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants";
import { buildAgentConfigs } from "../../lib/__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../lib/__tests__/helpers/wizard-simulation";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { WEB_PAIR_MATRIX, WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { useWizardStore } from "../../stores/wizard-store";
import type { SkillConfig } from "../../types/config";
import type { SkillId } from "../../types";

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
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "global" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("React");
    });

    it("should show project-scoped skills under Project scope label", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "project" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("React");
    });

    it("should show both scope labels when both scopes have skills", () => {
      const skillConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-state-zustand"], { scope: "global" }),
      ];

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={skillConfigs} />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("Global");
    });

    it("should not show Project scope label when no project-scoped skills", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "global" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("Project");
      expect(output).toContain("Global");
    });

    it("should not show Global scope label when no global-scoped skills", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { scope: "project" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).not.toContain("Global");
    });
  });

  describe("eject icon display", () => {
    it("should show eject icon for eject-source skills", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { source: "eject" })}
        />,
      );
      cleanup = unmount;

      expect(lastFrame()).toContain("\u23CF");
    });

    it("should not show eject icon for plugin-source skills", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"], { source: "agents-inc" })}
        />,
      );
      cleanup = unmount;

      expect(lastFrame()).not.toContain("\u23CF");
    });
  });

  describe("new item markers - init mode (no prior installation)", () => {
    it("should show + prefix when installedSkillConfigs is absent", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react", "web-state-zustand"])}
        />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const skillLines = lines.filter((line) => line.includes("React") || line.includes("Zustand"));
      for (const line of skillLines) {
        expect(line).toContain("+");
        expect(line).not.toContain("\u2022");
      }
    });

    it("should show + prefix for agents when installedAgentConfigs is absent", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} agentConfigs={buildAgentConfigs(["web-developer"])} />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const agentLine = lines.find((line) => line.includes("web-developer"));
      expect(agentLine).toBeDefined();
      expect(agentLine).toContain("+");
      expect(agentLine).not.toContain("\u2022");
    });
  });

  describe("new item markers - edit mode", () => {
    it("should show + for a skill not in installedSkillConfigs", () => {
      useWizardStore.setState({ installedSkillConfigs: [] });

      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
        />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toContain("+");
    });

    it("should show bullet for a skill that IS in installedSkillConfigs", () => {
      const configs = buildSkillConfigs(["web-framework-react"]);
      useWizardStore.setState({ installedSkillConfigs: configs });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={configs} />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toContain("\u2022");
      expect(reactLine).not.toMatch(/\+.*React/);
    });

    it("should show mix of + and bullet in same scope", () => {
      const existingConfigs = buildSkillConfigs(["web-framework-react"]);
      const allConfigs: SkillConfig[] = [
        ...existingConfigs,
        ...buildSkillConfigs(["web-state-zustand"]),
      ];
      useWizardStore.setState({ installedSkillConfigs: existingConfigs });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={allConfigs} />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];

      const zustandLine = lines.find((line) => line.includes("Zustand"));
      expect(zustandLine).toBeDefined();
      expect(zustandLine).toContain("+");

      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toContain("\u2022");
      expect(reactLine).not.toMatch(/\+.*React/);
    });

    it("should show + on new agent when installedAgentConfigs is empty", () => {
      useWizardStore.setState({ installedAgentConfigs: [] });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} agentConfigs={buildAgentConfigs(["web-developer"])} />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const agentLine = lines.find((line) => line.includes("web-developer"));
      expect(agentLine).toBeDefined();
      expect(agentLine).toContain("+");
    });

    it("should show bullet on agent that was already in installedAgentConfigs", () => {
      const agents = buildAgentConfigs(["web-developer"]);
      useWizardStore.setState({ installedAgentConfigs: agents });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} agentConfigs={agents} />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const agentLine = lines.find((line) => line.includes("web-developer"));
      expect(agentLine).toBeDefined();
      expect(agentLine).toContain("\u2022");
      expect(agentLine).not.toMatch(/\+.*web-developer/);
    });
  });

  describe("removed item markers - edit mode", () => {
    it("should show - for a skill in installedSkillConfigs but not in skillConfigs", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} skillConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toMatch(/-/);
    });

    it("should show - for a removed agent", () => {
      useWizardStore.setState({
        installedAgentConfigs: buildAgentConfigs(["web-developer"]),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} agentConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const agentLine = lines.find((line) => line.includes("web-developer"));
      expect(agentLine).toBeDefined();
      expect(agentLine).toMatch(/-/);
    });

    it("should show mix of bullet and - items", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react", "web-state-zustand"]),
      });

      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
        />,
      );
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];

      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toContain("\u2022");
      expect(reactLine).not.toMatch(/\+.*React/);
      expect(reactLine).not.toMatch(/-.*React/);

      const zustandLine = lines.find((line) => line.includes("Zustand"));
      expect(zustandLine).toBeDefined();
      expect(zustandLine).toMatch(/-/);
    });

    it("should show scope heading when all skills in scope are removed", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} skillConfigs={[]} />);
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

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} skillConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeUndefined();
    });

    it("should NOT show - for a deselected global agent during init", () => {
      useWizardStore.setState({
        isInitMode: true,
        installedAgentConfigs: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} agentConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const agentLine = lines.find((line) => line.includes("web-developer"));
      expect(agentLine).toBeUndefined();
    });

    it("should still show - for removed project skills during init", () => {
      useWizardStore.setState({
        isInitMode: true,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} skillConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toMatch(/-/);
    });

    it("should show - for deselected global skill in edit mode (isInitMode=false)", () => {
      useWizardStore.setState({
        isInitMode: false,
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} skillConfigs={[]} />);
      cleanup = unmount;

      const lines = lastFrame()?.split("\n") ?? [];
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toMatch(/-/);
    });
  });

  describe("agents tables", () => {
    it("should show global agents under Global scope label", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          agentConfigs={buildAgentConfigs(["web-developer"], { scope: "global" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("web-developer");
    });

    it("should show project agents under Project scope label", () => {
      const { lastFrame, unmount } = render(
        <StepConfirm
          onComplete={vi.fn()}
          agentConfigs={buildAgentConfigs(["web-developer"], { scope: "project" })}
        />,
      );
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Project");
      expect(output).toContain("web-developer");
    });
  });

  describe("keyboard navigation", () => {
    it("should call onComplete when Enter is pressed", async () => {
      const onComplete = vi.fn();

      const { stdin, unmount } = render(
        <StepConfirm
          onComplete={onComplete}
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      await stdin.write(ENTER);
      await delay(RENDER_DELAY_MS);

      expect(onComplete).toHaveBeenCalled();
    });

    it("should call onBack when Escape is pressed and onBack provided", async () => {
      const onComplete = vi.fn();
      const onBack = vi.fn();

      const { stdin, unmount } = render(
        <StepConfirm
          onComplete={onComplete}
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
          onBack={onBack}
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      await stdin.write(ESCAPE);
      await delay(RENDER_DELAY_MS);

      expect(onBack).toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("should not crash when Escape is pressed but onBack is not provided", async () => {
      const onComplete = vi.fn();

      const { stdin, unmount } = render(
        <StepConfirm
          onComplete={onComplete}
          skillConfigs={buildSkillConfigs(["web-framework-react"])}
        />,
      );
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      await stdin.write(ESCAPE);
      await delay(RENDER_DELAY_MS);

      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe("excluded global items", () => {
    it("should show excluded global skill in Global section alongside active skills", () => {
      const installed = buildSkillConfigs(["web-framework-react", "web-state-zustand"], {
        scope: "global",
      });
      useWizardStore.setState({ installedSkillConfigs: installed });

      const skillConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        ...buildSkillConfigs(["web-state-zustand"], { scope: "global", excluded: true }),
      ];

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={skillConfigs} />,
      );
      cleanup = unmount;

      const output = lastFrame() ?? "";
      expect(output).toContain("Global");
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
    });

    it("should not hide excluded global skill from output", () => {
      const installed = buildSkillConfigs(["web-framework-react"], { scope: "global" });
      useWizardStore.setState({ installedSkillConfigs: installed });

      const skillConfigs = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        excluded: true,
      });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={skillConfigs} />,
      );
      cleanup = unmount;

      const lines = (lastFrame() ?? "").split("\n");
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
    });

    it("should show excluded global agent in Global section", () => {
      const installed = buildAgentConfigs(["web-developer"], { scope: "global" });
      useWizardStore.setState({ installedAgentConfigs: installed });

      const agentConfigs = buildAgentConfigs(["web-developer"], {
        scope: "global",
        excluded: true,
      });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} agentConfigs={agentConfigs} />,
      );
      cleanup = unmount;

      const output = lastFrame() ?? "";
      expect(output).toContain("Global");
      expect(output).toContain("web-developer");
    });

    it("should show Global section when only excluded global skills exist", () => {
      useWizardStore.setState({ installedSkillConfigs: [] });

      const skillConfigs = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        excluded: true,
      });

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={skillConfigs} />,
      );
      cleanup = unmount;

      expect(lastFrame()).toContain("Global");
    });

    it("should not duplicate a re-scoped skill in the Global section", () => {
      useWizardStore.setState({
        installedSkillConfigs: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const skillConfigs: SkillConfig[] = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ];

      const { lastFrame, unmount } = render(
        <StepConfirm onComplete={vi.fn()} skillConfigs={skillConfigs} />,
      );
      cleanup = unmount;

      const lines = (lastFrame() ?? "").split("\n");
      const reactLines = lines.filter((line) => line.includes("React"));
      // Once in Global (inherited) + once in Project (re-scoped) = 2, not 3
      expect(reactLines).toHaveLength(2);
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
      const { lastFrame, unmount } = render(<StepConfirm onComplete={vi.fn()} />);
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
        <SkillAgentSummary skillConfigs={buildSkillConfigs(["web-framework-react"])} />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("Agents Inc");
      expect(output).toContain("Eject");
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("Eject");
      expect(output).toContain("Agents Inc");
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).not.toContain("~");
      expect(output).toContain("React");
      expect(output).toContain("\u2022");
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;

      const lines = output.split("\n");
      const reactLine = lines.find((line) => line.includes("React"));
      expect(reactLine).toBeDefined();
      expect(reactLine).toContain("~");

      const vitestLine = lines.find((line) => line.includes("Vitest"));
      expect(vitestLine).toBeDefined();
      expect(vitestLine).toContain("+");
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ React");
      expect(output).toContain("\u2022 React");
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
        <SkillAgentSummary skillConfigs={savedDualScope} />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("\u2022 React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("- React");
      expect(output).not.toContain("~ React");
    });

    it("agent symmetry: in-session agent G→P toggle shows + at Project and • at Global", () => {
      // Symmetric scenario for agents — `toggleAgentScope` emits the same
      // dual-scope shape (active project + global tombstone) when the agent
      // was globally installed. The info panel must render the surviving
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("+ web-developer");
      expect(output).toContain("\u2022 web-developer");
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
        <SkillAgentSummary agentConfigs={savedDualScope} />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("\u2022 web-developer");
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
        />,
      );
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("- React");
      expect(output).toContain("\u2022 React");
      expect(output).not.toContain("+ React");
      expect(output).not.toContain("~ React");
    });
  });
});
