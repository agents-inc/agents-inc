import { Box, Text, type DOMElement, measureElement, useInput } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { CLI_COLORS, DEFAULT_PUBLIC_SOURCE_NAME, formatSourceDisplayName } from "../../consts.js";
import { findStack } from "../../lib/matrix/matrix-provider.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { ScrollAffordance } from "./scroll-affordance.js";
import { SkillAgentSummary } from "./skill-agent-summary.js";

export const InfoPanel: React.FC = () => {
  const skillConfigs = useWizardStore((s) => s.skillConfigs);
  const agentConfigs = useWizardStore((s) => s.agentConfigs);
  const selectedStackId = useWizardStore((s) => s.selectedStackId);
  const enabledSources = useWizardStore((s) => s.enabledSources);
  // Measured on the clipping box itself, inside the border and padding, so it
  // is the height the summary actually gets.
  const { ref: viewportRef, measuredHeight: viewportHeight } = useMeasuredHeight();

  const stackName = selectedStackId ? (findStack(selectedStackId)?.name ?? selectedStackId) : null;

  const enabledSourceIds = Object.entries(enabledSources)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);

  const resolvedSourceIds =
    enabledSourceIds.length > 0 ? enabledSourceIds : [DEFAULT_PUBLIC_SOURCE_NAME];

  const sourceNames = resolvedSourceIds.map((id) => formatSourceDisplayName(id)).join(" · ");

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

  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const hiddenBelow = Math.max(0, maxScroll - scrollOffset);

  useInput((_input, key) => {
    if (key.upArrow) setScrollOffset((prev) => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
  });

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={CLI_COLORS.NEUTRAL}
      paddingX={2}
      paddingY={1}
    >
      <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden">
        <Box
          ref={contentRef}
          flexDirection="column"
          flexShrink={0}
          marginTop={scrollOffset > 0 ? -scrollOffset : 0}
        >
          {/* Header */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderBottom={true}
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor={CLI_COLORS.NEUTRAL}
            borderBottomDimColor
            paddingBottom={1}
            marginBottom={1}
          >
            <Box flexDirection="row" columnGap={1}>
              <Text color={CLI_COLORS.WARNING} bold>
                Marketplace
              </Text>
              <Text color={CLI_COLORS.NEUTRAL}>{sourceNames}</Text>
            </Box>
            <Box flexDirection="row" columnGap={1}>
              <Text color={CLI_COLORS.WARNING} bold>
                Stack
              </Text>
              <Text color={CLI_COLORS.NEUTRAL}>{stackName ?? "none"}</Text>
            </Box>
          </Box>

          {/* Summary — no availableHeight, InfoPanel handles scroll */}
          <Box width="100%">
            <SkillAgentSummary skillConfigs={skillConfigs} agentConfigs={agentConfigs} />
          </Box>
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={scrollOffset} hiddenBelow={hiddenBelow} />
    </Box>
  );
};
