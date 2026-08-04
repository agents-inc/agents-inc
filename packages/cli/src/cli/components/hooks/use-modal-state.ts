import { useState, useCallback } from "react";

type UseModalStateResult<T> = {
  isOpen: boolean;
  context: T | null;
  open: (ctx: T) => void;
  close: () => void;
};

/**
 * Manages modal open/close lifecycle with optional typed context.
 * `open(ctx)` stores context and sets isOpen; `close()` resets both.
 */
export function useModalState<T = boolean>(): UseModalStateResult<T> {
  const [context, setContext] = useState<T | null>(null);

  const isOpen = context !== null;

  const open = useCallback((ctx: T) => {
    setContext(ctx);
  }, []);

  const close = useCallback(() => {
    setContext(null);
  }, []);

  return { isOpen, context, open, close };
}
