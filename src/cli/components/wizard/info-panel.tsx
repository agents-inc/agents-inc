import { Box, Text, type DOMElement, measureElement, useInput } from "ink";
import React, { useEffect, useRef, useState } from "react";
import {
  CLI_COLORS,
  DEFAULT_PUBLIC_SOURCE_NAME,
  formatSourceDisplayName,
  SCROLL_VIEWPORT,
} from "../../consts.js";
import { findStack } from "../../lib/matrix/matrix-provider.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { SkillAgentSummary } from "./skill-agent-summary.js";

export const InfoPanel: React.FC = () => {
  const skillConfigs = useWizardStore((s) => s.skillConfigs);
  const agentConfigs = useWizardStore((s) => s.agentConfigs);
  const selectedStackId = useWizardStore((s) => s.selectedStackId);
  const enabledSources = useWizardStore((s) => s.enabledSources);
  const { ref: panelRef, measuredHeight: panelHeight } = useMeasuredHeight();

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
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      setContentHeight((prev) => (prev !== height ? height : prev));
    }
  });

  const scrollEnabled = panelHeight >= SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS;
  const maxScroll = Math.max(0, contentHeight - panelHeight);

  useInput((_input, key) => {
    if (!scrollEnabled) return;
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
      <Box ref={panelRef} flexDirection="column" flexGrow={1} flexBasis={0}>
        <Box
          flexDirection="column"
          flexGrow={1}
          {...(scrollEnabled && { overflow: "hidden" as const })}
        >
          <Box
            ref={contentRef}
            flexDirection="column"
            marginTop={scrollOffset > 0 ? -scrollOffset : 0}
            {...(scrollEnabled && { flexShrink: 0 })}
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
      </Box>
    </Box>
  );
};
