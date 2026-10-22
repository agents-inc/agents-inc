import { AsyncLocalStorage } from "node:async_hooks";

/** AsyncLocalStorage, not a flag: pair writes interleave, so a flag could clear while held. */
const gateToken = new AsyncLocalStorage<true>();

export class GlobalPairWriteViolation extends Error {
  constructor(targetPath: string) {
    super(
      `${targetPath} may only be written through config-gate — see src/cli/lib/config-gate/index.ts`,
    );
    this.name = "GlobalPairWriteViolation";
  }
}

export function withGateToken<T>(fn: () => Promise<T>): Promise<T> {
  return gateToken.run(true, fn);
}

function hasGateToken(): boolean {
  return gateToken.getStore() === true;
}

export function assertGateToken(targetPath: string): void {
  if (hasGateToken()) return;
  throw new GlobalPairWriteViolation(targetPath);
}
