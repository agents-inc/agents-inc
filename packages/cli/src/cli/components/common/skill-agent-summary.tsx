import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS, EJECT_SOURCE, UI_SYMBOLS } from "../../consts.js";
import { computeScopeDiff } from "../../lib/configuration/scope-diff.js";
import type {
  AgentDiffRow,
  DiffRowStatus,
  ScopeDiffInput,
  SkillDiffRow,
} from "../../lib/configuration/scope-diff.js";
import { getSkillDisplayName } from "../../lib/matrix/matrix-provider.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import type { SkillId } from "../../types/skills.js";
import { inertLine } from "../../utils/string.js";

export type SkillAgentSummaryProps = Pick<
  ScopeDiffInput,
  | "installedSkillConfigs"
  | "installedAgentConfigs"
  | "isInitMode"
  | "overwrittenSkillIds"
  | "changedAgentNames"
> & {
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
  /** Read off each copy's metadata.yaml by a run that loads no marketplace to name them from. */
  skillNames?: ReadonlyMap<SkillId, string>;
};

const NO_NAMES: ReadonlyMap<SkillId, string> = new Map();

/** A name the run read stands over the catalogue's: it is what that copy says it is. */
function skillNameOf(id: SkillId, names: ReadonlyMap<SkillId, string>): string {
  const recorded = names.get(id);
  return recorded === undefined ? getSkillDisplayName(id) : inertLine(recorded);
}

const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text bold color={CLI_COLORS.WARNING}>
    {children}
  </Text>
);

const ScopeLabel: React.FC<{ children: string }> = ({ children }) => (
  <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
    {` ${children} `}
  </Text>
);

const EjectIcon: React.FC = () => <Text color={CLI_COLORS.WARNING}> {UI_SYMBOLS.EJECT}</Text>;

const DIFF_PREFIX: Record<DiffRowStatus, string> = {
  added: `${UI_SYMBOLS.ADDED} `,
  "mode-changed": `${UI_SYMBOLS.CHANGED} `,
  overwritten: `${UI_SYMBOLS.OVERWRITTEN} `,
  changed: `${UI_SYMBOLS.CHANGED} `,
  removed: `${UI_SYMBOLS.REMOVED} `,
  unchanged: `${UI_SYMBOLS.BULLET} `,
};

const DIFF_COLOR: Record<DiffRowStatus, string> = {
  added: CLI_COLORS.SUCCESS,
  "mode-changed": CLI_COLORS.WARNING,
  overwritten: CLI_COLORS.WARNING,
  changed: CLI_COLORS.WARNING,
  removed: CLI_COLORS.ERROR,
  unchanged: CLI_COLORS.NEUTRAL,
};

/**
 * Yoga widens a text to whole columns on both sides and Ink draws it from its rounded left, so a
 * name in a half that starts or ends mid-column draws up to two columns past the half: over the
 * next name, or over the table's border. The third column stays blank.
 */
const NAME_GUTTER_COLUMNS = 3;

/**
 * A long name wraps under itself, beside a prefix that never shrinks, and carries its mark in its
 * own text: drawn beside the name, the mark covered its last letters.
 */
const SkillRow: React.FC<{ row: SkillDiffRow; name: string }> = ({ row, name }) => (
  <Box width="50%" paddingRight={NAME_GUTTER_COLUMNS}>
    <Box flexShrink={0}>
      <Text color={DIFF_COLOR[row.status]}>{DIFF_PREFIX[row.status]}</Text>
    </Box>
    <Text color={DIFF_COLOR[row.status]}>
      {name}
      {row.source === EJECT_SOURCE && <EjectIcon />}
    </Text>
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
  skillNames = NO_NAMES,
  ...baseline
}) => {
  const diff = computeScopeDiff({
    currentSkills: skillConfigs,
    currentAgents: agentConfigs,
    ...baseline,
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
                <SkillRow key={skillRowKey(row)} row={row} name={skillNameOf(row.id, skillNames)} />
              ))}
            </Box>
          </Box>
        )}
        {diff.globalSkillRows.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Global</ScopeLabel>
            <Box flexWrap="wrap">
              {diff.globalSkillRows.map((row) => (
                <SkillRow key={skillRowKey(row)} row={row} name={skillNameOf(row.id, skillNames)} />
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
