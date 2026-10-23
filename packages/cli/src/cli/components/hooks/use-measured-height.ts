import { useRef, useState, useEffect } from "react";
import { type DOMElement, measureElement, useStdout } from "ink";

/** Attach to a `flexGrow={1}` Box under an ancestor of constrained height; 0 before first layout. */
export function useMeasuredHeight(): {
  ref: React.Ref<DOMElement>;
  measuredHeight: number;
} {
  const ref = useRef<DOMElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const { stdout } = useStdout();

  const measure = () => {
    if (!ref.current) return;
    const { height } = measureElement(ref.current);
    setMeasuredHeight((prev) => (prev !== height ? height : prev));
  };

  // Every render, so late-mounted refs are picked up.
  useEffect(() => {
    measure();
  });

  // Yoga may not have laid out yet on first render, so retry a few times.
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
    // Mount-only: listing `measure` would re-arm the timers every render.
  }, []);

  useEffect(() => {
    stdout.on("resize", measure);
    return () => {
      stdout.off("resize", measure);
    };
  }, [stdout]);

  return { ref, measuredHeight };
}
