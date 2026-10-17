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
import type { SkillConfig } from "../../types/config.js";
import { usePanelScroll } from "../hooks/use-panel-scroll.js";
import { ScrollAffordance } from "./scroll-affordance.js";
import { SkillAgentSummary, type SkillAgentSummaryProps } from "./skill-agent-summary.js";

export type SummaryPanelProps = SkillAgentSummaryProps & {
  /** `undefined` when the configuration was built from no stack. */
  stackName: string | undefined;
};

/**
 * No skills shows the default marketplace; all-ejected names none. Tombstoned entries count: the
 * summary below renders them as rows.
 */
function formatSkillMarketplaces(skillConfigs: SkillConfig[]): string {
  if (skillConfigs.length === 0) return formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME);

  const marketplaceNames = unique(
    skillConfigs.map((config) => config.origin).filter((origin) => origin !== EJECT_SOURCE),
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

/** `flexShrink={0}`: squeezed by Yoga on a short terminal, its two rows overprint. */
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

/** Horizontal padding only: unshrinkable vertical padding starves the viewport on a short terminal. */
export const SummaryPanel: React.FC<SummaryPanelProps> = ({ stackName, ...summary }) => {
  const { viewportRef, contentRef, contentMarginTop, hiddenAbove, hiddenBelow } = usePanelScroll();

  const sourceNames = formatSkillMarketplaces(summary.skillConfigs);

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
            <SkillAgentSummary {...summary} />
          </Box>
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={hiddenAbove} hiddenBelow={hiddenBelow} />
    </Box>
  );
};
