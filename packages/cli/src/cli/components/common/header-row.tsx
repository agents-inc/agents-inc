import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS } from "../../consts.js";

/** Only the value shrinks, wrapping beside the label, so a long value cannot cut the label short. */
export const HeaderRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box flexDirection="row" columnGap={1}>
    <Box flexShrink={0}>
      <Text color={CLI_COLORS.WARNING} bold>
        {label}
      </Text>
    </Box>
    <Text color={CLI_COLORS.NEUTRAL}>{value}</Text>
  </Box>
);
