import React from "react";
import { Box, Text } from "ink";
import { ConfirmInput } from "@inkjs/ui";

type ConfirmProps = {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  defaultValue?: boolean;
};

export const Confirm: React.FC<ConfirmProps> = ({
  message,
  onConfirm,
  onCancel,
  defaultValue = false,
}) => (
  <Box flexDirection="column">
    <Text>{message}</Text>
    <ConfirmInput
      onConfirm={onConfirm}
      onCancel={onCancel}
      defaultChoice={defaultValue ? "confirm" : "cancel"}
    />
  </Box>
);
