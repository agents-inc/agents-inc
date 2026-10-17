export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  NETWORK_ERROR: 3,
  CANCELLED: 4,
  /**
   * Ran to the end but part of the work failed. Unlike ERROR the work landed, so repeating the run
   * is wrong; the output names the remedy. Raised at the end of a command, never mid-flight.
   */
  COMPLETED_WITH_FAILURES: 5,
} as const;
