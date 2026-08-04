import { useState, useEffect } from "react";
import { useStdout } from "ink";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export type TerminalDimensions = {
  /** Terminal width in columns */
  columns: number;
  /** Terminal height in rows */
  rows: number;
};

/**
 * Tracks terminal dimensions reactively. Re-renders on resize.
 *
 * Falls back to DEFAULT_COLUMNS x DEFAULT_ROWS when stdout is not a TTY
 * (e.g., piped output, CI environments, tests).
 */
export function useTerminalDimensions(): TerminalDimensions {
  const { stdout } = useStdout();

  const [dimensions, setDimensions] = useState<TerminalDimensions>(() => ({
    columns: stdout.columns || DEFAULT_COLUMNS,
    rows: stdout.rows || DEFAULT_ROWS,
  }));

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        columns: stdout.columns || DEFAULT_COLUMNS,
        rows: stdout.rows || DEFAULT_ROWS,
      });
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return dimensions;
}
