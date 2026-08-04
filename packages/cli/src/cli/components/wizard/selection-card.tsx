import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS, UI_SYMBOLS } from "../../consts.js";

type SelectionCardProps = {
  label: string;
  description: string | string[];
  isFocused: boolean;
  marginBottom?: number;
};

export const SelectionCard: React.FC<SelectionCardProps> = ({
  label,
  description,
  isFocused,
  marginBottom,
}) => {
  const descriptionLines = Array.isArray(description) ? description : [description];

  return (
    <Box
      borderStyle="round"
      borderColor={isFocused ? CLI_COLORS.PRIMARY : CLI_COLORS.NEUTRAL}
      paddingX={2}
      paddingY={1}
      marginBottom={marginBottom}
      width="100%"
    >
      <Box flexDirection="column" gap={1}>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined} bold={isFocused}>
          {isFocused ? `${UI_SYMBOLS.CHEVRON} ${label}` : label}
        </Text>
        {descriptionLines.map((line, index) => (
          <Text key={index} dimColor>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
