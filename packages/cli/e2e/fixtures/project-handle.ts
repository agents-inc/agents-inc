/** An installation a spec runs commands against. */
export type ProjectHandle = {
  dir: string;
  /**
   * The HOME this installation's global-scoped content lives under. `CLI.run` runs under it, so a
   * follow-up command reads the same global root the setup wrote; absent, that HOME is `dir`.
   */
  globalHome?: string;
};
