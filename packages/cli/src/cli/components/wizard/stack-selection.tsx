import { groupBy } from "remeda";
import { useKeyboardNavigation } from "../hooks/use-keyboard-navigation.js";
import { Box, Text } from "ink";
import React, { useMemo } from "react";
import { CLI_COLORS, DEFAULT_SCRATCH_DOMAINS, UI_SYMBOLS } from "../../consts.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useRowScroll } from "../hooks/use-row-scroll.js";

import type { AgentName, ResolvedStack } from "../../types/index.js";
import { typedKeys } from "../../utils/typed-object.js";

type StackItem = Pick<ResolvedStack, "id" | "name" | "description">;
type StackGroup = { label: string; items: StackItem[] };
/** A focusable row id: a stack id, or the "scratch" sentinel for the "Start from scratch" row. */
type FocusId = string;

const OTHER_FRAMEWORKS_LABEL = "Other Frameworks";
const GROUP_ORDER: string[] = ["React", "CLI"];
const SCRATCH_LABEL = "Start from scratch";
const SCRATCH_DESCRIPTION = "Select domains and skills manually";

type GroupableStack = Pick<ResolvedStack, "id" | "name" | "description" | "group">;

function toStackItem(stack: GroupableStack): StackItem {
  return { id: stack.id, name: stack.name, description: stack.description };
}

/** GROUP_ORDER labels first (in order), then unknown labels alphabetically. */
function compareGroupLabels(a: string, b: string): number {
  const ai = GROUP_ORDER.indexOf(a);
  const bi = GROUP_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

function groupStacks(stacks: GroupableStack[]): StackGroup[] {
  // `|| undefined` keeps an empty-string group ungrouped; groupBy drops undefined keys.
  const byLabel = groupBy(stacks, (stack) => stack.group || undefined);
  const ungrouped = stacks.filter((stack) => !stack.group).map(toStackItem);

  // No explicit groups — flat list, no headers
  const sortedLabels = Object.keys(byLabel).sort(compareGroupLabels);
  if (sortedLabels.length === 0) {
    return [{ label: "", items: ungrouped }];
  }

  const groups = sortedLabels.map((label) => ({
    label,
    items: byLabel[label].map(toStackItem),
  }));
  return ungrouped.length > 0
    ? [...groups, { label: OTHER_FRAMEWORKS_LABEL, items: ungrouped }]
    : groups;
}

function buildFocusableIds(groups: StackGroup[]): FocusId[] {
  return [...groups.flatMap((g) => g.items.map((i) => i.id)), "scratch"];
}

type StackListRow =
  | { type: "header"; label: string }
  | { type: "spacer" }
  | { type: "stack"; item: StackItem }
  | { type: "scratch" };

/** One row per rendered line — headers, spacers, stack items, then the scratch row. */
function buildStackRows(groups: StackGroup[]): StackListRow[] {
  const groupRows = groups.flatMap((group, groupIndex): StackListRow[] => [
    ...(groupIndex > 0 ? [{ type: "spacer" as const }] : []),
    ...(group.label ? [{ type: "header" as const, label: group.label }] : []),
    ...group.items.map((item): StackListRow => ({ type: "stack", item })),
  ]);
  return [...groupRows, { type: "spacer" }, { type: "scratch" }];
}

function isRowFocused(row: StackListRow, focusedId: FocusId): boolean {
  if (row.type === "stack") return row.item.id === focusedId;
  return row.type === "scratch" && focusedId === "scratch";
}

const StackRow: React.FC<{ item: StackItem; isFocused: boolean }> = ({ item, isFocused }) => {
  const pointer = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;
  return (
    <Box flexShrink={0}>
      <Text>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined}>{pointer}</Text>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined} bold={isFocused}>
          {" "}
          {item.name}
        </Text>
        <Text dimColor>
          {"  "}
          {item.description}
        </Text>
      </Text>
    </Box>
  );
};

const ScratchRow: React.FC<{ isFocused: boolean }> = ({ isFocused }) => {
  const pointer = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;
  return (
    <Box flexShrink={0}>
      <Text>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined}>{pointer}</Text>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined} bold={isFocused}>
          {" "}
          {SCRATCH_LABEL}
        </Text>
        <Text dimColor>
          {"  "}
          {SCRATCH_DESCRIPTION}
        </Text>
      </Text>
    </Box>
  );
};

export type StackSelectionProps = {
  onCancel?: () => void;
};

export const StackSelection: React.FC<StackSelectionProps> = ({ onCancel }) => {
  const {
    selectStack,
    setApproach,
    setStackAction,
    populateFromSkillIds,
    preselectAgentsFromStack,
    toggleDomain,
    setStep,
  } = useWizardStore();

  const stacks = matrix.suggestedStacks;
  const groups = useMemo(() => groupStacks(stacks), [stacks]);
  const rows = useMemo(() => buildStackRows(groups), [groups]);
  const focusableIds = useMemo(() => buildFocusableIds(groups), [groups]);

  const { focusedIndex } = useKeyboardNavigation(focusableIds.length, {
    onEscape: onCancel,
    onEnter: (index) => handleSelect(focusableIds[index] ?? "scratch"),
  });
  const focusedId: FocusId = focusableIds[focusedIndex] ?? "scratch";
  const { ref: listRef, measuredHeight: listHeight } = useMeasuredHeight();

  const focusedVisualRow = useMemo(
    () => rows.findIndex((row) => isRowFocused(row, focusedId)),
    [rows, focusedId],
  );

  const { scrollEnabled, scrollTop } = useRowScroll({
    focusedIndex: focusedVisualRow,
    itemCount: rows.length,
    availableHeight: listHeight,
  });

  // Restore global agent preselections (selectStack wipes selectedAgents/agentConfigs).
  function restoreGlobalAgentPreselections(): void {
    const globalAgentPre = useWizardStore.getState().globalAgentPreselections;
    if (globalAgentPre) {
      useWizardStore.setState({
        selectedAgents: globalAgentPre.agents,
        agentConfigs: globalAgentPre.configs,
      });
    }
  }

  // Pre-select global skills (sets selectedDomains to the global skills' domains).
  function preselectGlobalSkills(): void {
    const globalPreselections = useWizardStore.getState().globalPreselections;
    if (globalPreselections?.length) {
      populateFromSkillIds(
        globalPreselections.map((s) => s.id),
        globalPreselections,
      );
    }
  }

  // Additive — adds any scratch domain not already selected.
  function addScratchDomains(): void {
    for (const domain of DEFAULT_SCRATCH_DOMAINS) {
      if (!useWizardStore.getState().selectedDomains.includes(domain)) {
        toggleDomain(domain);
      }
    }
  }

  function startFromScratch(): void {
    selectStack(null);
    setApproach("scratch");
    restoreGlobalAgentPreselections();
    preselectGlobalSkills();
    addScratchDomains();
    setStep("domains");
  }

  // The stack's own skills merged with the global preselections, and its agent
  // keys merged with the global agent preselections.
  function applyStack(stack: ResolvedStack): void {
    selectStack(stack.id);
    setStackAction("customize");

    const stackAgents = typedKeys<AgentName>(stack.skills);
    preselectAgentsFromStack(stackAgents);

    const globalPreselections = useWizardStore.getState().globalPreselections;
    const globalIds = globalPreselections?.map((s) => s.id) ?? [];
    const mergedIds = [...new Set([...stack.allSkillIds, ...globalIds])];
    populateFromSkillIds(mergedIds, globalPreselections ?? undefined);

    setApproach("stack");
    setStep("domains");
  }

  function handleSelect(selectedId: FocusId): void {
    if (selectedId === "scratch") {
      startFromScratch();
      return;
    }

    const focusedStack = stacks.find((s) => s.id === selectedId);
    if (focusedStack) applyStack(focusedStack);
  }

  return (
    <Box ref={listRef} flexDirection="column" flexGrow={1} flexBasis={0}>
      <Box
        flexDirection="column"
        flexGrow={1}
        {...(scrollEnabled && { overflow: "hidden" as const })}
      >
        <Box
          flexDirection="column"
          marginTop={scrollTop > 0 ? -scrollTop : 0}
          {...(scrollEnabled && { flexShrink: 0 })}
        >
          {rows.map((row, index) => {
            switch (row.type) {
              case "spacer":
                return (
                  <Box key={`spacer-${index}`} flexShrink={0}>
                    <Text> </Text>
                  </Box>
                );
              case "header":
                return (
                  <Box key={`header-${row.label}`} flexShrink={0}>
                    <Text dimColor bold>
                      {"  "}
                      {row.label}
                    </Text>
                  </Box>
                );
              case "stack":
                return (
                  <StackRow
                    key={row.item.id}
                    item={row.item}
                    isFocused={row.item.id === focusedId}
                  />
                );
              case "scratch":
                return <ScratchRow key="scratch" isFocused={focusedId === "scratch"} />;
              default: {
                const _exhaustive: never = row;
                return _exhaustive;
              }
            }
          })}
        </Box>
      </Box>
    </Box>
  );
};
