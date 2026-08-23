export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  NETWORK_ERROR: 3,
  CANCELLED: 4,
  /**
   * The command ran to the end and part of what it set out to do did not happen.
   *
   * Distinct from {@link EXIT_CODES.ERROR} because the two ask opposite things of whoever reads
   * them: an `ERROR` aborted, so nothing landed and the run can be repeated; this one landed and
   * the repeat is the wrong move — what is owed is the remedy the output names, per failure.
   * Collapsing it into `ERROR` would re-make the defect it exists to close one value along, and
   * a spec asserting `not.toBe(0)` cannot tell a refusal from a partial apply either.
   *
   * It is raised at the END of a command, never mid-flight: the work completes first, which is
   * the whole difference between this and `this.error`.
   */
  COMPLETED_WITH_FAILURES: 5,
} as const;
