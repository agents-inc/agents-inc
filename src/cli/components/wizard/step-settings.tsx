import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { CLI_COLORS } from "../../consts.js";
import { Toast } from "./toast.js";
import { getSourceSummary, type SourceSummary } from "../../lib/configuration/source-manager.js";
import { DEFAULT_SOURCE } from "../../lib/configuration/config.js";
import { useKeyboardNavigation } from "../hooks/use-keyboard-navigation.js";
import { useModalState } from "../hooks/use-modal-state.js";
import { useRowScroll } from "../hooks/use-row-scroll.js";
import { useSourceOperations } from "../hooks/use-source-operations.js";
import { useTextInput } from "../hooks/use-text-input.js";
import { verbose } from "../../utils/logger.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  HOTKEY_ADD_SOURCE,
  HOTKEY_SETTINGS,
  KEY_LABEL_DEL,
  KEY_LABEL_ENTER,
  KEY_LABEL_ESC,
  isHotkey,
} from "./hotkeys.js";

const DEFAULT_SOURCE_NAME = "public";

/** Fixed lines around the source list: border top/bottom (2) */
const SOURCE_LIST_BORDER_LINES = 2;

export type StepSettingsProps = {
  projectDir: string;
  /** Available height in terminal lines for the scrollable source list. 0 = no constraint. */
  availableHeight?: number;
  onClose: () => void;
};

export const StepSettings: React.FC<StepSettingsProps> = ({
  projectDir,
  availableHeight = 0,
  onClose,
}) => {
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const addModal = useModalState();
  const {
    value: addSourceInput,
    setValue: setAddSourceInput,
    handleInput: handleTextInput,
  } = useTextInput("");
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const result = await getSourceSummary(projectDir);
      setSummary(result);
    } catch (error) {
      verbose(`Failed to load source summary: ${getErrorMessage(error)}`);
      setSummary({
        sources: [{ name: DEFAULT_SOURCE_NAME, url: DEFAULT_SOURCE, enabled: true }],
        localSkillCount: 0,
        pluginSkillCount: 0,
      });
    }
    setIsLoading(false);
  }, [projectDir]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const { handleAdd, handleRemove, statusMessage, clearStatus } = useSourceOperations(
    projectDir,
    loadSummary,
  );

  const sourceCount = summary?.sources.length ?? 0;

  const { focusedIndex, setFocusedIndex } = useKeyboardNavigation(
    sourceCount,
    { onEscape: onClose },
    { wrap: false, vimKeys: false, active: !addModal.isOpen },
  );

  // Compute scroll offset for source list
  const sourceViewportHeight =
    availableHeight > SOURCE_LIST_BORDER_LINES ? availableHeight - SOURCE_LIST_BORDER_LINES : 0;
  const { scrollEnabled, scrollTop } = useRowScroll({
    focusedIndex,
    itemCount: sourceCount,
    availableHeight: sourceViewportHeight,
  });

  useInput((input, key) => {
    if (statusMessage) {
      clearStatus();
    }

    if (addModal.isOpen) {
      if (key.escape) {
        addModal.close();
        setAddSourceInput("");
        return;
      }

      if (key.return) {
        if (addSourceInput.trim()) {
          addModal.close();
          setAddSourceInput("");
          void handleAdd(addSourceInput.trim());
        }
        return;
      }

      handleTextInput(input, key);
      return;
    }

    if (key.return) {
      // Toggle enabled/disabled is a placeholder for future enabledSources store integration
      return;
    }

    if (key.backspace || key.delete) {
      const source = summary?.sources[focusedIndex];
      if (!source || source.name === DEFAULT_SOURCE_NAME) return;
      void handleRemove(source.name).then((success) => {
        if (success) {
          setFocusedIndex((prev) => Math.max(0, prev - 1));
        }
      });
      return;
    }

    if (isHotkey(input, HOTKEY_ADD_SOURCE)) {
      addModal.open(true);
      setAddSourceInput("");
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" paddingX={2}>
        {/* <Toast>Skill Sources</Toast> */}
        <Text dimColor>Loading sources...</Text>
      </Box>
    );
  }

  const sourceElements = summary?.sources.map((source, index) => {
    const isFocused = index === focusedIndex && !addModal.isOpen;
    const isDefault = source.name === DEFAULT_SOURCE_NAME;
    const checkmark = source.enabled ? "\u2713" : " ";
    const displayName = isDefault ? "Public" : source.name;
    const suffix = isDefault ? " (default)" : "";

    return (
      <Box key={source.name} flexShrink={0}>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined} bold={isFocused}>
          {isFocused ? ">" : " "} {checkmark} {displayName}
        </Text>
        <Text dimColor>
          {"  "}
          {source.url}
          {suffix}
        </Text>
      </Box>
    );
  });

  return (
    <Box flexDirection="column" paddingX={2}>
      {/* <Toast>Skill Sources</Toast> */}
      <Box marginTop={1} />

      <Text bold>Configured marketplaces:</Text>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={CLI_COLORS.NEUTRAL}
        paddingX={1}
        marginTop={1}
      >
        <Box
          flexDirection="column"
          {...(scrollEnabled && { height: sourceViewportHeight, overflow: "hidden" as const })}
        >
          <Box
            flexDirection="column"
            marginTop={scrollTop > 0 ? -scrollTop : 0}
            {...(scrollEnabled && { flexShrink: 0 })}
          >
            {sourceElements}
          </Box>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={addModal.isOpen ? CLI_COLORS.PRIMARY : CLI_COLORS.NEUTRAL}
        paddingX={1}
        marginTop={1}
      >
        <Text color={addModal.isOpen ? CLI_COLORS.PRIMARY : undefined}>
          + Add source: {addModal.isOpen ? addSourceInput : ""}
          {addModal.isOpen ? "\u2588" : ""}
        </Text>
      </Box>

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={statusMessage.color}>{statusMessage.text}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Local skills: {summary?.localSkillCount ?? 0} in .claude/skills/</Text>
        <Text dimColor>Plugins: {summary?.pluginSkillCount ?? 0} from installed plugins</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {addModal.isOpen
            ? `${KEY_LABEL_ENTER} submit  ${KEY_LABEL_ESC} cancel`
            : `${HOTKEY_ADD_SOURCE.label} add  ${KEY_LABEL_DEL} remove  ${KEY_LABEL_ESC} or ${HOTKEY_SETTINGS.label} to close`}
        </Text>
      </Box>
    </Box>
  );
};
