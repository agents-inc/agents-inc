export type ProjectHandle = {
  dir: string;
  /** HOME for global-scoped content; `CLI.run` runs under it. Defaults to `dir`. */
  globalHome?: string;
};
