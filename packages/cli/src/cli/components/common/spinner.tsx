import React from "react";
import { Text, type Instance } from "ink";
import { Spinner as InkSpinner } from "@inkjs/ui";
import { render } from "../render.js";

type SpinnerProps = {
  label: string;
};

export const Spinner: React.FC<SpinnerProps> = ({ label }) => <InkSpinner label={label} />;

/**
 * Awaits `load` behind a spinner and takes the spinner down whichever way the await ends, leaving
 * the terminal as it found it — what `init` and `edit` render next is a wizard sized to the
 * terminal's full height, so one line left above it pushes the wizard's top line off the screen.
 *
 * The cleanup is a `finally` because a load that refuses the run throws from inside this await,
 * and oclif would otherwise paint its error under an Ink tree still repainting over it. Never a
 * `catch`: the throw reaches the caller untouched, or both the error rendering and the exit code
 * change with it.
 */
export async function awaitUnderSpinner<T>(label: string, load: () => Promise<T>): Promise<T> {
  const spinner = render(<Spinner label={label} />);
  try {
    return await load();
  } finally {
    await takeDownWithoutTrace(spinner, label);
  }
}

/**
 * Stop the clock, paint what Ink is holding, and only then erase.
 *
 * Ink paints through a render throttle, and a spinner frame that arrives inside its window is
 * held rather than painted. `unmount()` paints whatever is held — so a spinner cleared with a
 * frame held was drawn again after the clear, where nothing erases it. A starved event loop is
 * what puts one there: a spinner tick that runs late is followed by the next one less than a
 * window later. Hence the order: the still line has no clock, so once it replaces the spinner no
 * new frame can be held; the flush paints anything already held; the clear then erases the last
 * thing painted, and `unmount()` finds nothing left to draw.
 */
async function takeDownWithoutTrace(spinner: Instance, label: string): Promise<void> {
  spinner.rerender(<Text>{label}</Text>);
  await spinner.waitUntilRenderFlush();
  spinner.clear();
  spinner.unmount();
}
