import { Box, Text } from "ink";
import React from "react";
import { SCROLL_VIEWPORT } from "../../consts.js";

export type ScrollAffordanceProps = {
  /** Content lines scrolled off the top of the viewport. */
  hiddenAbove: number;
  /** Content lines that do not fit below the viewport. */
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

/**
 * One pinned line telling the user the viewport is clipping content.
 *
 * Render this as a SIBLING of the clipped viewport, never inside it: a
 * viewport that clips its own overflow would clip this line too. Its fixed
 * `SCROLL_INDICATOR_HEIGHT` row is taken out of the space the viewport grows
 * into, so the viewport shrinks by exactly one row while the affordance shows.
 */
export const ScrollAffordance: React.FC<ScrollAffordanceProps> = ({ hiddenAbove, hiddenBelow }) => {
  if (hiddenAbove <= 0 && hiddenBelow <= 0) return null;

  return (
    <Box height={SCROLL_VIEWPORT.SCROLL_INDICATOR_HEIGHT} flexShrink={0}>
      <Text dimColor>{formatHiddenCounts(hiddenAbove, hiddenBelow)}</Text>
    </Box>
  );
};
