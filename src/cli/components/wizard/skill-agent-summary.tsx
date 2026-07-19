import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS, EJECT_SOURCE, SOURCE_DISPLAY_NAMES, UI_SYMBOLS } from "../../consts.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import { computeScopeDiff } from "../../lib/wizard/index.js";
import type { AgentDiffRow, DiffRowStatus, SkillDiffRow } from "../../lib/wizard/index.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import type { SkillId } from "../../types/index.js";
import { useWizardStore } from "../../stores/wizard-store.js";

export type SkillAgentSummaryProps = {
  skillConfigs?: SkillConfig[];
  agentConfigs?: AgentScopeConfig[];
};

function getSkillDisplayName(id: SkillId): string {
  return matrix.skills[id]?.displayName ?? id;
}

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text bold color={CLI_COLORS.WARNING}>
    {children}
  </Text>
);

export const ScopeLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
    {` ${children} `}
  </Text>
);

export const EjectIcon: React.FC = () => (
  <Text color={CLI_COLORS.WARNING}> {UI_SYMBOLS.EJECT}</Text>
);

const DIFF_PREFIX: Record<DiffRowStatus, string> = {
  added: "+ ",
  "source-changed": "~ ",
  removed: "- ",
  unchanged: `${UI_SYMBOLS.BULLET} `,
};

const DIFF_COLOR: Record<DiffRowStatus, string> = {
  added: CLI_COLORS.SUCCESS,
  "source-changed": CLI_COLORS.WARNING,
  removed: CLI_COLORS.ERROR,
  unchanged: CLI_COLORS.NEUTRAL,
};

function sourceDisplayName(source: string): string {
  return SOURCE_DISPLAY_NAMES[source] ?? source;
}

const SkillRow: React.FC<{ row: SkillDiffRow }> = ({ row }) => (
  <Box width="50%" flexDirection="row">
    <Text color={DIFF_COLOR[row.status]}>
      {DIFF_PREFIX[row.status]}
      {getSkillDisplayName(row.id)}
    </Text>
    {row.status === "source-changed" && row.prevSource != null && (
      <Text dimColor>
        {" "}
        ({sourceDisplayName(row.prevSource)} → {sourceDisplayName(row.source)})
      </Text>
    )}
    {row.source === EJECT_SOURCE && <EjectIcon />}
  </Box>
);

const AgentRow: React.FC<{ row: AgentDiffRow }> = ({ row }) => (
  <Text color={DIFF_COLOR[row.status]}>
    {DIFF_PREFIX[row.status]}
    {row.name}
  </Text>
);

const skillRowKey = (row: SkillDiffRow): string =>
  row.status === "removed" ? `removed-${row.id}` : row.id;

const agentRowKey = (row: AgentDiffRow): string =>
  row.status === "removed" ? `removed-${row.name}` : row.name;

export const SkillAgentSummary: React.FC<SkillAgentSummaryProps> = ({
  skillConfigs,
  agentConfigs,
}) => {
  const installedSkillConfigs = useWizardStore((s) => s.installedSkillConfigs);
  const installedAgentConfigs = useWizardStore((s) => s.installedAgentConfigs);
  const isInitMode = useWizardStore((s) => s.isInitMode);

  const diff = computeScopeDiff({
    currentSkills: skillConfigs ?? [],
    currentAgents: agentConfigs ?? [],
    installedSkillConfigs,
    installedAgentConfigs,
    isInitMode,
  });

  if (!diff.hasContent) return null;

  return (
    <Box flexDirection="row" width="100%">
      <Box
        flexDirection="column"
        borderStyle="single"
        flexGrow={2}
        flexBasis={0}
        borderRight={true}
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderColor={CLI_COLORS.NEUTRAL}
        borderRightDimColor
      >
        <TableHeader>Skills</TableHeader>
        {diff.projectSkillRows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Project</ScopeLabel>
            <Box flexWrap="wrap">
              {diff.projectSkillRows.map((row) => (
                <SkillRow key={skillRowKey(row)} row={row} />
              ))}
            </Box>
          </Box>
        )}
        {diff.globalSkillRows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Global</ScopeLabel>
            <Box flexWrap="wrap">
              {diff.globalSkillRows.map((row) => (
                <SkillRow key={skillRowKey(row)} row={row} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexBasis={0} marginLeft={1} paddingLeft={1}>
        <TableHeader>Agents</TableHeader>
        {diff.projectAgentRows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Project</ScopeLabel>
            <Box flexDirection="column">
              {diff.projectAgentRows.map((row) => (
                <AgentRow key={agentRowKey(row)} row={row} />
              ))}
            </Box>
          </Box>
        )}
        {diff.globalAgentRows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Global</ScopeLabel>
            <Box flexDirection="column">
              {diff.globalAgentRows.map((row) => (
                <AgentRow key={agentRowKey(row)} row={row} />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
