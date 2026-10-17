import { Box, Text } from "ink";
import React from "react";
import { SCROLL_VIEWPORT } from "../../consts.js";

export type ScrollAffordanceProps = {
  hiddenAbove: number;
  hiddenBelow: number;
};

function formatHiddenCounts(hiddenAbove: number, hiddenBelow: number): string {
  return [
    hiddenAbove > 0 ? `${hiddenAbove} more above` : null,
    hiddenBelow > 0 ? `${hiddenBelow} more below` : null,
  ]
    .filter((part) => part !== null)
    .join("   ");
}

/** Render as a sibling of the clipped viewport, never inside it, or it is clipped too. */
export const ScrollAffordance: React.FC<ScrollAffordanceProps> = ({ hiddenAbove, hiddenBelow }) => {
  if (hiddenAbove <= 0 && hiddenBelow <= 0) return null;

  return (
    <Box height={SCROLL_VIEWPORT.SCROLL_INDICATOR_HEIGHT} flexShrink={0}>
      <Text dimColor>{formatHiddenCounts(hiddenAbove, hiddenBelow)}</Text>
    </Box>
  );
};
