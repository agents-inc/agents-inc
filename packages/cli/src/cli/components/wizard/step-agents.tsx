import { groupBy, unique } from "remeda";
import { Box, Text, useInput } from "ink";
import { deriveScopeBadges, formatScopeTag } from "../../lib/wizard/index.js";
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
import { type CheckboxItem } from "./checkbox-grid.js";
import { KEY_SPACE } from "./hotkeys.js";
import { getDomainDisplayName } from "./utils.js";

type AgentItem = CheckboxItem<AgentName>;

type AgentGroup = {
  label: string;
  items: AgentItem[];
};

const BUILT_IN_AGENT_GROUPS: AgentGroup[] = [
  {
    label: "Web",
    items: [
      {
        id: "web-developer",
        label: "Web Developer",
        description: "Frontend features, components, TypeScript",
      },
      { id: "web-reviewer", label: "Web Reviewer", description: "UI component code review" },
      { id: "web-researcher", label: "Web Researcher", description: "Frontend pattern discovery" },
      {
        id: "web-tester",
        label: "Web Tester",
        description: "Frontend tests, E2E, component tests",
      },
      { id: "web-pm", label: "Web PM", description: "Implementation specs and planning" },
      {
        id: "web-architecture",
        label: "Web Architecture",
        description: "App scaffolding, foundational patterns",
      },
      {
        id: "web-pattern-critique",
        label: "Web Pattern Critique",
        description: "Critique patterns against industry standards",
      },
    ],
  },
  {
    label: "API",
    items: [
      {
        id: "api-developer",
        label: "API Developer",
        description: "Backend routes, database, middleware",
      },
      { id: "api-reviewer", label: "API Reviewer", description: "Backend and config code review" },
      { id: "api-researcher", label: "API Researcher", description: "Backend pattern discovery" },
    ],
  },
  {
    label: "CLI",
    items: [
      {
        id: "cli-developer",
        label: "CLI Developer",
        description: "CLI commands, interactive prompts",
      },
      { id: "cli-tester", label: "CLI Tester", description: "CLI application tests" },
      { id: "cli-reviewer", label: "CLI Reviewer", description: "CLI code review" },
    ],
  },
  {
    label: "Meta",
    items: [
      {
        id: "pattern-scout",
        label: "Pattern Scout",
        description: "Extract codebase patterns and standards",
      },
      { id: "agent-summoner", label: "Agent Summoner", description: "Create and improve agents" },
      {
        id: "skill-summoner",
        label: "Skill Summoner",
        description: "Create technology-specific skills",
      },
      { id: "codex-keeper", label: "Codex Keeper", description: "AI-focused documentation" },
    ],
  },
];

/** IDs of all built-in agents for fast lookup. */
const BUILT_IN_AGENT_IDS = new Set<string>(
  BUILT_IN_AGENT_GROUPS.flatMap((group) => group.items.map((a) => a.id)),
);

type FocusId = AgentName | "continue";

type ListRow =
  { type: "header"; label: string } | { type: "spacer" } | { type: "agent"; agent: AgentItem };

function buildAgentGroups(matrix: MergedSkillsMatrix): AgentGroup[] {
  const customAgentIds: string[] = unique(
    matrix.suggestedStacks.flatMap((stack) => typedKeys(stack.skills)),
  ).filter((agentName) => !BUILT_IN_AGENT_IDS.has(agentName));

  if (customAgentIds.length === 0) return BUILT_IN_AGENT_GROUPS;

  // Group custom agents by explicit domain (from metadata.yaml) or kebab prefix fallback
  const customItems = customAgentIds.map((agentId) => {
    const explicitDomain = isAgentName(agentId) ? matrix.agentDefinedDomains?.[agentId] : undefined;
    const domainKey = explicitDomain ?? (agentId.split("-")[0] || "custom");
    return {
      groupLabel: getDomainDisplayName(domainKey),
      item: {
        // Boundary cast: custom agent names from marketplace stacks are not in the AgentName union
        id: agentId as AgentName,
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

export const StepAgents: React.FC = () => {
  const selectedAgents = useWizardStore((s) => s.selectedAgents);
  const agentConfigs = useWizardStore((s) => s.agentConfigs);

  const agentGroups = useMemo(() => buildAgentGroups(matrix), []);
  const flatRows = useMemo(() => buildFlatRows(agentGroups), [agentGroups]);
  const focusableIds = useMemo(() => buildFocusableIds(agentGroups), [agentGroups]);

  const [focusedId, setFocusedId] = useState<FocusId>(() => {
    const stored = useWizardStore.getState().focusedAgentId;
    return stored && focusableIds.includes(stored) ? stored : focusableIds[0]!;
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
      setFocusedId(focusableIds[nextIdx]!);
      return;
    }

    if (key.downArrow || input === "j") {
      const nextIdx = currentIdx >= focusableIds.length - 1 ? 0 : currentIdx + 1;
      setFocusedId(focusableIds[nextIdx]!);
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
              <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined}>{pointer}</Text>
              <Text
                color={isSelected || isFocused ? CLI_COLORS.PRIMARY : undefined}
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
                color={isSelected || isFocused ? CLI_COLORS.PRIMARY : undefined}
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

      <Text color={isContinueFocused ? CLI_COLORS.PRIMARY : undefined} bold={isContinueFocused}>
        {isContinueFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER} {"\u2192"}{" "}
        {continueLabel}
      </Text>
    </Box>
  );
};
