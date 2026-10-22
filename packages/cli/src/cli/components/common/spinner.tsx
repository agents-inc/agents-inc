import React from "react";
import { Text, type Instance } from "ink";
import { Spinner } from "@inkjs/ui";
import { render } from "../render.js";

/** `finally`, never `catch`: a throw must reach the caller untouched, with the spinner gone. */
export async function awaitUnderSpinner<T>(label: string, load: () => Promise<T>): Promise<T> {
  const spinner = render(<Spinner label={label} />);
  try {
    return await load();
  } finally {
    await takeDownWithoutTrace(spinner, label);
  }
}

/**
 * Ink's throttle can hold a spinner frame that `unmount()` would paint after the clear. So: swap in
 * a still line (no clock), flush what is held, then clear and unmount.
 */
async function takeDownWithoutTrace(spinner: Instance, label: string): Promise<void> {
  spinner.rerender(<Text>{label}</Text>);
  await spinner.waitUntilRenderFlush();
  spinner.clear();
  spinner.unmount();
}
