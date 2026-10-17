import { useState, useEffect } from "react";
import { useStdout } from "ink";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;

export type TerminalDimensions = {
  columns: number;
  rows: number;
};

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
