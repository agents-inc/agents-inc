import React from "react";
import { Box, Text, useApp } from "ink";

import { Confirm } from "./confirm.js";
import { CLI_COLORS } from "../../consts.js";

/** A grouped section of a removal plan: a heading, and the lines it promises beneath it. */
export type RemovalPlanSection = {
  label: string;
  items: string[];
};

export type RemovalPlanConfirmProps = {
  /** The one sentence naming what the whole list is. */
  heading: string;
  /** What this run removes, grouped. A heading with no items is not passed at all. */
  sections: RemovalPlanSection[];
  /**
   * Prose printed under the removals: content that stays and why, and what a removal reaches
   * beyond the directory it was asked for in. Both are statements the list itself cannot make,
   * which is why they share one slot rather than one meaning.
   */
  statements: string[];
  /** The question itself. Defaults to no, because the subject is a deletion. */
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The removal plan a destructive command shows before it removes anything.
 *
 * Shared by the two commands that delete what a user already has: `uninstall`, which removes an
 * installation, and `edit --from`, which makes a project match a shared configuration and takes
 * away whatever that configuration left out. They ask different questions about different
 * subjects, and they owe the same shape — a list of what goes, a list of what stays and why,
 * and a default of no.
 *
 * It renders and nothing else. WHICH lines appear is each command's own decision, built from its
 * own plan, so the preview and the removal stay two readings of one value rather than two
 * derivations that agree today.
 */
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
          {section.items.map((item) => (
            <Text key={item} dimColor>
              {" "}
              {item}
            </Text>
          ))}
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
