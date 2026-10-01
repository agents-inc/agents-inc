/**
 * The source folder's RELATIVE names, which is the whole of what this package
 * may hold about it.
 *
 * One installation is exactly one provider and the FOLDER is what says which —
 * nothing inside `config.ts` records it — so the folder segment IS the
 * provider's own value. Everything that reads the machine to turn these names
 * into a directory lives in the CLI's `lib/installation/install-layout.ts`; this
 * file is the half a browser can hold, the same split `paths.ts` already makes.
 */

import { SOURCE_ROOT_DIR } from "./paths.js"

/**
 * Every provider an installation can belong to, and therefore every folder name
 * `.agents-inc/` may hold that belongs to this product.
 *
 * A closed roster rather than "whatever subdirectories exist": a repository's
 * own tooling keeps state under the same parent — the benchmark's hand gate
 * writes `baseline.json` and `attempts/` there — and reading those as providers
 * would take a legacy installation's config away from it on the strength of a
 * file nothing here wrote.
 */
export const PROVIDERS = ["claude", "codex"] as const

export type Provider = (typeof PROVIDERS)[number]

/**
 * There is deliberately NO default provider here, and there was one until C2.
 *
 * `DEFAULT_PROVIDER` was the one place this product hard-coded a provider, and
 * every path builder that left the question unasked reached it. Deleting it
 * turned "which call sites still assume Claude" from a census that goes stale
 * into a compiler error apiece — and keeping the constant would leave the next
 * path builder a default to take, which is how the census would have to be run
 * by hand all over again. A caller that renders for no installation names the
 * provider it is rendering FOR, beside its own reason.
 */

/**
 * The folder a provider's source lives in, relative to the root it sits under.
 *
 * POSIX-separated, because it is a NAME rather than a path: it is written into
 * manifests, shown to users and rendered by a browser that has no `path.join`.
 * The CLI joins it against a root through `sourceDir` in `install-layout.ts`.
 */
export function sourceDirName(provider: Provider): string {
  return `${SOURCE_ROOT_DIR}/${provider}`
}
