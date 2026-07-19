import { Box, useInput } from "ink";
import React, { useCallback, useMemo } from "react";
import type { Domain, SkillId, Category, CategorySelections } from "../../types/index.js";
import { useFrameworkFiltering } from "../hooks/use-framework-filtering.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { CategoryGrid } from "./category-grid.js";

export type StepBuildProps = {
  domain: Domain;
  selectedDomains: Domain[];
  selections: CategorySelections;
  allSelections: SkillId[];
  showLabels: boolean;
  filterIncompatible: boolean;
  /** Skill IDs already installed on disk, shown with a dimmed checkmark */
  installedSkillIds?: SkillId[];
  onToggle: (categoryId: Category, technologyId: SkillId) => void;
  onToggleLabels: () => void;
  onToggleFilterIncompatible: () => void;
  onContinue: () => void;
  onBack: () => void;
};

export const StepBuild: React.FC<StepBuildProps> = ({
  domain: activeDomain,
  selectedDomains,
  selections,
  allSelections,
  showLabels,
  filterIncompatible,
  installedSkillIds,
  onToggle,
  onToggleLabels,
  onToggleFilterIncompatible,
  onContinue,
  onBack,
}) => {
  const { ref: gridRef, measuredHeight: gridHeight } = useMeasuredHeight();
  const skillConfigs = useWizardStore((s) => s.skillConfigs);

  const handleFocusedSkillChange = useCallback(
    (id: SkillId | null) => useWizardStore.getState().setFocusedSkillId(id),
    [],
  );

  const categories = useFrameworkFiltering({
    domain: activeDomain,
    allSelections,
    selections,
    installedSkillIds,
    skillConfigs,
    filterIncompatible,
  });

  const { initialRow, initialCol } = useMemo(() => {
    const skillId = useWizardStore.getState().focusedSkillId;
    if (!skillId) return { initialRow: 0, initialCol: 0 };
    const row = categories.findIndex((cat) => cat.options.some((o) => o.id === skillId));
    if (row < 0) return { initialRow: 0, initialCol: 0 };
    return {
      initialRow: row,
      initialCol: categories[row].options.findIndex((o) => o.id === skillId),
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
          onToggleFilterIncompatible={onToggleFilterIncompatible}
          onFocusedSkillChange={handleFocusedSkillChange}
        />
      </Box>
    </Box>
  );
};
