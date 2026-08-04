import React from "react";
import { Box, Text } from "ink";
import type { BoundSkillCandidate } from "../../types/index.js";
import { CLI_COLORS } from "../../consts.js";
import { SelectList, type SelectListItem } from "../common/select-list.js";
import { KEY_LABEL_ARROWS_VERT, KEY_LABEL_ENTER, KEY_LABEL_ESC } from "./hotkeys.js";

export type SearchModalProps = {
  results: BoundSkillCandidate[];
  alias: string;
  onBind: (candidate: BoundSkillCandidate) => void;
  onClose: () => void;
  active?: boolean;
};

function candidateToItem(candidate: BoundSkillCandidate): SelectListItem<BoundSkillCandidate> {
  return {
    label: `${candidate.sourceName}/${candidate.id}`,
    value: candidate,
  };
}

export const SearchModal: React.FC<SearchModalProps> = ({
  results,
  alias,
  onBind,
  onClose,
  active,
}) => {
  const items = results.map(candidateToItem);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={CLI_COLORS.NEUTRAL}
      paddingX={1}
      paddingY={0}
      marginTop={1}
    >
      <Text bold>Search results for &quot;{alias}&quot;</Text>
      <Text> </Text>

      {results.length === 0 ? (
        <Text dimColor>No results found</Text>
      ) : (
        <SelectList
          items={items}
          onSelect={onBind}
          onCancel={onClose}
          active={active}
          renderItem={(item, isFocused) => (
            <>
              <Text bold={isFocused} color={isFocused ? CLI_COLORS.PRIMARY : undefined}>
                {item.label}
              </Text>
              {item.value.description && (
                <Text dimColor>
                  {"   "}
                  {item.value.description}
                </Text>
              )}
            </>
          )}
        />
      )}

      <Text> </Text>
      <Text dimColor>
        {KEY_LABEL_ARROWS_VERT} navigate {KEY_LABEL_ENTER} bind {KEY_LABEL_ESC} close
      </Text>
    </Box>
  );
};
