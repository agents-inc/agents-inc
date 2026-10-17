// The source folder's relative names; the folder segment is the provider. Machine-reading half is
// the CLI's `install-layout.ts`.

import { SOURCE_ROOT_DIR } from "./paths.js"

/** Closed: other tooling keeps state under `.agents-inc/` too. */
export const PROVIDERS = ["claude", "codex"] as const

export type Provider = (typeof PROVIDERS)[number]

// No default provider on purpose: every caller names the provider it renders for.

/** POSIX-separated: a name written into manifests and rendered by a browser. */
export function sourceDirName(provider: Provider): string {
  return `${SOURCE_ROOT_DIR}/${provider}`
}
