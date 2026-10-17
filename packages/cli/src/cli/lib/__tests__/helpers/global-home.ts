/** One definition, so the HOME a spawned binary runs under and the one an assertion reads agree. */
export function globalHomeFor({
  dir,
  globalHome,
}: {
  dir: string;
  // `| undefined`: callers forward an optional read under `exactOptionalPropertyTypes`.
  globalHome?: string | undefined;
}): string {
  return globalHome ?? dir;
}
