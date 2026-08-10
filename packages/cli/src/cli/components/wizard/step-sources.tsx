import { Box, useInput } from "ink";
import React, { useCallback } from "react";
import { useWizardStore } from "../../stores/wizard-store.js";
import type { InstallMode, SkillId } from "../../types/index.js";
import { useMeasuredHeight } from "../hooks/use-measured-height.js";
import { isRowInert, SourceGrid } from "./source-grid.js";

export type StepSourcesProps = {
  onContinue: () => void;
  onBack: () => void;
};

export const StepSources: React.FC<StepSourcesProps> = ({ onContinue, onBack }) => {
  const store = useWizardStore();
  const { ref: gridRef, measuredHeight: gridHeight } = useMeasuredHeight();

  const handleGridSelect = useCallback(
    (skillId: SkillId, mode: Exclude<InstallMode, "mixed">) => {
      // Thread the acting scope from the editable Sources row: a dual-scope skill renders only
      // its project row here, so the switch targets the project entry and leaves the masked
      // global tombstone untouched. SourceGrid only fires onSelect for non-inert rows, so the
      // sole editable row for this skill carries the acting scope.
      const actingRow = store
        .buildSourceRows()
        .find((row) => row.skillId === skillId && !isRowInert(row));
      store.setInstallMode(skillId, mode, actingRow?.scope);
    },
    [store],
  );

  // No character hotkeys. The step's only install-mode surface is SourceGrid's per-row
  // SPACE, which returns on an inert row — so a locked global row cannot be committed
  // from here at all. The withdrawn bulk keys `l` / `p` had no such containment.
  useInput((_input, key) => {
    if (key.return) {
      onContinue();
    }
    if (key.escape) {
      onBack();
    }
  });

  return (
    <Box ref={gridRef} flexGrow={1} flexBasis={0}>
      <SourceGrid
        rows={store.buildSourceRows()}
        availableHeight={gridHeight}
        onSelect={handleGridSelect}
      />
    </Box>
  );
};
