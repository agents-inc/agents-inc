/**
 * How far apart a processed-buffer read and a toast constant can sit and still be one assertion.
 *
 * Three lines in either direction. The shape this catches is a read, then the assertion on it —
 * one line apart in the site that produced the rule, three with a comment between them. Symmetric
 * because the read is sometimes hoisted above the press it is meant to follow, which is the same
 * defect written in the other order.
 */
const NEARBY_LINES = 3;

/** Every surface that returns xterm's PROCESSED buffer, which a repaint overwrites in place. */
const PROCESSED_BUFFER_READS = ["getOutput()", "getFullOutput()", "getScreen()"];

/** One buffer read that sits close enough to a toast constant to be asserting on it. */
export type ToastProximity = {
  /** 1-based, so it can be opened. */
  line: number;
  /** The read, as the line spells it. */
  read: string;
  /** The toast constant it sits beside. */
  toast: string;
};

/** Line numbers, 1-based, of every line holding any of `needles`. */
function linesHolding(lines: string[], needles: readonly string[]): { at: number; hit: string }[] {
  return lines.flatMap((line, index) => {
    const hit = needles.find((needle) => line.includes(needle));
    return hit === undefined ? [] : [{ at: index + 1, hit }];
  });
}

/**
 * Every place in `source` where a processed-buffer read sits within {@link NEARBY_LINES} of one of
 * `toastConstants`.
 *
 * A toast renders in an absolutely-positioned row Ink rewrites in place, so the processed buffer
 * holds it only while the frame carrying it is still the current one. Such a read passes or fails
 * on a race it does not control — which is the weakest possible evidence for the claim these
 * assertions exist to make, that a refusal is LOUD rather than a silent no-op.
 */
export function toastProximityIn(
  source: string,
  toastConstants: readonly string[],
): ToastProximity[] {
  const lines = source.split("\n");
  const reads = linesHolding(lines, PROCESSED_BUFFER_READS);
  const toasts = linesHolding(lines, toastConstants);

  return reads.flatMap((read) =>
    toasts
      .filter((toast) => Math.abs(toast.at - read.at) <= NEARBY_LINES)
      .map((toast) => ({ line: read.at, read: read.hit, toast: toast.hit })),
  );
}
