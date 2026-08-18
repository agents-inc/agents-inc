import React, { useCallback, useEffect } from "react";
import { EJECT_SOURCE } from "../../consts.js";
import { useApp, useInput } from "ink";
import { ThemeProvider } from "@inkjs/ui";
import { useWizardStore, type WizardState } from "../../stores/wizard-store.js";
import { cliTheme } from "../themes/default.js";
import { WizardLayout } from "./wizard-layout.js";
import { StepStack } from "./step-stack.js";
import { StepBuild } from "./step-build.js";
import { StepConfirm } from "./step-confirm.js";
import { StepSources } from "./step-sources.js";
import { StepAgents } from "./step-agents.js";
import { DomainSelection } from "./domain-selection.js";
import { validateSelection } from "../../lib/matrix/index.js";
import { getSkillById } from "../../lib/matrix/matrix-provider.js";
import { findStack } from "../../lib/matrix/matrix-provider.js";
import {
  HOTKEY_ACCEPT_DEFAULTS,
  HOTKEY_INFO,
  HOTKEY_SCOPE,
  isHotkey,
  isInfoPanelAvailable,
} from "./hotkeys.js";
import type {
  AgentName,
  Domain,
  DomainSelections,
  SelectionValidation,
  SkillId,
  StackAgentConfig,
} from "../../types/index.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import type { StartupMessage } from "../../utils/logger.js";
import { useBuildStepProps } from "../hooks/use-build-step-props.js";

const TOAST_DURATION_MS = 2000;

export type WizardResultV2 = {
  skills: SkillConfig[];
  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[];
  /**
   * What each sub-agent holds and what preloads, when the producer knows per `(skill, sub-agent)`.
   * A shared configuration installed with `init --from` does: it assigns each skill to named
   * sub-agents at a named load state, and that curation is the whole of what was shared.
   *
   * The wizard has no per-agent granularity — a skill is selected for the project, not for one
   * sub-agent — so it leaves this undefined and the install pipeline's ownership rules build the
   * stack as they always have.
   */
  assignedStack?: Partial<Record<AgentName, StackAgentConfig>>;
  selectedStackId: string | null;
  domainSelections: DomainSelections;
  selectedDomains: Domain[];
  /**
   * Skill ids from the saved config that could not be resolved against the loaded source matrix
   * this session. The wizard could not represent them, so they are absent from `skills` and the
   * merge removes their config entries. Carried out of the wizard so the command can NAME each
   * removal and say why it happened — a removal the user never asked for must never be silent
   * (CLI-450).
   */
  unresolvableSkillIds: SkillId[];
  cancelled: boolean;
  validation: SelectionValidation;
};

export type WizardProps = {
  onComplete: (result: WizardResultV2) => void;
  onCancel: () => void;
  version: string;
  logo?: string | undefined;
  startupMessages?: StartupMessage[] | undefined;
  initialAgents?: AgentName[] | undefined;
  installedSkillIds?: SkillId[] | undefined;
};

/** S-key scope toggle: blocked (with a toast) in global context; no-op without a focused row. */
function toggleFocusedScope<Id>(
  isEditingFromGlobalScope: boolean,
  focusedId: Id | null,
  actions: { toggle: (id: Id) => void; setToastMessage: (message: string) => void },
): void {
  if (isEditingFromGlobalScope) {
    actions.setToastMessage("Scope toggle unavailable in global context");
    return;
  }
  if (focusedId) {
    actions.toggle(focusedId);
  }
}

/** Selected skill ids: the chosen stack's full list under stack-defaults, else the wizard selections. */
export function resolveSelectedSkillIds(store: WizardState): SkillId[] {
  if (store.selectedStackId && store.stackAction === "defaults") {
    const stack = findStack(store.selectedStackId);
    if (!stack) {
      throw new Error(`Stack not found: ${store.selectedStackId}`);
    }
    return [...stack.allSkillIds];
  }
  return store.getAllSelectedTechnologies().map((tech) => getSkillById(tech).id);
}

export const Wizard: React.FC<WizardProps> = ({
  onComplete,
  onCancel,
  version,
  logo,
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

  const buildStepProps = useBuildStepProps({
    store,
    ...(installedSkillIds !== undefined && { installedSkillIds }),
  });

  useInput((input, key) => {
    // Closing is never gated on the step: the panel is only ever open on a step
    // that allows it, and gating the close would strand the overlay.
    if (store.showInfo) {
      if (key.escape || isHotkey(input, HOTKEY_INFO)) {
        store.toggleInfo();
      }
      return;
    }

    if (isInfoPanelAvailable(store.step) && isHotkey(input, HOTKEY_INFO)) {
      store.toggleInfo();
      return;
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
      toggleFocusedScope(store.isEditingFromGlobalScope, store.focusedSkillId, {
        toggle: store.toggleSkillScope,
        setToastMessage: store.setToastMessage,
      });
      return;
    }

    if (isHotkey(input, HOTKEY_SCOPE) && store.step === "agents") {
      toggleFocusedScope(store.isEditingFromGlobalScope, store.focusedAgentId, {
        toggle: store.toggleAgentScope,
        setToastMessage: store.setToastMessage,
      });
      return;
    }
  });

  const handleComplete = useCallback(() => {
    const allSkills = resolveSelectedSkillIds(store);

    const skillConfigs: SkillConfig[] = allSkills.map((id) => {
      const existing = store.skillConfigs.find((sc) => sc.id === id && !sc.excluded);
      return existing ?? { id, scope: "global" as const, origin: EJECT_SOURCE };
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
        return (
          <StepSources
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
        return <StepConfirm onComplete={handleComplete} onBack={store.goBack} />;
      }

      default: {
        const _exhaustive: never = store.step;
        return _exhaustive;
      }
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
