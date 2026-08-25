import { Box, useInput } from "ink";
import React, { useCallback, useMemo } from "react";
import type { Domain, SkillId, Category } from "../../types/index.js";
import { useCategoryRows } from "../hooks/use-category-rows.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { CategoryGrid } from "./category-grid.js";

export type StepBuildProps = {
  domain: Domain;
  selectedDomains: Domain[];
  allSelections: SkillId[];
  showLabels: boolean;
  /** Skill IDs already installed on disk, shown with a dimmed checkmark */
  installedSkillIds?: SkillId[] | undefined;
  onToggle: (categoryId: Category, technologyId: SkillId) => void;
  onToggleLabels: () => void;
  onContinue: () => void;
  onBack: () => void;
};

export const StepBuild: React.FC<StepBuildProps> = ({
  domain: activeDomain,
  allSelections,
  showLabels,
  installedSkillIds,
  onToggle,
  onToggleLabels,
  onContinue,
  onBack,
}) => {
  const { ref: gridRef, measuredHeight: gridHeight } = useMeasuredHeight();
  const skillConfigs = useWizardStore((s) => s.skillConfigs);

  const handleFocusedSkillChange = useCallback(
    (id: SkillId | null) => useWizardStore.getState().setFocusedSkillId(id),
    [],
  );

  const categories = useCategoryRows({
    domain: activeDomain,
    allSelections,
    ...(installedSkillIds !== undefined && { installedSkillIds }),
    skillConfigs,
  });

  const { initialRow, initialCol } = useMemo(() => {
    const skillId = useWizardStore.getState().focusedSkillId;
    if (!skillId) return { initialRow: 0, initialCol: 0 };
    const row = categories.findIndex((cat) => cat.options.some((o) => o.id === skillId));
    const focusedCategory = categories[row];
    if (!focusedCategory) return { initialRow: 0, initialCol: 0 };
    return {
      initialRow: row,
      initialCol: focusedCategory.options.findIndex((o) => o.id === skillId),
    };
  }, [categories]);

  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    } else if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} flexBasis={0}>
      <Box ref={gridRef} flexGrow={1} flexBasis={0}>
        <CategoryGrid
          key={activeDomain}
          categories={categories}
          availableHeight={gridHeight}
          showLabels={showLabels}
          defaultFocusedRow={initialRow}
          defaultFocusedCol={initialCol}
          onToggle={onToggle}
          onToggleLabels={onToggleLabels}
          onFocusedSkillChange={handleFocusedSkillChange}
        />
      </Box>
    </Box>
  );
};
