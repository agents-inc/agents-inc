import { Box, Text } from "ink";
import React, { Fragment } from "react";
import { CLI_COLORS, FALLBACK_DOMAIN, LOGO_MIN_TERMINAL_ROWS } from "../../consts.js";
import type { StartupMessage } from "../../utils/logger.js";
import { formatTerminalTooSmallMessage, isTerminalLargeEnough } from "../../utils/terminal.js";
import { getActiveStepFlow, useWizardStore, type WizardStep } from "../../stores/wizard-store.js";
import { useTerminalDimensions } from "../hooks/use-terminal-dimensions.js";
import { SummaryPanel } from "./summary-panel.js";
import { Toast } from "./toast.js";
import {
  HOTKEY_INFO,
  HOTKEY_SCOPE,
  HOTKEY_TOGGLE_LABELS,
  KEY_LABEL_ENTER,
  KEY_LABEL_ESC,
  KEY_LABEL_SPACE,
  isInfoPanelAvailable,
} from "./hotkeys.js";
import {
  WizardTabs,
  wizardTabsFor,
  type DomainNavProps,
  type TabDropdownProps,
} from "./wizard-tabs.js";
import { getDomainDisplayName, getStackName, orderDomains } from "./utils.js";

type KeyHintProps = {
  isVisible?: boolean;
  label: string;
  values: readonly string[];
};

const DefinitionItem: React.FC<KeyHintProps> = ({ isVisible = true, label, values }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Text>
      {values.map((value) => (
        <Fragment key={value}>
          <Text backgroundColor={CLI_COLORS.LABEL_BG} color={CLI_COLORS.UNFOCUSED}>
            {" "}
            {value}{" "}
          </Text>{" "}
        </Fragment>
      ))}
      <Text>{label}</Text>
    </Text>
  );
};

const HOT_KEYS = [
  { label: "select", values: [KEY_LABEL_SPACE] },
  { label: "continue", values: [KEY_LABEL_ENTER] },
  { label: "back", values: [KEY_LABEL_ESC] },
] as const satisfies readonly { label: string; values: readonly string[] }[];

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
  version?: string | undefined;
  logo?: string | undefined;
  startupMessages?: StartupMessage[] | undefined;
  children: React.ReactNode;
};

/**
 * How many buffered messages the band paints before it counts the rest instead.
 * A source that cannot resolve its own relationships warns once per unresolved
 * name — thousands, for a source with a broken `skill-rules.ts` — and every line
 * is a row taken from the step below it.
 *
 * Two budgets, because a row is worth more at some heights than others: a
 * terminal short enough that the logo is already dropped for starving the
 * content cannot spare four rows for news either, and there it paints the first
 * message and counts the rest. The first is the one that matters — the fetch
 * speaks before anything is parsed, so an unreachable source is message one.
 */
const MAX_PAINTED_STARTUP_MESSAGES = 3;
const MAX_PAINTED_STARTUP_MESSAGES_CRAMPED = 1;

function paintedStartupMessageCount(terminalHeight: number): number {
  return terminalHeight >= LOGO_MIN_TERMINAL_ROWS
    ? MAX_PAINTED_STARTUP_MESSAGES
    : MAX_PAINTED_STARTUP_MESSAGES_CRAMPED;
}

const STARTUP_MESSAGE_COLOR = {
  info: CLI_COLORS.NEUTRAL,
  warn: CLI_COLORS.WARNING,
  error: CLI_COLORS.ERROR,
} as const satisfies Record<StartupMessage["level"], string>;

/**
 * What the load said before Ink took the terminal.
 *
 * `warn()` writes to stderr, which the wizard's own `clearTerminal` would wipe,
 * so a load that opens a wizard buffers instead (`lib/operations/source/load-source.ts`)
 * and hands the buffer here. This band is the only place those lines are ever
 * seen — the source-unreachable warning among them.
 *
 * It sits above the step rather than over it, and does not shrink: a warning
 * compressed by Yoga overprints into an unreadable row, which is worse than the
 * row it would have cost the step.
 */
const StartupMessages: React.FC<{ messages: StartupMessage[]; terminalHeight: number }> = ({
  messages,
  terminalHeight,
}) => {
  if (messages.length === 0) return null;

  const painted = messages.slice(0, paintedStartupMessageCount(terminalHeight));
  const counted = messages.length - painted.length;

  return (
    <Box flexDirection="column" flexShrink={0} paddingX={1}>
      {painted.map((message, index) => (
        <Text key={index} color={STARTUP_MESSAGE_COLOR[message.level]}>
          {message.text}
        </Text>
      ))}
      {counted > 0 && <Text color={CLI_COLORS.NEUTRAL}>{`... and ${counted} more`}</Text>}
    </Box>
  );
};

/**
 * The subtitle each step is headed with. Every entry is A SCREEN SENTINEL:
 * `e2e/pages/constants.ts` `STEP_TEXT` duplicates each one exactly and every E2E step
 * page object waits on it, so a subtitle that moves without it hangs each wizard spec for
 * the full wizard-load budget instead of failing. `wizard-layout.test.tsx` catches a
 * PRODUCT-side move in under a second and cannot see a mirror-side one;
 * `scripts/check-screen-sentinels.ts` compares the two literals directly, which is the
 * half that was missing. Its wording mirrors the step's tab in `wizard-tabs.tsx`.
 */
const STEP_DROPDOWN_LABEL: Partial<Record<WizardStep, string>> = {
  stack: "Choose a stack",
  domains: "Select domains",
  sources: "Customize skill sources",
  agents: "Select agents",
};

/**
 * What the wizard paints instead of itself while the terminal is below
 * `MIN_TERMINAL_SIZE` (consts.ts). It REPLACES the wizard tree rather than
 * covering it: Ink lays a still-mounted tree out at the small size regardless of
 * what is drawn on top, so an overlay leaves the squeezed content bleeding
 * underneath.
 */
const TerminalTooSmall: React.FC<{ columns: number }> = ({ columns }) => (
  <Box paddingX={1} paddingY={1}>
    <Text color={CLI_COLORS.WARNING}>{formatTerminalTooSmallMessage(columns)}</Text>
  </Box>
);

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

export const WizardLayout: React.FC<WizardLayoutProps> = ({
  version,
  logo,
  startupMessages = [],
  children,
}) => {
  const store = useWizardStore();
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalDimensions();

  // The startup gate cannot catch a terminal that shrinks after launch, and
  // `useTerminalDimensions` already re-renders on resize — so the same check
  // lives here, on the value that hook returns.
  if (!isTerminalLargeEnough(terminalWidth, terminalHeight)) {
    return <TerminalTooSmall columns={terminalWidth} />;
  }

  const { completedSteps, skippedSteps } = store.getStepProgress();

  const domainNav: DomainNavProps | undefined =
    store.step === "build" && store.selectedDomains.length > 0
      ? {
          domains: orderDomains(store.selectedDomains),
          activeDomain: store.getCurrentDomain() || store.selectedDomains[0] || FALLBACK_DOMAIN,
          getDomainLabel: getDomainDisplayName,
        }
      : undefined;

  // The logo is decoration; the stack list is the content. Below the threshold
  // its six rows starve that list's viewport until the shared scroll gate stops
  // clipping and the rows bleed over the footer.
  const terminalHasRoomForLogo = terminalHeight >= LOGO_MIN_TERMINAL_ROWS;
  const shouldRenderLogo = !!logo && store.step === "stack" && terminalHasRoomForLogo;

  const dropdownLabel = resolveDropdownLabel(store.step, store.selectedStackId);
  const dropdowns: Partial<Record<WizardStep, TabDropdownProps>> = dropdownLabel
    ? { [store.step]: { items: [{ id: dropdownLabel, label: dropdownLabel }] } }
    : {};

  return (
    <Box flexDirection="column" paddingX={1} height={terminalHeight}>
      {shouldRenderLogo && (
        <Box flexDirection="row" marginTop={1} columnGap={1}>
          <Text>{logo}</Text>
        </Box>
      )}
      <WizardTabs
        steps={wizardTabsFor(getActiveStepFlow())}
        currentStep={store.step}
        completedSteps={completedSteps}
        skippedSteps={skippedSteps}
        version={version}
        domainNav={domainNav}
        dropdowns={dropdowns}
      />
      <StartupMessages messages={startupMessages} terminalHeight={terminalHeight} />
      {store.showInfo ? (
        <>
          <Box flexDirection="column" flexGrow={1} flexBasis={0} marginTop={1}>
            <SummaryPanel />
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
              label="Scope"
              values={[HOTKEY_SCOPE.label]}
              isVisible={
                (store.step === "build" || store.step === "agents") &&
                !store.isEditingFromGlobalScope
              }
            />
            <DefinitionItem
              label="Info"
              values={[HOTKEY_INFO.label]}
              isVisible={isInfoPanelAvailable(store.step)}
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
