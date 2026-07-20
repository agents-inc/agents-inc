import { useState, useCallback } from "react";
import { getErrorMessage } from "../../utils/errors.js";
import { addSource, removeSource } from "../../lib/configuration/source-manager.js";

/** Status variant — mapped to a CLI color at the render site (see step-settings). */
export type StatusVariant = "success" | "error";
type StatusMessage = { text: string; variant: StatusVariant } | null;

type UseSourceOperationsResult = {
  handleAdd: (url: string) => Promise<void>;
  handleRemove: (name: string) => Promise<boolean>;
  statusMessage: StatusMessage;
  clearStatus: () => void;
};

export function useSourceOperations(
  projectDir: string,
  onReload: () => Promise<void>,
): UseSourceOperationsResult {
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);

  const handleAdd = useCallback(
    async (url: string) => {
      try {
        const result = await addSource(projectDir, url);
        setStatusMessage({
          text: `Added "${result.name}" (${result.skillCount} skills)`,
          variant: "success",
        });
        await onReload();
      } catch (error) {
        const message = getErrorMessage(error);
        setStatusMessage({ text: `Failed to add source: ${message}`, variant: "error" });
      }
    },
    [projectDir, onReload],
  );

  const handleRemove = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        await removeSource(projectDir, name);
        setStatusMessage({ text: `Removed "${name}"`, variant: "success" });
        await onReload();
        return true;
      } catch (error) {
        const message = getErrorMessage(error);
        setStatusMessage({ text: `Failed to remove: ${message}`, variant: "error" });
        return false;
      }
    },
    [projectDir, onReload],
  );

  const clearStatus = useCallback(() => {
    setStatusMessage(null);
  }, []);

  return { handleAdd, handleRemove, statusMessage, clearStatus };
}
