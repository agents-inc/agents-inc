import React from "react";
import { promptValue } from "../common/prompt-confirm.js";
import { Wizard, type WizardProps, type WizardResultV2 } from "./wizard.js";
import { hydrateWizardStore, type HydrateOptions } from "../../stores/wizard-store.js";
import {
  disableBuffering,
  drainBuffer,
  enableBuffering,
  type StartupMessage,
} from "../../utils/logger.js";

export type WizardSessionOptions = {
  hydrate: HydrateOptions;
  props: Omit<WizardProps, "onComplete" | "onCancel">;
  onCancel: () => void;
  /** Command-owned terminal reset, run after the Ink render unmounts. */
  clearTerminal: () => void;
};

/**
 * Hydration under buffer mode, with everything it said appended to the band the load filled.
 *
 * Hydration WARNS: `populateFromSkillIds` reports every installed skill the loaded source no
 * longer carries, and every one whose category no domain claims. Both are routine, both exist
 * to hand the user a remedy, and both were unreadable — the load's buffer is drained back in
 * `lib/operations/source/load-source.ts`, so by the time the store populates, `warn()` is a
 * plain stderr write again. Written there it survives nothing: the wizard's first frame is
 * built to the height of the terminal, so it pushes those lines off the top of the screen the
 * moment it paints. A warning raised between the load's drain and the mount has no surface but
 * this band, which is why the window reopens here rather than the message finding another way
 * out.
 *
 * The load's own messages are passed in and concatenated rather than left in the buffer,
 * because {@link enableBuffering} resets it — this is a second window, not the first one held
 * open. Holding one window across both would have to span two modules and the command's own
 * `this.error()` paths, where no `finally` can reach it.
 *
 * And that `finally` is the point of the try: buffer mode is process-wide, so hydration
 * throwing while it is on would swallow every `warn()` for the rest of the run.
 */
function hydrateIntoStartupBand(
  hydrate: HydrateOptions,
  loaded: StartupMessage[] = [],
): StartupMessage[] {
  enableBuffering();
  try {
    hydrateWizardStore(hydrate);
    return [...loaded, ...drainBuffer()];
  } finally {
    disableBuffering();
  }
}

/**
 * Runs one full wizard session: hydrate the store, render the wizard, clear the
 * screen, and return the selection — or null when it was cancelled.
 *
 * The three endings settle the same promise, first one winning: the wizard completed,
 * the wizard was cancelled, or the Ink app exited having chosen neither (Ctrl+C, or a
 * render that failed). Only the first carries a selection, so the other two are `null`
 * — `onExit` for the ending no callback announces.
 *
 * The command's own cancellation notice runs BEFORE the resolve, because resolving is
 * what clears the screen: printed after, it would be wiped by the repaint it caused.
 */
export async function runWizardSession(
  options: WizardSessionOptions,
): Promise<WizardResultV2 | null> {
  const startupMessages = hydrateIntoStartupBand(options.hydrate, options.props.startupMessages);

  const result = await promptValue<WizardResultV2 | null>(
    (resolve) => (
      <Wizard
        {...options.props}
        startupMessages={startupMessages}
        onComplete={resolve}
        onCancel={() => {
          options.onCancel();
          resolve(null);
        }}
      />
    ),
    { onExit: null, clearOnResolve: true },
  );

  options.clearTerminal();

  return !result || result.cancelled ? null : result;
}
