import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS } from "../../consts.js";

const TITLE_HORIZONTAL_PADDING = 6;

type ToastProps = {
  children: string;
};

export const Toast: React.FC<ToastProps> = ({ children }) => {
  const padding = " ".repeat(children.length + TITLE_HORIZONTAL_PADDING);
  const paddingHalf = " ".repeat(TITLE_HORIZONTAL_PADDING / 2);

  return (
    <Box flexDirection="column" position="absolute">
      <Text backgroundColor={CLI_COLORS.TOAST_BG}>{padding}</Text>
      <Text bold backgroundColor={CLI_COLORS.TOAST_BG} color={CLI_COLORS.TOAST_FG}>
        {paddingHalf}
        {children}
        {paddingHalf}
      </Text>
      <Text backgroundColor={CLI_COLORS.TOAST_BG}>{padding}</Text>
    </Box>
  );
};
