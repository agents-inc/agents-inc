/**
 * Which directory is the global HOME for an installation rooted at `dir`.
 *
 * One definition, because it was two. `CLI.run` in `e2e/fixtures/cli.ts` decides the HOME the
 * spawned binary runs under, and `expectFourSurfaces` in `e2e/assertions/four-surfaces.ts` decides
 * the HOME it then reads — and the two have to agree or the assertion inspects a tree the command
 * never wrote. They agreed by both being written as the same fallback, which is agreement by
 * coincidence: 23 of 38 call sites omit `globalHome` entirely and are correct only because the two
 * expressions happen to match.
 *
 * **Never `os.homedir()`.** A spec's own process runs under the machine's home while the binary it
 * spawned runs under a temp one, so reading it there checks the wrong tree and passes anyway.
 */
export function globalHomeFor({
  dir,
  globalHome,
}: {
  dir: string;
  // `| undefined` rather than `?`: `exactOptionalPropertyTypes` is on, and both callers pass the
  // property through from an optional read, so the absent case arrives as an explicit undefined.
  globalHome?: string | undefined;
}): string {
  return globalHome ?? dir;
}
