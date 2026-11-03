import { Box, measureElement, Text, type DOMElement } from "ink";
import React, { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { chunk } from "remeda";
import { CLI_COLORS, EJECT_SOURCE, UI_SYMBOLS } from "../../consts.js";
import { computeScopeDiff } from "../../lib/configuration/scope-diff.js";
import type {
  AgentDiffRow,
  DiffRowStatus,
  ScopeDiffInput,
  SkillDiffRow,
} from "../../lib/configuration/scope-diff.js";
import { getSkillEntryDisplayName } from "../../lib/matrix/matrix-provider.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";

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
};

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

const EjectIcon: React.FC = () => <Text color={CLI_COLORS.WARNING}>{UI_SYMBOLS.EJECT}</Text>;

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

type InkNode = DOMElement["childNodes"][number];

const isInkText = (node: InkNode): node is DOMElement => node.nodeName === "ink-text";

const isEjected = (row: SkillDiffRow): boolean => row.source === EJECT_SOURCE;

/** The name's words, then ⏏ where the skill is ejected. */
function nameWords(row: SkillDiffRow): string[] {
  const words = getSkillEntryDisplayName(row).split(" ");
  return isEjected(row) ? [...words, UI_SYMBOLS.EJECT] : words;
}

const fitsOn = (line: string, width: number): boolean => [...line].length <= width;

/** Cuts a word longer than a line into a line's worth each. */
const cutToWidth = (word: string, width: number): string[] =>
  chunk([...word], width).map((characters) => characters.join(""));

function appendWord(lines: string[], word: string, width: number): string[] {
  const lastLine = lines.at(-1);
  if (lastLine === undefined) return [word];

  const extended = `${lastLine} ${word}`;
  return fitsOn(extended, width) ? [...lines.slice(0, -1), extended] : [...lines, word];
}

/** Lines of at most `width` characters, broken between words; no line starts with a space. */
function wrapWords(words: readonly string[], width: number): string[] {
  return words
    .flatMap((word) => cutToWidth(word, width))
    .reduce<string[]>((lines, word) => appendWord(lines, word, width), []);
}

/** The width Ink gives the cell's name in its first layout: the width Ink would wrap it at. */
function useNameWidth(cell: RefObject<DOMElement | null>): number | undefined {
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    if (width !== undefined) return;
    const name = cell.current?.childNodes.find(isInkText);
    const measured = name === undefined ? 0 : measureElement(name).width;
    if (measured > 0) setWidth(measured);
  }, [cell, width]);

  return width;
}

const SkillName: React.FC<{ row: SkillDiffRow; text: string }> = ({ row, text }) => (
  <Text color={DIFF_COLOR[row.status]}>
    {isEjected(row) ? text.slice(0, -UI_SYMBOLS.EJECT.length) : text}
    {isEjected(row) && <EjectIcon />}
  </Text>
);

/**
 * A long name wraps under itself, beside a prefix that never shrinks, with ⏏ in its own text:
 * drawn beside the name, ⏏ covers its last letters. Ink's wrap keeps the space after a line that
 * fills its width, so the next line starts a column in and ⏏ can drop to a line of its own: the
 * name is laid out once as Ink draws it, then wrapped here at the width Ink gave it.
 */
const SkillRow: React.FC<{ row: SkillDiffRow }> = ({ row }) => {
  const cell = useRef<DOMElement>(null);
  const nameWidth = useNameWidth(cell);
  const words = nameWords(row);

  return (
    <Box ref={cell} width="50%" paddingRight={NAME_GUTTER_COLUMNS}>
      <Box flexShrink={0}>
        <Text color={DIFF_COLOR[row.status]}>{DIFF_PREFIX[row.status]}</Text>
      </Box>
      {nameWidth === undefined ? (
        <SkillName row={row} text={words.join(" ")} />
      ) : (
        <Box width={nameWidth} flexShrink={0}>
          <SkillName row={row} text={wrapWords(words, nameWidth).join("\n")} />
        </Box>
      )}
    </Box>
  );
};

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

type ScopeRowsProps<Row> = { label: string; rows: Row[] };

const SkillScopeRows: React.FC<ScopeRowsProps<SkillDiffRow>> = ({ label, rows }) => {
  if (rows.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <ScopeLabel>{label}</ScopeLabel>
      <Box flexWrap="wrap">
        {rows.map((row) => (
          <SkillRow key={skillRowKey(row)} row={row} />
        ))}
      </Box>
    </Box>
  );
};

const AgentScopeRows: React.FC<ScopeRowsProps<AgentDiffRow>> = ({ label, rows }) => {
  if (rows.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      <ScopeLabel>{label}</ScopeLabel>
      <Box flexDirection="column">
        {rows.map((row) => (
          <AgentRow key={agentRowKey(row)} row={row} />
        ))}
      </Box>
    </Box>
  );
};

export const SkillAgentSummary: React.FC<SkillAgentSummaryProps> = ({
  skillConfigs,
  agentConfigs,
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
        <SkillScopeRows label="Project" rows={diff.projectSkillRows} />
        <SkillScopeRows label="Global" rows={diff.globalSkillRows} />
      </Box>
      <Box flexDirection="column" flexGrow={1} flexBasis={0} marginLeft={1} paddingLeft={1}>
        <TableHeader>Agents</TableHeader>
        <AgentScopeRows label="Project" rows={diff.projectAgentRows} />
        <AgentScopeRows label="Global" rows={diff.globalAgentRows} />
      </Box>
    </Box>
  );
};
