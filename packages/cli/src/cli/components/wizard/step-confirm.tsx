import { useInput } from "ink";
import React from "react";
import { SummaryPanel } from "./summary-panel.js";

type StepConfirmProps = {
  onComplete: () => void;
  onBack: () => void;
};

/**
 * Final step: the shared `SummaryPanel`, which owns the scroll and the `↑`/`↓`
 * keys. This claims only the two keys that leave the step, so both `useInput`
 * hooks stay on disjoint keys.
 */
export const StepConfirm: React.FC<StepConfirmProps> = ({ onComplete, onBack }) => {
  useInput((_input, key) => {
    if (key.return) {
      onComplete();
    }
    if (key.escape) {
      onBack();
    }
  });

  return <SummaryPanel />;
};
