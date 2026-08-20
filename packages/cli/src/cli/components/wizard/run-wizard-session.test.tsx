/**
 * The contract of one wizard session, independent of what the wizard itself renders.
 *
 * `Wizard` is stubbed with a component that fires one of its callbacks and then exits the
 * Ink app, which is exactly what the real one does (`handleComplete` and `handleCancel`
 * both call `useApp().exit()` immediately after the callback). That leaves three endings to
 * cover — completed, cancelled, and an app exit that chose neither — and the session's job
 * is to tell them apart without the wizard's own screens being involved.
 */
import { describe, expect, it, vi } from "vitest";

import { buildWizardResult } from "../../lib/__tests__/factories/config-factories.js";
import { REACT_HONO_FRAMEWORK_API_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices.js";
import { initializeMatrix } from "../../lib/matrix/matrix-provider.js";
import type { HydrateOptions } from "../../stores/wizard-store.js";
import type { SkillId } from "../../types/index.js";
import type { StartupMessage } from "../../utils/logger.js";
import { runWizardSession } from "./run-wizard-session.js";
import type { WizardProps } from "./wizard.js";

/** How the stubbed wizard ends the session, set by each test before it is rendered. */
const stubbedWizard = vi.hoisted(() => ({
  end: (_props: WizardProps): void => {},
}));

vi.mock("./wizard.js", async () => {
  const { useEffect } = await import("react");
  const { useApp } = await import("ink");

  return {
    Wizard: (props: WizardProps) => {
      const { exit } = useApp();
      useEffect(() => {
        // Deferred by a tick because that is when the real wizard's callbacks fire: both
        // run from a keypress handler, never from the mount that painted the screen. An
        // Ink mount effect runs BEFORE `render()` has returned its instance, so a stub
        // ending the session there would be testing a moment no wizard reaches.
        const ending = setTimeout(() => {
          stubbedWizard.end(props);
          exit();
        });
        return () => clearTimeout(ending);
      }, [props, exit]);
      return null;
    },
  };
});

const COMPLETED_SELECTION = buildWizardResult([]);

/** An init-flow hydration carrying no installed roster — the only shape `init` passes. */
const EMPTY_HYDRATION = { isEditingFromGlobalScope: false };

const CLI_VERSION = "0.0.0-test";

/** A real installed skill that {@link REACT_HONO_FRAMEWORK_API_MATRIX} does not carry. */
const ABSENT_SKILL_ID: SkillId = "web-styling-tailwind";

/**
 * An edit-flow hydration whose installed roster names one skill the loaded source has and one
 * it does not — the shape that makes `populateFromSkillIds` warn while the store hydrates.
 */
const HYDRATION_NAMING_AN_ABSENT_SKILL: HydrateOptions = {
  initialStep: "build",
  installedSkillIds: ["web-framework-react", ABSENT_SKILL_ID],
};

/** What the load's own buffer had already put in the band before the session was asked to run. */
const LOAD_MESSAGE: StartupMessage = { level: "info", text: "Loaded 2 skills (local)" };

function sessionOptions(overrides?: {
  onCancel?: () => void;
  clearTerminal?: () => void;
  hydrate?: HydrateOptions;
  startupMessages?: StartupMessage[];
}) {
  return {
    hydrate: overrides?.hydrate ?? EMPTY_HYDRATION,
    props: {
      version: CLI_VERSION,
      ...(overrides?.startupMessages && { startupMessages: overrides.startupMessages }),
    },
    onCancel: overrides?.onCancel ?? ((): void => {}),
    clearTerminal: overrides?.clearTerminal ?? ((): void => {}),
  };
}

describe("runWizardSession", () => {
  it("returns the selection the wizard completed with", async () => {
    stubbedWizard.end = (props) => {
      props.onComplete(COMPLETED_SELECTION);
    };

    const result = await runWizardSession(sessionOptions());

    expect(result).toStrictEqual(COMPLETED_SELECTION);
  });

  it("returns null and tells the command when the wizard is cancelled", async () => {
    const onCancel = vi.fn();
    stubbedWizard.end = (props) => {
      props.onCancel();
    };

    const result = await runWizardSession(sessionOptions({ onCancel }));

    expect(result).toBeNull();
    expect(
      onCancel,
      "the command's own cancellation notice must still be run",
    ).toHaveBeenCalledTimes(1);
  });

  it("returns null when the Ink app exits without either callback", async () => {
    stubbedWizard.end = () => {};

    const result = await runWizardSession(sessionOptions());

    expect(result).toBeNull();
  });

  it("resets the terminal on every ending", async () => {
    const clearTerminal = vi.fn();
    stubbedWizard.end = (props) => {
      props.onComplete(COMPLETED_SELECTION);
    };

    await runWizardSession(sessionOptions({ clearTerminal }));

    expect(clearTerminal).toHaveBeenCalledTimes(1);
  });

  /**
   * Hydration warns, and it runs after the load's buffer has been drained — so without a
   * window of its own the line goes to stderr, and the wizard's first frame, which is the
   * height of the terminal, pushes it off the top before anyone can read it. Reading it off
   * the props the wizard was mounted with is therefore the whole assertion: the band is the
   * only surface a message raised at this moment can survive on.
   */
  it("hands the wizard a warning the store raised while hydrating", async () => {
    initializeMatrix(REACT_HONO_FRAMEWORK_API_MATRIX);
    let band: StartupMessage[] | undefined;
    stubbedWizard.end = (props) => {
      band = props.startupMessages;
      props.onComplete(COMPLETED_SELECTION);
    };

    await runWizardSession(
      sessionOptions({
        hydrate: HYDRATION_NAMING_AN_ABSENT_SKILL,
        startupMessages: [LOAD_MESSAGE],
      }),
    );

    expect(
      band,
      "hydration's warning must reach the band, after the messages the load left there",
    ).toStrictEqual([
      LOAD_MESSAGE,
      { level: "warn", text: expect.stringContaining(ABSENT_SKILL_ID) },
    ]);
  });
});
