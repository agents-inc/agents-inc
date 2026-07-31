import { Box, Text } from "ink";
import React from "react";
import { unique } from "remeda";
import {
  ALL_SKILLS_EJECTED_LABEL,
  CLI_COLORS,
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  formatSourceDisplayName,
} from "../../consts.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import type { SkillConfig } from "../../types/config.js";
import { usePanelScroll } from "../hooks/use-panel-scroll.js";
import { ScrollAffordance } from "./scroll-affordance.js";
import { SkillAgentSummary } from "./skill-agent-summary.js";
import { getStackName } from "./utils.js";

/**
 * The Marketplace row's value: the distinct marketplaces the summarised skills come from.
 *
 * `SkillConfig.source` is authoritative for where a skill came from (D-217) and holds exactly one
 * of two things: {@link EJECT_SOURCE}, meaning the files were copied locally, or the marketplace's
 * own name as its `marketplace.json` declares it — which is why a project initialised from a
 * different marketplace names that marketplace here without any extra plumbing.
 *
 * Three cases, and the two zero-marketplace ones are NOT the same state:
 * - **No skills at all.** Reachable — the `I` overlay opens from the stack step before anything is
 *   selected. Nothing is claimed yet, so the default public marketplace stands in.
 * - **Skills, but every one ejected.** "eject" names no marketplace, so there is none to list;
 *   naming the default would assert an origin none of those skills has.
 * - **Any marketplace-sourced skill.** Its marketplace is named. Ejected siblings contribute no
 *   name but do not suppress the ones that do.
 *
 * Tombstoned (`excluded`) entries count. One still records a real global install and the
 * marketplace it came from, and `computeScopeDiff` renders it as a row in the summary below, so
 * dropping it here would leave the header disowning a row it sits above.
 *
 * Sorted, so the row cannot reorder between renders on config iteration order alone.
 */
function formatSkillMarketplaces(skillConfigs: SkillConfig[]): string {
  if (skillConfigs.length === 0) return formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME);

  const marketplaceNames = unique(
    skillConfigs.map((config) => config.source).filter((source) => source !== EJECT_SOURCE),
  );
  if (marketplaceNames.length === 0) return ALL_SKILLS_EJECTED_LABEL;

  return marketplaceNames
    .map((name) => formatSourceDisplayName(name))
    .sort()
    .join(" · ");
}

type PanelHeaderProps = {
  sourceNames: string;
  stackName: string | undefined;
};

/**
 * Which marketplaces and which stack the summary below was built from.
 *
 * Rendered inside the scrolled content, so its `marginBottom` scrolls away
 * rather than permanently costing the viewport a row.
 *
 * `flexShrink={0}` is load-bearing: Ink defaults every box to `flexShrink: 1`,
 * so on a short terminal Yoga squeezes this block to fit instead of letting the
 * viewport clip it, and the Marketplace and Stack rows overprint into one
 * unreadable line. Clipping is the panel's job; the header must keep its height.
 */
const PanelHeader: React.FC<PanelHeaderProps> = ({ sourceNames, stackName }) => (
  <Box
    flexDirection="column"
    flexShrink={0}
    borderStyle="single"
    borderBottom={true}
    borderTop={false}
    borderLeft={false}
    borderRight={false}
    borderColor={CLI_COLORS.NEUTRAL}
    borderBottomDimColor
    paddingBottom={1}
    marginBottom={1}
  >
    <Box flexDirection="row" columnGap={1}>
      <Text color={CLI_COLORS.WARNING} bold>
        Marketplace
      </Text>
      <Text color={CLI_COLORS.NEUTRAL}>{sourceNames}</Text>
    </Box>
    <Box flexDirection="row" columnGap={1}>
      <Text color={CLI_COLORS.WARNING} bold>
        Stack
      </Text>
      <Text color={CLI_COLORS.NEUTRAL}>{stackName ?? "none"}</Text>
    </Box>
  </Box>
);

/**
 * Marketplace/stack header above a clipped, arrow-scrollable
 * `SkillAgentSummary` — the one panel both summary surfaces render: the `I`
 * overlay in `wizard-layout.tsx` and the confirm step.
 *
 * It owns the `↑`/`↓` keys through `usePanelScroll`. A host that needs other
 * keys adds its own `useInput` alongside it — `StepConfirm` claims `Enter` and
 * `Esc` that way.
 *
 * Horizontal padding only. Vertical padding is unshrinkable, so on a short
 * terminal it claims the last row the viewport has and the content measures 0
 * before it has ever been laid out — the panel then paints neither a summary
 * row nor the affordance that would say rows are missing.
 */
export const SummaryPanel: React.FC = () => {
  const skillConfigs = useWizardStore((s) => s.skillConfigs);
  const agentConfigs = useWizardStore((s) => s.agentConfigs);
  const selectedStackId = useWizardStore((s) => s.selectedStackId);
  const { viewportRef, contentRef, contentMarginTop, hiddenAbove, hiddenBelow } = usePanelScroll();

  const sourceNames = formatSkillMarketplaces(skillConfigs);
  const stackName = getStackName(selectedStackId);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      borderStyle="single"
      borderColor={CLI_COLORS.NEUTRAL}
      paddingX={2}
    >
      <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden">
        <Box ref={contentRef} flexDirection="column" flexShrink={0} marginTop={contentMarginTop}>
          <PanelHeader sourceNames={sourceNames} stackName={stackName} />

          <Box width="100%">
            <SkillAgentSummary skillConfigs={skillConfigs} agentConfigs={agentConfigs} />
          </Box>
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={hiddenAbove} hiddenBelow={hiddenBelow} />
    </Box>
  );
};
