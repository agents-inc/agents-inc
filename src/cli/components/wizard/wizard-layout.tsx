import { Box, Text } from "ink";
import React, { Fragment } from "react";
import { CLI_COLORS } from "../../consts.js";
import type { StartupMessage } from "../../utils/logger.js";
import { FEATURE_FLAGS } from "../../lib/feature-flags.js";
import { useWizardStore, type WizardStep } from "../../stores/wizard-store.js";
import { useTerminalDimensions } from "../hooks/use-terminal-dimensions.js";
import { InfoPanel } from "./info-panel.js";
import { Toast } from "./toast.js";
import {
  HOTKEY_INFO,
  HOTKEY_SCOPE,
  HOTKEY_SET_ALL_LOCAL,
  HOTKEY_SET_ALL_PLUGIN,
  HOTKEY_SETTINGS,
  HOTKEY_FILTER_INCOMPATIBLE,
  HOTKEY_TOGGLE_LABELS,
  KEY_LABEL_ENTER,
  KEY_LABEL_ESC,
  KEY_LABEL_SPACE,
} from "./hotkeys.js";
import {
  WIZARD_STEPS,
  WizardTabs,
  type DomainNavProps,
  type TabDropdownProps,
} from "./wizard-tabs.js";
import { getDomainDisplayName, getStackName, orderDomains } from "./utils.js";
import type { Domain } from "../../types/index.js";

const FALLBACK_DOMAIN: Domain = "web";

type KeyHintProps = {
  isVisible?: boolean;
  isActive?: boolean;
  label: string;
  values: string[];
};

const DefinitionItem: React.FC<KeyHintProps> = ({
  isVisible = true,
  isActive = false,
  label,
  values,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Text>
      {values.map((value) => (
        <Fragment key={value}>
          <Text
            backgroundColor={CLI_COLORS.LABEL_BG}
            color={isActive ? CLI_COLORS.PRIMARY : CLI_COLORS.UNFOCUSED}
          >
            {" "}
            {value}{" "}
          </Text>{" "}
        </Fragment>
      ))}
      <Text color={isActive ? CLI_COLORS.PRIMARY : undefined}>{label}</Text>
    </Text>
  );
};

const HOT_KEYS: { label: string; values: string[] }[] = [
  { label: "select", values: [KEY_LABEL_SPACE] },
  { label: "continue", values: [KEY_LABEL_ENTER] },
  { label: "back", values: [KEY_LABEL_ESC] },
];

const WizardFooter = () => {
  return (
    <Box
      columnGap={2}
      borderTop
      borderRight={false}
      borderBottom
      borderLeft={false}
      borderColor="blackBright"
      borderStyle="single"
      paddingLeft={1}
      paddingRight={1}
    >
      {HOT_KEYS.map((hotkey) => (
        <DefinitionItem {...hotkey} key={hotkey.label} />
      ))}
    </Box>
  );
};

type WizardLayoutProps = {
  version?: string;
  logo?: string;
  startupMessages?: StartupMessage[];
  children: React.ReactNode;
};

const STEP_DROPDOWN_LABEL: Partial<Record<WizardStep, string>> = {
  stack: "Choose a stack",
  domains: "Select domains",
  sources: "Customize skill sources",
  agents: "Select agents",
};

function resolveDropdownLabel(
  step: WizardStep,
  selectedStackId: string | null,
): string | undefined {
  if (step === "confirm") {
    const stackName = getStackName(selectedStackId);
    return stackName ? `Ready to install ${stackName}` : "Ready to install your custom stack";
  }
  return STEP_DROPDOWN_LABEL[step];
}

export const WizardLayout: React.FC<WizardLayoutProps> = ({ version, logo, children }) => {
  const store = useWizardStore();
  const { completedSteps, skippedSteps } = store.getStepProgress();
  const { rows: terminalHeight } = useTerminalDimensions();

  const handleSelectDomain = (domain: Domain) => {
    const index = store.selectedDomains.indexOf(domain);
    if (index !== -1) {
      useWizardStore.getState().setCurrentDomainIndex(index);
    }
  };

  const domainNav: DomainNavProps | undefined =
    store.step === "build" && store.selectedDomains.length > 0
      ? {
          domains: orderDomains(store.selectedDomains),
          activeDomain: store.getCurrentDomain() || store.selectedDomains[0] || FALLBACK_DOMAIN,
          getDomainLabel: getDomainDisplayName,
          onSelectDomain: handleSelectDomain,
        }
      : undefined;

  const dropdownLabel = resolveDropdownLabel(store.step, store.selectedStackId);
  const dropdowns: Partial<Record<WizardStep, TabDropdownProps>> = dropdownLabel
    ? { [store.step]: { items: [{ id: dropdownLabel, label: dropdownLabel }] } }
    : {};

  return (
    <Box flexDirection="column" paddingX={1} height={terminalHeight}>
      {logo && store.step === "stack" && (
        <Box flexDirection="row" marginTop={1} columnGap={1}>
          <Text>{logo}</Text>
        </Box>
      )}
      <WizardTabs
        steps={WIZARD_STEPS}
        currentStep={store.step}
        completedSteps={completedSteps}
        skippedSteps={skippedSteps}
        version={version}
        domainNav={domainNav}
        dropdowns={dropdowns}
      />
      {FEATURE_FLAGS.INFO_PANEL && store.showInfo ? (
        <>
          <Box flexDirection="column" flexGrow={1} flexBasis={0} marginTop={1}>
            <InfoPanel />
          </Box>
          <WizardFooter />
        </>
      ) : (
        <>
          <Box flexDirection="column" flexGrow={1} flexBasis={0} marginTop={1}>
            {children}
          </Box>
          <Box paddingX={1} columnGap={2} marginTop={2}>
            <DefinitionItem
              label="Labels"
              values={[HOTKEY_TOGGLE_LABELS.label]}
              isVisible={store.step === "build"}
            />
            <DefinitionItem
              label="Filter incompatible"
              values={[HOTKEY_FILTER_INCOMPATIBLE.label]}
              isVisible={store.step === "build"}
              isActive={store.filterIncompatible}
            />
            <DefinitionItem
              label="Scope"
              values={[HOTKEY_SCOPE.label]}
              isVisible={
                (store.step === "build" || store.step === "agents") &&
                !store.isEditingFromGlobalScope
              }
            />
            <DefinitionItem
              label="Set all local"
              values={[HOTKEY_SET_ALL_LOCAL.label]}
              isVisible={store.step === "sources"}
            />
            <DefinitionItem
              label="Set all plugin"
              values={[HOTKEY_SET_ALL_PLUGIN.label]}
              isVisible={store.step === "sources"}
            />
            <DefinitionItem
              label="Settings"
              values={[HOTKEY_SETTINGS.label]}
              isVisible={store.step === "sources" && FEATURE_FLAGS.SOURCE_SEARCH}
              isActive={store.showSettings}
            />
            <DefinitionItem
              label="Info"
              values={[HOTKEY_INFO.label]}
              isVisible={FEATURE_FLAGS.INFO_PANEL}
            />
          </Box>
          <WizardFooter />
          {store.toastMessage && (
            <Box position="absolute" marginTop={terminalHeight - 4}>
              <Toast>{store.toastMessage}</Toast>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
