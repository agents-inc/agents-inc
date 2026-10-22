import { useState, useEffect } from "react";
import { useStdout } from "ink";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export type TerminalDimensions = {
  columns: number;
  rows: number;
};

/** A stream that is not a terminal reports no size, so it gets the defaults. */
export function dimensionsOf(stdout: NodeJS.WriteStream): TerminalDimensions {
  return {
    columns: stdout.columns || DEFAULT_COLUMNS,
    rows: stdout.rows || DEFAULT_ROWS,
  };
}

export function useTerminalDimensions(): TerminalDimensions {
  const { stdout } = useStdout();

  const [dimensions, setDimensions] = useState<TerminalDimensions>(() => dimensionsOf(stdout));

  useEffect(() => {
    const handleResize = () => {
      setDimensions(dimensionsOf(stdout));
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return dimensions;
}
