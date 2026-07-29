import { Box, type DOMElement, measureElement, useInput } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { CLI_COLORS } from "../../consts.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { ScrollAffordance } from "./scroll-affordance.js";
import { SkillAgentSummary } from "./skill-agent-summary.js";

type StepConfirmProps = {
  onComplete: () => void;
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
  onBack: () => void;
};

export const StepConfirm: React.FC<StepConfirmProps> = ({
  onComplete,
  skillConfigs,
  agentConfigs,
  onBack,
}) => {
  // Measured INSIDE the border and padding, so it is the height the summary
  // actually gets — no border-row fudge factor.
  const { ref: viewportRef, measuredHeight: viewportHeight } = useMeasuredHeight();

  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const { height } = measureElement(contentRef.current);
    // Yoga under-reports a wrapped subtree measured inside a viewport too
    // short to lay it out, and reports 0 inside a zero-height one, so the
    // tallest reading is the trustworthy one. Believing a squeezed reading
    // would shrink the hidden-line count until the affordance disappeared,
    // which hands its row back and grows the count again — a render loop.
    setContentHeight((prev) => Math.max(prev, height));
  });

  // contentHeight only ever sizes the scroll range and the affordance count.
  // It must never gate the clip: a viewport that stops clipping when it looks
  // too small grows to content height, which makes it look big enough to stop
  // clipping — a stable wrong answer that paints the summary over the border.
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const hiddenBelow = Math.max(0, maxScroll - scrollOffset);

  useInput((_input, key) => {
    if (key.return) {
      onComplete();
    }
    if (key.escape) {
      onBack();
    }
    if (key.upArrow) setScrollOffset((prev) => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
  });

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexBasis={0}
      paddingX={1}
      borderStyle="single"
      borderColor={CLI_COLORS.NEUTRAL}
      borderDimColor
    >
      <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden">
        <Box
          ref={contentRef}
          flexDirection="column"
          flexShrink={0}
          marginTop={scrollOffset > 0 ? -scrollOffset : 0}
        >
          <SkillAgentSummary skillConfigs={skillConfigs} agentConfigs={agentConfigs} />
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={scrollOffset} hiddenBelow={hiddenBelow} />
    </Box>
  );
};
