import { groupBy, unique } from "remeda";
import { Box, Text, useInput } from "ink";
import {
  BUILT_IN_AGENT_GROUPS,
  BUILT_IN_AGENT_IDS,
  deriveScopeBadges,
  formatScopeTag,
} from "../../lib/wizard/index.js";
import type { AgentGroup, AgentItem } from "../../lib/wizard/index.js";
import React, { useMemo, useState } from "react";
import { CLI_COLORS, UI_SYMBOLS } from "../../consts.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import type { AgentName, MergedSkillsMatrix } from "../../types/index.js";
import { isAgentName } from "../../utils/type-guards.js";
import { typedKeys } from "../../utils/typed-object.js";
import { toTitleCase } from "../../utils/string.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useRowScroll } from "../hooks/use-row-scroll.js";
import { KEY_SPACE } from "./hotkeys.js";
import { getDomainDisplayName } from "./utils.js";

type FocusId = AgentName | "continue";

type ListRow =
  { type: "header"; label: string } | { type: "spacer" } | { type: "agent"; agent: AgentItem };

/**
 * The sub-agents a loaded source's stacks name, as the strings a stack file spells them.
 *
 * `typedKeys` types them `AgentName` because `ResolvedStack.skills` is keyed by it, but the keys
 * arrive from a marketplace's own YAML and nothing between there and here narrows them — which
 * is exactly the claim the filter below has to test.
 */
function agentIdsNamedByStacks(matrix: MergedSkillsMatrix): string[] {
  return unique(matrix.suggestedStacks.flatMap((stack) => typedKeys(stack.skills)));
}

/**
 * The rows a loaded source adds to the built-in grid.
 *
 * Narrowed with `isAgentName` and deliberately NOT cast to it. A row here is a name the user can
 * put into `config.agents`, and only the CLI's own `src/agents/` declares a sub-agent a compile
 * pass can honour — that directory is the whole of the roster (owner ruling 2026-08-21) and is
 * what `AGENT_NAMES` is generated from. So a stack naming an agent the CLI does not ship
 * contributes nothing: offering it a row wrote a name that reached `AgentName`,
 * `SelectedAgentName` and `ProjectAgentName` alike and then left `compile` with no definition to
 * compile.
 */
function selectableSourceAgents(matrix: MergedSkillsMatrix): AgentName[] {
  return agentIdsNamedByStacks(matrix)
    .filter(isAgentName)
    .filter((agentName) => !BUILT_IN_AGENT_IDS.has(agentName));
}

function buildAgentGroups(matrix: MergedSkillsMatrix): AgentGroup[] {
  const customAgentIds = selectableSourceAgents(matrix);

  if (customAgentIds.length === 0) return BUILT_IN_AGENT_GROUPS;

  // Group custom agents by explicit domain (from metadata.yaml) or kebab prefix fallback
  const customItems = customAgentIds.map((agentId) => {
    const explicitDomain = matrix.agentDefinedDomains?.[agentId];
    const domainKey = explicitDomain ?? (agentId.split("-")[0] || "custom");
    return {
      groupLabel: getDomainDisplayName(domainKey),
      item: {
        id: agentId,
        label: toTitleCase(agentId),
        description: "Custom agent",
      },
    };
  });
  const customGroups: AgentGroup[] = Object.entries(groupBy(customItems, (c) => c.groupLabel)).map(
    ([label, entries]) => ({ label, items: entries.map((entry) => entry.item) }),
  );

  return [...BUILT_IN_AGENT_GROUPS, ...customGroups];
}

function buildFlatRows(groups: AgentGroup[]): ListRow[] {
  return groups.flatMap((group, groupIndex): ListRow[] => [
    ...(groupIndex > 0 ? [{ type: "spacer" as const }] : []),
    { type: "header" as const, label: group.label },
    ...group.items.map((agent): ListRow => ({ type: "agent", agent })),
  ]);
}

function buildFocusableIds(groups: AgentGroup[]): FocusId[] {
  return [...groups.flatMap((group) => group.items.map((a) => a.id)), "continue"];
}

/**
 * Asserting row lookup. `buildFocusableIds` always appends "continue", so the
 * list is never empty and every caller below wraps within it — a miss means the
 * wrap arithmetic is wrong, which is worth a diagnostic rather than a focus that
 * silently stops moving.
 */
function focusableIdAt(ids: FocusId[], index: number): FocusId {
  const id = ids[index];
  if (id === undefined) throw new Error(`No focusable row at index ${index} of ${ids.length}`);
  return id;
}

export const StepAgents: React.FC = () => {
  const selectedAgents = useWizardStore((s) => s.selectedAgents);
  const agentConfigs = useWizardStore((s) => s.agentConfigs);

  const agentGroups = useMemo(() => buildAgentGroups(matrix), []);
  const flatRows = useMemo(() => buildFlatRows(agentGroups), [agentGroups]);
  const focusableIds = useMemo(() => buildFocusableIds(agentGroups), [agentGroups]);

  const [focusedId, setFocusedId] = useState<FocusId>(() => {
    const stored = useWizardStore.getState().focusedAgentId;
    return stored && focusableIds.includes(stored) ? stored : focusableIdAt(focusableIds, 0);
  });
  const { ref: listRef, measuredHeight: listHeight } = useMeasuredHeight();

  const focusedRowIndex =
    focusedId !== "continue"
      ? flatRows.findIndex((row) => row.type === "agent" && row.agent.id === focusedId)
      : -1;
  // The Agents grid clips silently: `useRowScroll` exposes no hidden-line counts
  // and this view renders no `ScrollAffordance`, by owner decision — see the
  // hook's doc comment.
  const { scrollEnabled, scrollTop } = useRowScroll({
    focusedIndex: Math.max(0, focusedRowIndex),
    itemCount: flatRows.length,
    availableHeight: listHeight,
  });

  useInput((input, key) => {
    if (key.escape) {
      useWizardStore.getState().goBack();
      return;
    }

    const currentIdx = focusableIds.indexOf(focusedId);

    if (key.upArrow || input === "k") {
      const nextIdx = currentIdx <= 0 ? focusableIds.length - 1 : currentIdx - 1;
      setFocusedId(focusableIdAt(focusableIds, nextIdx));
      return;
    }

    if (key.downArrow || input === "j") {
      const nextIdx = currentIdx >= focusableIds.length - 1 ? 0 : currentIdx + 1;
      setFocusedId(focusableIdAt(focusableIds, nextIdx));
      return;
    }

    if (key.return) {
      useWizardStore.getState().setStep("confirm");
      return;
    }

    if (input === KEY_SPACE && focusedId !== "continue") {
      useWizardStore.getState().toggleAgent(focusedId);
    }
  });

  // Sync focusedAgentId so the wizard-level S key handler can toggle agent scope
  React.useEffect(() => {
    useWizardStore.getState().setFocusedAgentId(focusedId === "continue" ? null : focusedId);
  }, [focusedId]);

  const focusedGroupLabel = agentGroups.find((g) => g.items.some((a) => a.id === focusedId))?.label;

  const selectedCount = selectedAgents.length;
  const continueLabel =
    selectedCount > 0 ? `Continue with ${selectedCount} agent(s)` : "Continue without agents";

  const isContinueFocused = focusedId === "continue";

  const rowElements = flatRows.map((row, index) => {
    switch (row.type) {
      case "header":
        return (
          <Box key={`header-${row.label}`} flexShrink={0}>
            {row.label === focusedGroupLabel ? (
              <Text
                color={CLI_COLORS.WHITE}
                backgroundColor={CLI_COLORS.LABEL_BG}
              >{` ${row.label} `}</Text>
            ) : (
              <Text dimColor bold>
                {"  "}
                {row.label}
              </Text>
            )}
          </Box>
        );
      case "spacer":
        return (
          <Box key={`spacer-${index}`} flexShrink={0}>
            <Text> </Text>
          </Box>
        );
      case "agent": {
        const isFocused = row.agent.id === focusedId;
        const isSelected = selectedAgents.includes(row.agent.id);
        const checkbox = isSelected ? "[\u2713]" : "[ ]";
        const pointer = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;
        const agentConfig = agentConfigs.find((ac) => ac.name === row.agent.id && !ac.excluded);
        const excludedConfig = agentConfigs.find((ac) => ac.name === row.agent.id && ac.excluded);
        const badges = deriveScopeBadges(agentConfig, excludedConfig);
        const scope = badges.scope ?? "global";
        const secondaryScope = badges.secondaryScope;
        return (
          <Box key={row.agent.id} flexShrink={0}>
            <Text>
              <Text {...(isFocused && { color: CLI_COLORS.PRIMARY })}>{pointer}</Text>
              <Text
                {...((isSelected || isFocused) && { color: CLI_COLORS.PRIMARY })}
                bold={isFocused}
              >
                {" "}
                {checkbox}{" "}
              </Text>
              <Text color={scope === "global" ? CLI_COLORS.WARNING : CLI_COLORS.TOAST_BG}>
                {formatScopeTag(scope)}
              </Text>
              {secondaryScope && (
                <Text
                  color={secondaryScope === "global" ? CLI_COLORS.WARNING : CLI_COLORS.TOAST_BG}
                >
                  {formatScopeTag(secondaryScope)}
                </Text>
              )}
              <Text
                {...((isSelected || isFocused) && { color: CLI_COLORS.PRIMARY })}
                bold={isFocused}
              >
                {" "}
                {row.agent.label}
              </Text>
              <Text dimColor> {row.agent.description}</Text>
            </Text>
          </Box>
        );
      }
      default: {
        const _exhaustive: never = row;
        return _exhaustive;
      }
    }
  });

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} flexBasis={0}>
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
            {rowElements}
          </Box>
        </Box>
      </Box>

      <Text {...(isContinueFocused && { color: CLI_COLORS.PRIMARY })} bold={isContinueFocused}>
        {isContinueFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER} {"\u2192"}{" "}
        {continueLabel}
      </Text>
    </Box>
  );
};
