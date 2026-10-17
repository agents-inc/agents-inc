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
  heading: string;
  /** Omit headings with no items. */
  sections: RemovalPlanSection[];
  /** Prose under the removals: what stays and why, and what a removal reaches beyond. */
  statements: string[];
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const RemovalPlanConfirm: React.FC<RemovalPlanConfirmProps> = ({
  heading,
  sections,
  statements,
  message,
  onConfirm,
  onCancel,
}) => {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text bold>{heading}</Text>
      <Text> </Text>

      {sections.map((section) => (
        <Box key={section.label} flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> {section.label}</Text>
          <Box flexDirection="column" paddingLeft={ITEM_INDENT}>
            {section.items.map((item) => (
              <Text key={item} dimColor>
                {item}
              </Text>
            ))}
          </Box>
        </Box>
      ))}

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
