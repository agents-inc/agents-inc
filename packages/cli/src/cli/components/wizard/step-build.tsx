import { Box, useInput } from "ink";
import React, { useCallback, useMemo } from "react";
import type { Domain, SkillId, Category } from "../../types/index.js";
import { useCategoryRows } from "../hooks/use-category-rows.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { useWizardStore } from "../../stores/wizard-store.js";
import { validateBuildStep } from "../../lib/wizard/index.js";
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
  const setToastMessage = useWizardStore((s) => s.setToastMessage);
  // A domain nobody has opened yet holds no entry at all, which is the same state as one
  // opened and left empty — both are "nothing selected here" and both are what the advisory
  // below is about.
  const activeDomainSelections = useWizardStore((s) => s.domainSelections[activeDomain]);

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

  /**
   * Leaves the domain, naming any required category it leaves empty on the way out.
   *
   * The toast is set BEFORE `onContinue`, and survives it: `WizardLayout` paints the toast
   * outside `renderStep`, so unmounting this grid to move to the next domain — or to the
   * sources step — does not take the message with it.
   */
  const handleContinue = useCallback(() => {
    const validation = validateBuildStep(categories, activeDomainSelections ?? {});
    if (!validation.valid) {
      setToastMessage(validation.message);
    }
    onContinue();
  }, [categories, activeDomainSelections, setToastMessage, onContinue]);

  useInput((_input, key) => {
    if (key.return) {
      handleContinue();
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
