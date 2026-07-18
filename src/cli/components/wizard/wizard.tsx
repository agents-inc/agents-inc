import React, { useCallback, useEffect } from "react";
import { useApp, useInput } from "ink";
import { ThemeProvider } from "@inkjs/ui";
import { useWizardStore } from "../../stores/wizard-store.js";
import { cliTheme } from "../themes/default.js";
import { WizardLayout } from "./wizard-layout.js";
import { StepStack } from "./step-stack.js";
import { StepBuild } from "./step-build.js";
import { StepConfirm } from "./step-confirm.js";
import { StepSources } from "./step-sources.js";
import { StepSettings } from "./step-settings.js";
import { StepAgents } from "./step-agents.js";
import { DomainSelection } from "./domain-selection.js";
import { resolveAlias, validateSelection } from "../../lib/matrix/index.js";
import { findStack } from "../../lib/matrix/matrix-provider.js";
import {
  HOTKEY_ACCEPT_DEFAULTS,
  HOTKEY_INFO,
  HOTKEY_SCOPE,
  HOTKEY_SETTINGS,
  isHotkey,
} from "./hotkeys.js";
import type { AgentName, Domain, DomainSelections, SkillId } from "../../types/index.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import type { StartupMessage } from "../../utils/logger.js";
import { useBuildStepProps } from "../hooks/use-build-step-props.js";
import { FEATURE_FLAGS } from "../../lib/feature-flags.js";

const TOAST_DURATION_MS = 2000;

export type WizardResultV2 = {
  skills: SkillConfig[];
  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[];
  selectedStackId: string | null;
  domainSelections: DomainSelections;
  selectedDomains: Domain[];
  /**
   * Skill ids from the saved config that could not be resolved against the loaded source matrix
   * this session. The wizard could not represent them, so the merge layer must preserve any
   * existing config entry with these ids rather than treat their absence as a deselection
   * (D-233 Scenario C data-loss guard).
   */
  unresolvableSkillIds: SkillId[];
  cancelled: boolean;
  validation: {
    valid: boolean;
    errors: Array<{ message: string }>;
    warnings: Array<{ message: string }>;
  };
};

type WizardProps = {
  onComplete: (result: WizardResultV2) => void;
  onCancel: () => void;
  version?: string;
  logo?: string;
  projectDir?: string;
  startupMessages?: StartupMessage[];
  initialAgents?: AgentName[];
  installedSkillIds?: SkillId[];
};

export const Wizard: React.FC<WizardProps> = ({
  onComplete,
  onCancel,
  version,
  logo,
  projectDir,
  startupMessages,
  initialAgents,
  installedSkillIds,
}) => {
  const store = useWizardStore();
  const { exit } = useApp();

  const toastMessage = useWizardStore((s) => s.toastMessage);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      useWizardStore.getState().setToastMessage(null);
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const buildStepProps = useBuildStepProps({ store, installedSkillIds });

  useInput((input, key) => {
    // ESC is handled by step-settings.tsx's own useKeyboardNavigation hook
    if (store.showSettings) {
      if (isHotkey(input, HOTKEY_SETTINGS)) {
        store.toggleSettings();
      }
      return;
    }

    if (FEATURE_FLAGS.INFO_PANEL) {
      if (store.showInfo) {
        if (key.escape || isHotkey(input, HOTKEY_INFO)) {
          store.toggleInfo();
        }
        return;
      }

      if (isHotkey(input, HOTKEY_INFO)) {
        store.toggleInfo();
        return;
      }
    }

    if (key.escape) {
      // Steps with their own ESC handling (via useInput in child components):
      // - "stack": StackSelection handles ESC via onCancel prop
      // - "domains": DomainSelection handles ESC via CheckboxGrid onBack
      // - "build": StepBuild handles ESC via its own useInput
      // - "sources": StepSources handles ESC via onBack prop
      // - "confirm": StepConfirm handles ESC via onBack prop
      // - "agents": StepAgents handles ESC via its own useInput
      // All steps handle their own ESC, so this is a no-op.
      return;
    }

    if (
      isHotkey(input, HOTKEY_ACCEPT_DEFAULTS) &&
      store.step === "build" &&
      store.selectedStackId
    ) {
      store.setStackAction("defaults");
      store.setStep("confirm");
      return;
    }

    if (isHotkey(input, HOTKEY_SCOPE) && store.step === "build") {
      if (store.isEditingFromGlobalScope) {
        store.setToastMessage("Scope toggle unavailable in global context");
        return;
      }
      const focused = store.focusedSkillId;
      if (focused) {
        store.toggleSkillScope(focused);
      }
      return;
    }

    if (isHotkey(input, HOTKEY_SCOPE) && store.step === "agents") {
      if (store.isEditingFromGlobalScope) {
        store.setToastMessage("Scope toggle unavailable in global context");
        return;
      }
      const focused = store.focusedAgentId;
      if (focused) {
        store.toggleAgentScope(focused);
      }
      return;
    }

    if (isHotkey(input, HOTKEY_SETTINGS) && store.step === "sources") {
      store.toggleSettings();
      return;
    }
  });

  const handleComplete = useCallback(() => {
    let allSkills: SkillId[];

    if (store.selectedStackId && store.stackAction === "defaults") {
      const stack = findStack(store.selectedStackId);
      if (!stack) {
        throw new Error(`Stack not found: ${store.selectedStackId}`);
      }
      allSkills = [...stack.allSkillIds];
    } else {
      const techNames = store.getAllSelectedTechnologies();
      allSkills = techNames.map((tech) => resolveAlias(tech));
    }

    const skillConfigs: SkillConfig[] = allSkills.map((id) => {
      const existing = store.skillConfigs.find((sc) => sc.id === id && !sc.excluded);
      return existing ?? { id, scope: "global" as const, source: "eject" };
    });

    // Append excluded entries so they flow through to config generation
    const excludedConfigs = store.skillConfigs.filter((sc) => sc.excluded);
    const allSkillConfigs = [...skillConfigs, ...excludedConfigs];

    const validation = validateSelection(allSkills);

    const result: WizardResultV2 = {
      skills: allSkillConfigs,
      selectedAgents: store.selectedAgents,
      agentConfigs: store.agentConfigs,
      selectedStackId: store.selectedStackId,
      domainSelections: store.domainSelections,
      selectedDomains: store.selectedDomains,
      unresolvableSkillIds: store.unresolvableSkillIds,
      cancelled: false,
      validation,
    };

    onComplete(result);
    exit();
  }, [store, onComplete, exit]);

  const handleCancel = useCallback(() => {
    onCancel();
    exit();
  }, [onCancel, exit]);

  const renderStep = () => {
    switch (store.step) {
      case "stack":
        return <StepStack onCancel={handleCancel} />;

      case "domains":
        return <DomainSelection />;

      case "build":
        return <StepBuild {...buildStepProps} />;

      case "sources": {
        if (store.showSettings) {
          return (
            <StepSettings
              projectDir={projectDir || process.cwd()}
              onClose={() => store.toggleSettings()}
            />
          );
        }
        return (
          <StepSources
            projectDir={projectDir}
            onContinue={() => {
              if (!initialAgents?.length) {
                store.preselectAgentsFromDomains();
              }
              store.setStep("agents");
            }}
            onBack={store.goBack}
          />
        );
      }

      case "agents":
        return <StepAgents />;

      case "confirm": {
        return (
          <StepConfirm
            onComplete={handleComplete}
            skillConfigs={store.skillConfigs}
            agentConfigs={store.agentConfigs}
            onBack={store.goBack}
          />
        );
      }

      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={cliTheme}>
      <WizardLayout version={version} logo={logo} startupMessages={startupMessages}>
        {renderStep()}
      </WizardLayout>
    </ThemeProvider>
  );
};
