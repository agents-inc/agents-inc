import React from "react";
import { Box, Text, useApp } from "ink";

import { Confirm } from "./confirm.js";
import { CLI_COLORS } from "../../consts.js";

const ITEM_INDENT = 3;

export type RemovalPlanSection = {
  label: string;
  items: string[];
};

export type RemovalPlanConfirmProps = {
  /** Omitted where the plan opens on what it overwrites. */
  heading?: string;
  /** Omit headings with no items. */
  sections: RemovalPlanSection[];
  /** What the apply writes over in place, under a heading of its own; omitted when empty. */
  overwritten?: RemovalPlanSection;
  /** Prose under the removals: what stays and why, and what a removal reaches beyond. */
  statements: string[];
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const RemovalPlanConfirm: React.FC<RemovalPlanConfirmProps> = ({
  heading,
  sections,
  overwritten,
  statements,
  message,
  onConfirm,
  onCancel,
}) => {
  const { exit } = useApp();
  const opensTheFrame = heading === undefined && sections.length === 0;

  return (
    <Box flexDirection="column">
      {heading !== undefined && (
        <>
          <Text bold>{heading}</Text>
          <Text> </Text>
        </>
      )}

      {sections.map((section) => (
        <Box key={section.label} flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> {section.label}</Text>
          <PlanItems items={section.items} />
        </Box>
      ))}

      {overwritten !== undefined && overwritten.items.length > 0 && (
        <Box flexDirection="column">
          {!opensTheFrame && <Text> </Text>}
          <Text bold>{overwritten.label}</Text>
          <PlanItems items={overwritten.items} />
        </Box>
      )}

      {statements.map((statement) => (
        <Box key={statement} flexDirection="column">
          <Text> </Text>
          <Text dimColor>{statement}</Text>
        </Box>
      ))}

      <Text> </Text>
      <Confirm
        message={message}
        onConfirm={() => {
          onConfirm();
          exit();
        }}
        onCancel={() => {
          onCancel();
          exit();
        }}
        defaultValue={false}
      />
    </Box>
  );
};

const PlanItems: React.FC<{ items: string[] }> = ({ items }) => (
  <Box flexDirection="column" paddingLeft={ITEM_INDENT}>
    {items.map((item) => (
      <Text key={item} dimColor>
        {item}
      </Text>
    ))}
  </Box>
);
