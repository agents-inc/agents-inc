import { useState, useCallback } from "react";
import type { Key } from "ink";

const MIN_PRINTABLE_CHAR_CODE = 32;
const MAX_PRINTABLE_CHAR_CODE = 126;

type UseTextInputResult = {
  value: string;
  setValue: (value: string) => void;
  handleInput: (input: string, key: Key) => void;
};

/**
 * Encapsulates text input handling for terminal UIs:
 * backspace/delete to remove the last character, and
 * printable ASCII character filtering (codes 32-126).
 */
export function useTextInput(initialValue = ""): UseTextInputResult {
  const [value, setValue] = useState(initialValue);

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && input && input.length === 1) {
      const charCode = input.charCodeAt(0);
      if (charCode >= MIN_PRINTABLE_CHAR_CODE && charCode <= MAX_PRINTABLE_CHAR_CODE) {
        setValue((prev) => prev + input);
      }
    }
  }, []);

  return { value, setValue, handleInput };
}
