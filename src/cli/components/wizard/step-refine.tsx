import { Box, Text, useInput } from "ink";
import React from "react";
import { CLI_COLORS, DEFAULT_BRANDING } from "../../consts.js";
import { KEY_LABEL_ENTER, KEY_LABEL_ESC, KEY_LABEL_ARROWS_VERT } from "./hotkeys.js";
import { Toast } from "./toast.js";
import { SelectionCard } from "./selection-card.js";

export type RefineAction = "all-recommended" | "customize" | null;

export type StepRefineProps = {
  technologyCount: number;
  refineAction: RefineAction;
  onSelectAction: (action: "all-recommended" | "customize") => void;
  onContinue: () => void;
  onBack: () => void;
};

export const StepRefine: React.FC<StepRefineProps> = ({
  technologyCount,
  refineAction,
  onSelectAction,
  onContinue,
  onBack,
}) => {
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
    if (key.escape) {
      onBack();
    }
    if (key.upArrow || key.downArrow) {
      onSelectAction(refineAction === "all-recommended" ? "customize" : "all-recommended");
    }
  });

  const isRecommendedSelected = refineAction === "all-recommended" || refineAction === null;

  return (
    <Box flexDirection="column" paddingX={2}>
      {/* <Toast>Refine your stack</Toast> */}
      <Text>
        Your stack includes{" "}
        <Text color={CLI_COLORS.PRIMARY} bold>
          {technologyCount}
        </Text>{" "}
        technologies.
      </Text>
      <Text> </Text>

      <SelectionCard
        label="Use all recommended skills (verified)"
        description={`This is the fastest option. All skills are verified and maintained by ${DEFAULT_BRANDING.NAME}`}
        isFocused={isRecommendedSelected}
        marginBottom={1}
      />

      <SelectionCard
        label="Customize skill sources"
        description="Choose alternative skills for each technology"
        isFocused={!isRecommendedSelected}
      />

      <Box marginTop={1}>
        <Text dimColor>
          {KEY_LABEL_ARROWS_VERT} navigate {KEY_LABEL_ENTER} continue {KEY_LABEL_ESC} back
        </Text>
      </Box>
    </Box>
  );
};
