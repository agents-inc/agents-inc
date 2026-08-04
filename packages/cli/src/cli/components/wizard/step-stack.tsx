import { Box } from "ink";
import React from "react";
import { StackSelection } from "./stack-selection.js";

type StepStackProps = {
  onCancel?: () => void;
};

/**
 * First step of the wizard: select a stack or "Start from scratch".
 *
 * After selection, the wizard transitions to the "domains" step.
 */
export const StepStack: React.FC<StepStackProps> = ({ onCancel }) => {
  return (
    <Box flexDirection="column" width="100%" flexGrow={1} flexBasis={0}>
      <Box flexGrow={1} flexBasis={0}>
        <StackSelection onCancel={onCancel} />
      </Box>
    </Box>
  );
};
