import React from "react";
import { render } from "ink";
import { Wizard, type WizardProps, type WizardResultV2 } from "./wizard.js";
import { hydrateWizardStore, type HydrateOptions } from "../../stores/wizard-store.js";

export type WizardSessionOptions = {
  hydrate: HydrateOptions;
  props: Omit<WizardProps, "onComplete" | "onCancel">;
  onCancel: () => void;
  /** Command-owned terminal reset, run after the Ink render unmounts. */
  clearTerminal: () => void;
};

/**
 * Runs one full wizard session: hydrate the store, render the wizard, wait
 * for exit, clear the screen, and return the result — or null when cancelled.
 */
export async function runWizardSession(
  options: WizardSessionOptions,
): Promise<WizardResultV2 | null> {
  hydrateWizardStore(options.hydrate);

  let wizardResult: WizardResultV2 | null = null;
  // Read through a function boundary: onComplete mutates wizardResult inside the
  // closure before waitUntilExit resolves, which TS's flow narrowing can't track
  const readResult = (): WizardResultV2 | null => wizardResult;

  const { waitUntilExit, clear } = render(
    <Wizard
      {...options.props}
      onComplete={(result) => {
        wizardResult = result;
      }}
      onCancel={options.onCancel}
    />,
  );

  await waitUntilExit();
  clear();
  options.clearTerminal();

  const result = readResult();
  return !result || result.cancelled ? null : result;
}
