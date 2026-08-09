import { DOMAIN_DESCRIPTIONS } from "@workspace/matrix";
import React, { useMemo } from "react";
import { unique } from "remeda";
import { useWizardStore } from "../../stores/wizard-store.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import type { Domain } from "../../types/index.js";
import { typedEntries } from "../../utils/typed-object.js";
import { CheckboxGrid, type CheckboxItem } from "./checkbox-grid.js";
import { getDomainDisplayName, orderDomains } from "./utils.js";

export const DomainSelection: React.FC = () => {
  const { selectedDomains, toggleDomain, setStep, setApproach, selectStack, goBack, history } =
    useWizardStore();

  const availableDomains = useMemo((): CheckboxItem<Domain>[] => {
    const matrixDomains = unique(
      typedEntries(matrix.categories)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
        .map(([, cat]) => cat?.domain)
        .filter((d): d is Domain => d != null),
    );

    const ordered = orderDomains(matrixDomains);

    return ordered.map((domain) => ({
      id: domain,
      label: getDomainDisplayName(domain),
      description: DOMAIN_DESCRIPTIONS[domain],
    }));
    // `matrix` is a module-level value, not reactive state — mutating it never
    // re-renders anything, so listing it promised a recomputation that cannot
    // happen. It is initialised once before the wizard mounts.
  }, []);

  // Going back means going back to the stack choice, so it clears the choice on
  // the way. When this step is the wizard's first — a source offering no stacks
  // has no stack step to return to — there is no choice to clear and nowhere to
  // go, and clearing anyway would wipe the selections in place.
  const handleBack = () => {
    if (history.length === 0) return;
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
