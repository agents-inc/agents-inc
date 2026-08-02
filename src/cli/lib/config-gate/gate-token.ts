import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The write privilege for the global config pair (`~/.claude-src/config.ts` and
 * its `config-types.ts` sibling).
 *
 * AsyncLocalStorage rather than a module-level boolean: pair writes are async
 * and interleave, so a flag one write clears while another is still in flight
 * revokes a privilege that is still held. The store is scoped to the call tree
 * that opened it, which is exactly the grant being modelled.
 */
const gateToken = new AsyncLocalStorage<true>();

/**
 * Thrown when the global pair is written from outside the gate. Names the
 * offending path and the only supported entry point, because every occurrence
 * is a code path that must be moved rather than a user-recoverable condition.
 */
export class GlobalPairWriteViolation extends Error {
  constructor(targetPath: string) {
    super(
      `${targetPath} may only be written through config-gate — see src/cli/lib/config-gate/index.ts`,
    );
    this.name = "GlobalPairWriteViolation";
  }
}

/** Runs `fn` holding the pair-write privilege. */
export function withGateToken<T>(fn: () => Promise<T>): Promise<T> {
  return gateToken.run(true, fn);
}

/** True while the current async call tree holds the pair-write privilege. */
export function hasGateToken(): boolean {
  return gateToken.getStore() === true;
}

/** Throws unless the caller holds the pair-write privilege. */
export function assertGateToken(targetPath: string): void {
  if (hasGateToken()) return;
  throw new GlobalPairWriteViolation(targetPath);
}
