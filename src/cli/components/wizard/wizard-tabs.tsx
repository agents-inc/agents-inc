import { Box, Text, useInput } from "ink";
import React from "react";
import { CLI_COLORS } from "../../consts.js";
import type { WizardStep } from "../../stores/wizard-store.js";
import type { Domain } from "../../types/index.js";

type WizardTabStep = {
  id: WizardStep;
  label: string;
};

export type TabDropdownItem = {
  id: string;
  label: string;
};

export type TabDropdownProps = {
  items: TabDropdownItem[];
  activeId?: string;
  isSubNav?: boolean;
  inline?: boolean;
};

export type DomainNavProps = {
  domains: Domain[];
  activeDomain: Domain;
  getDomainLabel: (domain: Domain) => string;
  onSelectDomain?: (domain: Domain) => void;
};

export type WizardTabsProps = {
  steps: WizardTabStep[];
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  skippedSteps?: WizardStep[];
  version?: string;
  domainNav?: DomainNavProps;
  dropdowns?: Partial<Record<WizardStep, TabDropdownProps>>;
};

export const WIZARD_STEPS: WizardTabStep[] = [
  { id: "stack", label: "Stack" },
  { id: "domains", label: "Domains" },
  { id: "build", label: "Skills" },
  { id: "sources", label: "Sources" },
  { id: "agents", label: "Agents" },
  { id: "confirm", label: "Confirm" },
];

type FormattedStepLabel = {
  /** The step label text, e.g. "Stack" */
  label: string;
  /** The complete formatted string, e.g. "Stack" */
  full: string;
};

/** Format a wizard step as its tab label */
export function formatStepLabel(stepId: WizardStep): FormattedStepLabel {
  const step = WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) return { label: stepId, full: stepId };
  return { label: step.label, full: step.label };
}

type StepState = "completed" | "current" | "pending" | "skipped";

const getStepState = (
  stepId: WizardStep,
  currentStep: WizardStep,
  completedSteps: WizardStep[],
  skippedSteps: WizardStep[],
): StepState => {
  if (completedSteps.includes(stepId)) return "completed";
  if (stepId === currentStep) return "current";
  if (skippedSteps.includes(stepId)) return "skipped";
  return "pending";
};

type TabProps = {
  step: WizardTabStep;
  state: StepState;
};

const Tab: React.FC<TabProps> = ({ step, state }) => {
  const label = step.label;

  switch (state) {
    case "current":
      return (
        <Text color={CLI_COLORS.BLACK} backgroundColor={CLI_COLORS.WARNING} bold>
          {" "}
          {label}{" "}
        </Text>
      );
    case "completed":
      return <Text>{label}</Text>;
    case "skipped":
      return <Text dimColor>{label}</Text>;
    case "pending":
    default:
      return <Text color={CLI_COLORS.UNFOCUSED}>{label}</Text>;
  }
};

const TabDropdown: React.FC<TabDropdownProps> = ({ items, activeId, isSubNav, inline }) => (
  <Box
    {...(inline ? {} : { position: "absolute" as const, marginTop: 2 })}
    flexDirection="row"
    columnGap={0}
    paddingLeft={1}
    paddingRight={1}
    borderStyle="single"
    borderColor="blackBright"
    flexWrap="wrap"
  >
    {items.map((item) => {
      const isActive = item.id === activeId;
      return (
        <Text
          key={item.id}
          dimColor={!isSubNav}
          bold={isSubNav && isActive}
          color={isActive ? CLI_COLORS.WARNING : CLI_COLORS.UNFOCUSED}
        >
          {" "}
          {item.label}{" "}
        </Text>
      );
    })}
  </Box>
);

const DomainNav: React.FC<DomainNavProps & { inline?: boolean }> = ({
  domains,
  activeDomain,
  getDomainLabel,
  inline,
}) => (
  <TabDropdown
    items={domains.map((d) => ({ id: d, label: getDomainLabel(d) }))}
    activeId={activeDomain}
    isSubNav
    inline={inline}
  />
);

const DOMAIN_NAV_CHAR_THRESHOLD = 25;

const getStepJustifyContent = (stepId: WizardStep): "flex-start" | "flex-end" | "center" => {
  if (stepId === "stack") return "flex-start";
  if (stepId === "confirm") return "flex-end";
  return "center";
};

const isDomainNavOverThreshold = (domainNav: DomainNavProps): boolean =>
  domainNav.domains.reduce((sum, d) => sum + domainNav.getDomainLabel(d).length, 0) >
  DOMAIN_NAV_CHAR_THRESHOLD;

export const WizardTabs: React.FC<WizardTabsProps> = ({
  steps,
  currentStep,
  completedSteps,
  skippedSteps = [],
  version,
  domainNav,
  dropdowns,
}) => {
  const shouldHoistDomainNav = domainNav ? isDomainNavOverThreshold(domainNav) : false;

  return (
    <>
      <Box
        flexDirection="row"
        columnGap={2}
        borderColor="blackBright"
        borderStyle="single"
        paddingX={1}
        alignItems="center"
        marginBottom={shouldHoistDomainNav ? 0 : 3}
      >
        {steps.map((step) => {
          const state = getStepState(step.id, currentStep, completedSteps, skippedSteps);

          if (step.id === "build" && domainNav && !shouldHoistDomainNav) {
            return (
              <Box
                key={step.id}
                position="relative"
                display="flex"
                justifyContent={getStepJustifyContent(step.id)}
              >
                <Tab step={step} state={state} />
                <DomainNav {...domainNav} />
              </Box>
            );
          }

          // Generic dropdown for any step
          const dropdown = dropdowns?.[step.id];
          if (dropdown) {
            return (
              <Box
                key={step.id}
                position="relative"
                display="flex"
                justifyContent={getStepJustifyContent(step.id)}
              >
                <Tab step={step} state={state} />
                <TabDropdown {...dropdown} />
              </Box>
            );
          }

          return <Tab key={step.id} step={step} state={state} />;
        })}
        <Box flexGrow={1} justifyContent="flex-end">
          <Text dimColor>{`v${version}`}</Text>
        </Box>
      </Box>
      {domainNav && shouldHoistDomainNav && (
        <Box>
          <DomainNav {...domainNav} inline />
        </Box>
      )}
    </>
  );
};
