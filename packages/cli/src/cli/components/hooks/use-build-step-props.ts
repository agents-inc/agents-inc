import { useCallback } from "react";
import { FALLBACK_DOMAIN } from "../../consts.js";
import type { Domain, SkillId } from "../../types/index.js";
import type { WizardState } from "../../stores/wizard-store.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import type { StepBuildProps } from "../wizard/step-build.js";

type UseBuildStepPropsOptions = {
  store: WizardState;
  installedSkillIds?: SkillId[];
};

export function useBuildStepProps({
  store,
  installedSkillIds,
}: UseBuildStepPropsOptions): StepBuildProps {
  const currentDomain = store.getCurrentDomain();
  const defaultDomains: Domain[] = [FALLBACK_DOMAIN];
  const effectiveDomains =
    store.selectedDomains.length > 0 ? store.selectedDomains : defaultDomains;

  const allSelections = store.getAllSelectedTechnologies();

  const activeDomain: Domain = currentDomain || effectiveDomains[0] || FALLBACK_DOMAIN;

  const onToggle = useCallback(
    (categoryId: Parameters<StepBuildProps["onToggle"]>[0], techId: SkillId) => {
      const domain: Domain = store.getCurrentDomain() || FALLBACK_DOMAIN;
      const cat = matrix.categories[categoryId];
      const exclusive = cat?.exclusive ?? true;
      store.toggleTechnology(domain, categoryId, techId, exclusive);
    },
    [store],
  );

  const onContinue = useCallback(() => {
    if (!store.nextDomain()) {
      store.setStep("sources");
    }
  }, [store]);

  const onBack = useCallback(() => {
    if (!store.prevDomain()) {
      store.goBack();
    }
  }, [store]);

  return {
    domain: activeDomain,
    selectedDomains: effectiveDomains,
    allSelections,
    showLabels: store.showLabels,
    installedSkillIds,
    onToggle,
    onToggleLabels: store.toggleShowLabels,
    onContinue,
    onBack,
  };
}
