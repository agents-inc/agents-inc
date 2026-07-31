import { useRef, useState, useEffect } from "react";
import { type DOMElement, measureElement, useStdout } from "ink";

/**
 * Measures the computed height of a Box element using Ink's Yoga layout engine.
 *
 * Returns a ref to attach to a Box with `flexGrow={1}` and the measured height.
 * The Box must be inside a parent chain with a constrained height (e.g., an
 * explicit `height` prop on an ancestor) so Yoga can compute the remaining space.
 *
 * Returns 0 before the first layout pass. Re-measures on terminal resize.
 */
export function useMeasuredHeight(): {
  ref: React.Ref<DOMElement>;
  measuredHeight: number;
} {
  const ref = useRef<DOMElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const { stdout } = useStdout();

  const measure = () => {
    if (ref.current) {
      const { height } = measureElement(ref.current);
      setMeasuredHeight((prev) => (prev !== height ? height : prev));
    }
  };

  // Re-measure after every render so late-mounted refs (e.g., Sources
  // step switching from "choice" to "customize" view) get picked up.
  // The state setter avoids unnecessary updates when height is unchanged.
  useEffect(() => {
    measure();
  });

  // Yoga may not have computed the layout on the first render, so
  // measureElement() returns 0. Retry with increasing delays to give
  // Yoga time to resolve the full flex constraint chain.
  useEffect(() => {
    const RETRY_DELAYS_MS = [0, 16, 50];
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const delay of RETRY_DELAYS_MS) {
      timers.push(setTimeout(measure, delay));
    }

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
    // Deps are deliberately empty: this is a mount-only retry ladder. `measure`
    // is re-created every render, so listing it would re-arm the timers on every
    // render instead of once.
  }, []);

  useEffect(() => {
    stdout.on("resize", measure);
    return () => {
      stdout.off("resize", measure);
    };
  }, [stdout]);

  return { ref, measuredHeight };
}
