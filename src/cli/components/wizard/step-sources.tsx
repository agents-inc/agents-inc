import { Box, Text, useInput } from "ink";
import React, { useCallback, useState } from "react";
import { CLI_COLORS, DEFAULT_BRANDING, EJECT_SOURCE } from "../../consts.js";
import { FEATURE_FLAGS } from "../../lib/feature-flags.js";
import { resolveAllSources } from "../../lib/configuration/index.js";
import { searchExtraSources } from "../../lib/loading/multi-source-loader.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import type { BoundSkillCandidate, SkillAlias, SkillId } from "../../types/index.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { HOTKEY_SET_ALL_LOCAL, HOTKEY_SET_ALL_PLUGIN, isHotkey } from "./hotkeys.js";
import { SelectionCard } from "./selection-card.js";
import { SourceGrid } from "./source-grid.js";

export type StepSourcesProps = {
  projectDir?: string;
  onContinue: () => void;
  onBack: () => void;
};

type SourcesView = "choice" | "customize";

export const StepSources: React.FC<StepSourcesProps> = ({ projectDir, onContinue, onBack }) => {
  const store = useWizardStore();
  const [view, setView] = useState<SourcesView>(
    FEATURE_FLAGS.SOURCE_CHOICE ? "choice" : "customize",
  );
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [isGridSearching, setIsGridSearching] = useState(false);
  const { ref: gridRef, measuredHeight: gridHeight } = useMeasuredHeight();

  const handleGridSelect = useCallback(
    (skillId: SkillId, sourceId: string) => {
      store.setSourceSelection(skillId, sourceId);
    },
    [store],
  );

  const handleSearch = useCallback(
    async (alias: SkillAlias): Promise<BoundSkillCandidate[]> => {
      if (!projectDir) return [];
      try {
        const sources = await resolveAllSources(projectDir);
        return await searchExtraSources(alias, sources.extras);
      } catch {
        return [];
      }
    },
    [projectDir],
  );

  const handleBind = useCallback(
    (candidate: BoundSkillCandidate) => {
      store.bindSkill({
        id: candidate.id,
        sourceUrl: candidate.sourceUrl,
        sourceName: candidate.sourceName,
        boundTo: candidate.alias,
        description: candidate.description,
      });
    },
    [store],
  );

  const handleSearchStateChange = useCallback((active: boolean) => {
    setIsGridSearching(active);
  }, []);

  useInput((input, key) => {
    if (view === "choice") {
      if (key.return) {
        if (choiceIndex === 0) {
          onContinue();
        } else {
          store.setCustomizeSources(true);
          setView("customize");
        }
      }
      if (key.escape) {
        onBack();
      }
      if (key.upArrow || key.downArrow) {
        setChoiceIndex((prev) => (prev === 0 ? 1 : 0));
      }
    } else if (view === "customize") {
      if (isGridSearching) return;

      if (isHotkey(input, HOTKEY_SET_ALL_LOCAL)) {
        store.setAllSourcesEject();
      }
      if (isHotkey(input, HOTKEY_SET_ALL_PLUGIN)) {
        store.setAllSourcesPlugin();
      }
      if (key.return) {
        onContinue();
      }
      if (key.escape) {
        if (FEATURE_FLAGS.SOURCE_CHOICE) {
          store.setCustomizeSources(false);
          setView("choice");
        } else {
          onBack();
        }
      }
    }
  });

  if (view === "customize") {
    const rows = store.buildSourceRows();
    return (
      <Box ref={gridRef} flexGrow={1} flexBasis={0}>
        <SourceGrid
          rows={rows}
          availableHeight={gridHeight}
          onSelect={handleGridSelect}
          onSearch={FEATURE_FLAGS.SOURCE_SEARCH ? handleSearch : undefined}
          onBind={FEATURE_FLAGS.SOURCE_SEARCH ? handleBind : undefined}
          onSearchStateChange={FEATURE_FLAGS.SOURCE_SEARCH ? handleSearchStateChange : undefined}
        />
      </Box>
    );
  }

  const selectedTechnologies = store.getAllSelectedTechnologies();
  const rows = store.buildSourceRows();
  const isRecommendedSelected = choiceIndex === 0;
  const hasLocalSkills = rows.some((row) =>
    row.options.some((o) => o.installed && o.id === EJECT_SOURCE),
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text>
        Your stack includes{" "}
        <Text color={CLI_COLORS.PRIMARY} bold>
          {selectedTechnologies.length}
        </Text>{" "}
        technologies.
      </Text>
      <Text> </Text>

      <SelectionCard
        label={
          hasLocalSkills ? "Use installed skill sources" : "Use all recommended skills (verified)"
        }
        description={
          hasLocalSkills
            ? "Keep your current local and public skill selections."
            : [
                `This is the fastest option. All skills are verified and maintained by ${DEFAULT_BRANDING.NAME}`,
              ]
        }
        isFocused={isRecommendedSelected}
        marginBottom={1}
      />

      <SelectionCard
        label="Customize skill sources"
        description="Choose alternative skills for each technology"
        isFocused={!isRecommendedSelected}
      />
    </Box>
  );
};
