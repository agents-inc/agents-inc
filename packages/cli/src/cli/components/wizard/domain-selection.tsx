import React, { useMemo } from "react";
import { unique } from "remeda";
import { useWizardStore } from "../../stores/wizard-store.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import type { Domain } from "../../types/index.js";
import { typedEntries } from "../../utils/typed-object.js";
import { CheckboxGrid, type CheckboxItem } from "./checkbox-grid.js";
import { BUILT_IN_DOMAIN_DESCRIPTIONS, getDomainDisplayName, orderDomains } from "./utils.js";

export const DomainSelection: React.FC = () => {
  const { selectedDomains, toggleDomain, setStep, setApproach, selectStack, goBack } =
    useWizardStore();

  const availableDomains = useMemo((): CheckboxItem<Domain>[] => {
    const matrixDomains = unique(
      typedEntries(matrix.categories)
        .map(([, cat]) => cat?.domain)
        .filter((d): d is Domain => d != null),
    );

    const ordered = orderDomains(matrixDomains);

    return ordered.map((domain) => ({
      id: domain,
      label: getDomainDisplayName(domain),
      description: BUILT_IN_DOMAIN_DESCRIPTIONS[domain],
    }));
    // `matrix` is a module-level value, not reactive state — mutating it never
    // re-renders anything, so listing it promised a recomputation that cannot
    // happen. It is initialised once before the wizard mounts.
  }, []);

  const handleBack = () => {
    setApproach(null);
    selectStack(null);
    goBack();
  };

  return (
    <CheckboxGrid
      items={availableDomains}
      selectedIds={selectedDomains}
      onToggle={toggleDomain}
      onContinue={() => setStep("build")}
      onBack={handleBack}
      emptyMessage="Please select at least one domain"
    />
  );
};
