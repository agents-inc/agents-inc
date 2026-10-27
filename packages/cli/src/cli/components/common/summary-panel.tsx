import { Box, Text, renderToString } from "ink";
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
import { dimensionsOf } from "../hooks/use-terminal-dimensions.js";
import { SkillAgentSummary, type SkillAgentSummaryProps } from "./skill-agent-summary.js";

export type SummaryPanelProps = SkillAgentSummaryProps & {
  /** `undefined` when the configuration was built from no stack. */
  stackName: string | undefined;
  /** Where set, the skills the header names in place of those the panel leaves in place. */
  headerSkillConfigs?: SkillConfig[];
};

/**
 * The skills the panel leaves in place; leaving none, those it removes. The default marketplace is
 * only for a panel with no skill either way.
 */
function skillsTheHeaderNames({
  skillConfigs,
  installedSkillConfigs,
}: SkillAgentSummaryProps): SkillConfig[] {
  return skillConfigs.length > 0 ? skillConfigs : (installedSkillConfigs ?? []);
}

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

/** Only the value shrinks, so a name longer than its line cannot eat the label's last letters. */
const HeaderRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box flexDirection="row" columnGap={1}>
    <Box flexShrink={0}>
      <Text color={CLI_COLORS.WARNING} bold>
        {label}
      </Text>
    </Box>
    <Text color={CLI_COLORS.NEUTRAL}>{value}</Text>
  </Box>
);

const PanelHeader: React.FC<PanelHeaderProps> = ({ sourceNames, stackName }) => (
  <Box
    flexDirection="column"
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
    <HeaderRow label="Marketplace" value={sourceNames} />
    <HeaderRow label="Stack" value={stackName ?? "none"} />
  </Box>
);

const SummaryPanel: React.FC<SummaryPanelProps> = ({
  stackName,
  headerSkillConfigs,
  ...summary
}) => (
  <Box flexDirection="column" borderStyle="single" borderColor={CLI_COLORS.NEUTRAL} paddingX={2}>
    <PanelHeader
      sourceNames={formatSkillMarketplaces(headerSkillConfigs ?? skillsTheHeaderNames(summary))}
      stackName={stackName}
    />
    <SkillAgentSummary {...summary} />
  </Box>
);

/**
 * The whole panel as text, drawn once: printed, it scrolls with the terminal like any other line,
 * and a run with no terminal prints the same thing.
 */
export function summaryPanelText(
  props: SummaryPanelProps,
  columns: number = dimensionsOf(process.stdout).columns,
): string {
  return renderToString(<SummaryPanel {...props} />, { columns });
}

/**
 * What a question shows, or where none is asked, what prints in its place: the panel, the lines
 * under it marking what it cannot show, then each statement after a blank line, and a blank line
 * before what follows.
 */
export function summaryPanelBlock(
  panel: SummaryPanelProps,
  linesUnder: readonly string[],
  statements: readonly string[],
): string[] {
  return [
    summaryPanelText(panel),
    ...linesUnder,
    ...statements.flatMap((statement) => ["", statement]),
    "",
  ];
}
