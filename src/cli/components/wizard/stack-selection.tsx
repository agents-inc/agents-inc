import { Box, Text, useInput } from "ink";
import React, { useMemo, useState } from "react";
import { CLI_COLORS, DEFAULT_SCRATCH_DOMAINS, UI_SYMBOLS } from "../../consts.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useRowScroll } from "../hooks/use-row-scroll.js";

import type { AgentName } from "../../types/index.js";
import { typedKeys } from "../../utils/typed-object.js";

type StackItem = { id: string; name: string; description: string };
type StackGroup = { label: string; items: StackItem[] };
type FocusId = string | "scratch";

const OTHER_FRAMEWORKS_LABEL = "Other Frameworks";
const GROUP_ORDER: string[] = ["React", "CLI"];
const SCRATCH_LABEL = "Start from scratch";
const SCRATCH_DESCRIPTION = "Select domains and skills manually";

function groupStacks(
  stacks: { id: string; name: string; description: string; group?: string }[],
): StackGroup[] {
  const grouped = new Map<string, StackItem[]>();
  const ungrouped: StackItem[] = [];

  for (const stack of stacks) {
    const item: StackItem = { id: stack.id, name: stack.name, description: stack.description };
    if (stack.group) {
      const items = grouped.get(stack.group);
      if (items) {
        items.push(item);
      } else {
        grouped.set(stack.group, [item]);
      }
    } else {
      ungrouped.push(item);
    }
  }

  // No explicit groups — flat list, no headers
  if (grouped.size === 0) {
    return [{ label: "", items: ungrouped }];
  }

  const groups: StackGroup[] = [];
  const sortedLabels = [...grouped.keys()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  for (const label of sortedLabels) {
    groups.push({ label, items: grouped.get(label)! });
  }
  if (ungrouped.length > 0) {
    groups.push({ label: OTHER_FRAMEWORKS_LABEL, items: ungrouped });
  }
  return groups;
}

function buildFocusableIds(groups: StackGroup[]): FocusId[] {
  return [...groups.flatMap((g) => g.items.map((i) => i.id)), "scratch"];
}

/** Renders a section header + stack items. Focus state is managed by the parent. */
const StackSection: React.FC<{
  title: string;
  items: StackItem[];
  focusedId: FocusId;
}> = ({ title, items, focusedId }) => (
  <Box flexDirection="column">
    {title !== "" && (
      <Box flexShrink={0}>
        <Text dimColor bold>
          {"  "}
          {title}
        </Text>
      </Box>
    )}
    {items.map((item) => {
      const isFocused = item.id === focusedId;
      const pointer = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;
      return (
        <Box key={item.id} flexShrink={0}>
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
    })}
  </Box>
);

export type StackSelectionProps = {
  /** Available height in terminal lines for the scrollable viewport. 0 = no constraint. */
  availableHeight?: number;
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
  const focusableIds = useMemo(() => buildFocusableIds(groups), [groups]);

  const [focusedId, setFocusedId] = useState<FocusId>(focusableIds[0] ?? "scratch");
  const { ref: listRef, measuredHeight: listHeight } = useMeasuredHeight();

  // Compute visual row counts for scroll: header + items per group, spacers between groups, spacer + scratch row
  const totalRowCount = useMemo(() => {
    const groupRows = groups.reduce(
      (sum, g, i) =>
        sum +
        (g.label ? 1 : 0) /* header (skip when unlabelled) */ +
        g.items.length +
        (i > 0 ? 1 : 0) /* spacer between groups */,
      0,
    );
    return groupRows + 1 /* spacer before scratch */ + 1 /* scratch row */;
  }, [groups]);

  // Map focusedId to a visual row index for scrolling
  const focusedVisualRow = useMemo(() => {
    let row = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      if (gi > 0) row++; // spacer between groups
      if (groups[gi].label) row++; // header (skip when unlabelled)
      for (const item of groups[gi].items) {
        if (item.id === focusedId) return row;
        row++;
      }
    }
    row++; // spacer before scratch
    return row; // scratch row
  }, [groups, focusedId]);

  const { scrollEnabled, scrollTop } = useRowScroll({
    focusedIndex: focusedVisualRow,
    itemCount: totalRowCount,
    availableHeight: listHeight,
  });

  useInput((input, key) => {
    if (key.escape) {
      if (onCancel) {
        onCancel();
      }
      return;
    }

    const currentIdx = focusableIds.indexOf(focusedId);

    if (key.upArrow || input === "k") {
      const nextIdx = currentIdx <= 0 ? focusableIds.length - 1 : currentIdx - 1;
      setFocusedId(focusableIds[nextIdx]!);
      return;
    }
    if (key.downArrow || input === "j") {
      const nextIdx = currentIdx >= focusableIds.length - 1 ? 0 : currentIdx + 1;
      setFocusedId(focusableIds[nextIdx]!);
      return;
    }

    if (key.return) {
      if (focusedId === "scratch") {
        selectStack(null);
        setApproach("scratch");

        // Restore global agent preselections (selectStack wipes selectedAgents/agentConfigs)
        const globalAgentPre = useWizardStore.getState().globalAgentPreselections;
        if (globalAgentPre) {
          useWizardStore.setState({
            selectedAgents: globalAgentPre.agents,
            agentConfigs: globalAgentPre.configs,
          });
        }

        // Pre-select global skills first (sets selectedDomains to global skill domains)
        const globalPreselections = useWizardStore.getState().globalPreselections;
        if (globalPreselections?.length) {
          populateFromSkillIds(
            globalPreselections.map((s) => s.id),
            globalPreselections,
          );
        }

        // Then toggle scratch domains (additive — adds any not already selected)
        for (const domain of DEFAULT_SCRATCH_DOMAINS) {
          if (!useWizardStore.getState().selectedDomains.includes(domain)) {
            toggleDomain(domain);
          }
        }

        setStep("domains");
        return;
      }
      const focusedStack = stacks.find((s) => s.id === focusedId);
      if (focusedStack) {
        selectStack(focusedStack.id);
        setStackAction("customize");

        // Derive agent preselection from stack agent keys, merged with global agent preselections
        const stackAgents = typedKeys<AgentName>(focusedStack.skills);
        preselectAgentsFromStack(stackAgents);

        // Merge global preselections with stack skills
        const globalPreselections = useWizardStore.getState().globalPreselections;
        const globalIds = globalPreselections?.map((s) => s.id) ?? [];
        const mergedIds = [...new Set([...focusedStack.allSkillIds, ...globalIds])];
        populateFromSkillIds(mergedIds, globalPreselections ?? undefined);

        setApproach("stack");
        setStep("domains");
      }
    }
  });

  const isScratchFocused = focusedId === "scratch";
  const scratchPointer = isScratchFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;

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
          {groups.map((group, gi) => (
            <React.Fragment key={group.label}>
              {gi > 0 && (
                <Box flexShrink={0}>
                  <Text> </Text>
                </Box>
              )}
              <StackSection title={group.label} items={group.items} focusedId={focusedId} />
            </React.Fragment>
          ))}

          <Box key="scratch-spacer" flexShrink={0}>
            <Text> </Text>
          </Box>
          <Box key="scratch" flexShrink={0}>
            <Text>
              <Text color={isScratchFocused ? CLI_COLORS.PRIMARY : undefined}>
                {scratchPointer}
              </Text>
              <Text
                color={isScratchFocused ? CLI_COLORS.PRIMARY : undefined}
                bold={isScratchFocused}
              >
                {" "}
                {SCRATCH_LABEL}
              </Text>
              <Text dimColor>
                {"  "}
                {SCRATCH_DESCRIPTION}
              </Text>
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
