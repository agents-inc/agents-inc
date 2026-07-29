/** Message shown when a feature-flagged command is invoked while disabled. */
export function featureDisabledError(commandName: string): string {
  return `The \`${commandName}\` command is currently disabled while being improved.`;
}

export const FEATURE_FLAGS = {
  // Controls whether the search pill appears in the source grid (step-sources)
  SOURCE_SEARCH: false,
  // Controls whether the intermediate source choice screen is shown (recommended vs customize)
  SOURCE_CHOICE: false,
  // Controls whether the I key opens the info panel overlay
  INFO_PANEL: true,
  // Controls whether the F hotkey filters incompatible skills in the build step
  FILTER_INCOMPATIBLE: false,
  // Controls whether `cc new skill` is enabled
  NEW_SKILL_COMMAND: false,
  // Controls whether `cc new agent` is enabled
  NEW_AGENT_COMMAND: false,
  // Controls whether `cc new marketplace` is enabled
  NEW_MARKETPLACE_COMMAND: false,
} as const;
