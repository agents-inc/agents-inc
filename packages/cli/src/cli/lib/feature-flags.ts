/** Message shown when a feature-flagged command is invoked while disabled. */
export function featureDisabledError(commandName: string): string {
  return `The \`${commandName}\` command is currently disabled while being improved.`;
}

/**
 * An `AGENTSINC_FLAG_<NAME>` environment variable overrides the default in
 * either direction; anything else — unset, or an unrecognised value — falls
 * back to it. The env read happens at module load, which is what makes gated
 * code reachable from tests: tsup inlines plain constants into the bundle, so
 * a `false` literal could never be mocked out of a compiled command, but a
 * `process.env` lookup survives bundling. E2E tests set the variable on the
 * child they spawn; unit tests set it before the module is first imported
 * (CLI-323).
 */
const envFlag = (name: string, defaultValue: boolean): boolean => {
  const value = process.env[`AGENTSINC_FLAG_${name}`];
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return defaultValue;
};

export const FEATURE_FLAGS = {
  // Controls whether the search pill appears in the source grid (step-sources)
  SOURCE_SEARCH: envFlag("SOURCE_SEARCH", false),
  // Controls whether the intermediate source choice screen is shown (recommended vs customize)
  SOURCE_CHOICE: envFlag("SOURCE_CHOICE", false),
  // D-307: controls whether the S key opens the marketplace-sources settings
  // overlay on the sources step. Off: the overlay is withdrawn, not merely
  // unadvertised. Before flipping it back on, fix the input capture that makes it
  // unusable — the wizard root's useInput intercepts S while showSettings is
  // true, including while the add-source TEXT INPUT is focused, so typing any URL
  // containing an "s" closes the overlay mid-word and spills the rest of the URL
  // into the sources grid (where l/p are hotkeys and Enter advances the step).
  WIZARD_SETTINGS_OVERLAY: envFlag("WIZARD_SETTINGS_OVERLAY", false),
  // Controls whether the I key opens the info panel overlay
  INFO_PANEL: envFlag("INFO_PANEL", true),
  // Controls whether the F hotkey filters incompatible skills in the build step
  FILTER_INCOMPATIBLE: envFlag("FILTER_INCOMPATIBLE", false),
  // Controls whether `cc new skill` is enabled
  NEW_SKILL_COMMAND: envFlag("NEW_SKILL_COMMAND", false),
  // Controls whether `cc new agent` is enabled
  NEW_AGENT_COMMAND: envFlag("NEW_AGENT_COMMAND", false),
  // Controls whether `cc new marketplace` is enabled
  NEW_MARKETPLACE_COMMAND: envFlag("NEW_MARKETPLACE_COMMAND", false),
} as const;
