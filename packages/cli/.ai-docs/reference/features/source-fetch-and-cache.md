---
scope: reference
area: features
keywords:
  [
    source-fetcher,
    fetchFromSource,
    fetchFromLocalSource,
    fetchFromRemoteSource,
    fetchMarketplace,
    FetchOptions,
    FetchResult,
    sanitizeSourceForCache,
    getGigetCacheDir,
    clearGigetCache,
    createDetailedFetchError,
    giget,
    downloadTemplate,
    forceRefresh,
    fromCache,
    source-cache,
    CACHE_DIR,
    XDG_CACHE_HOME,
    GIGET_AUTH,
    loadSkillsByIds,
    loadSkillsFromDir,
    LoadSkillsFromDirOptions,
    loadPluginSkills,
    buildIdToDirectoryPathMap,
  ]
related:
  - reference/features/skills-and-matrix.md
  - reference/boundary-map.md
  - reference/utilities.md
  - reference/features/plugin-system.md
  - reference/features/operations-layer.md
  - reference/dependency-graph.md
last_validated: 2026-08-02
---

# Remote Source Fetch & Cache

## Overview

**Purpose:** Turn a configured source string (`github:org/repo`, `https://…`, `/abs/path`) into a
readable directory on disk, and keep the result cached so a second load costs no network.

**Files:**

| File                                    | Role                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/cli/lib/loading/source-fetcher.ts` | Fetch + cache. The only module in the repo that calls `giget`                                      |
| `src/cli/lib/loading/loader.ts`         | Reads skills/agents off whatever directory the fetcher produced (frontmatter, not matrix metadata) |
| `src/cli/consts.ts`                     | `CACHE_DIR`, `CACHE_HASH_LENGTH`, `CACHE_READABLE_PREFIX_LENGTH`                                   |
| `src/cli/lib/configuration/config.ts`   | `isLocalSource()` — decides which branch of `fetchFromSource` runs                                 |

### Ownership boundary

This doc is the **only** place the cache layer is documented. Three neighbouring topics are owned
elsewhere and are **not restated here** — cite the owner, do not copy the value:

| Topic                                                                                                 | Owner                                               |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `CACHE_DIR`'s value                                                                                   | `reference/utilities.md:389`                        |
| `marketplace.json` size / depth / schema chain, `MAX_MARKETPLACE_FILE_SIZE`, `MAX_JSON_NESTING_DEPTH` | `reference/boundary-map.md:221`, `:231-232`, `:559` |
| `SourceLoadOptions` (including what `forceRefresh` means to a wizard caller)                          | `reference/features/skills-and-matrix.md:246-253`   |

`reference/features/skills-and-matrix.md:100` carries the one-line inventory row for this file
("Fetch/cache remote sources via giget"); this doc is what that row points at.

## Public surface

| Export                     | Kind     | Declared in         | In `loading/index.ts` barrel? |
| -------------------------- | -------- | ------------------- | ----------------------------- |
| `FetchOptions`             | type     | `source-fetcher.ts` | yes                           |
| `FetchResult`              | type     | `source-fetcher.ts` | yes                           |
| `sanitizeSourceForCache`   | function | `source-fetcher.ts` | yes                           |
| `fetchFromSource`          | function | `source-fetcher.ts` | yes                           |
| `fetchMarketplace`         | function | `source-fetcher.ts` | yes                           |
| `getGigetCacheDir`         | function | `source-fetcher.ts` | **no**                        |
| `loadSkillsByIds`          | function | `loader.ts`         | yes                           |
| `LoadSkillsFromDirOptions` | type     | `loader.ts`         | yes                           |
| `loadSkillsFromDir`        | function | `loader.ts`         | yes                           |
| `loadPluginSkills`         | function | `loader.ts`         | yes                           |

**`getGigetCacheDir` is exported but not barrelled** — `src/cli/lib/loading/index.ts`'s
`./source-fetcher` block lists the other four exports and omits it. Its only production consumer is
the module-private `clearGigetCache` two functions below it; the `export` exists so `source-fetcher.test.ts` can pin the
path algorithm. Import it from `./source-fetcher` directly, or reconsider whether you need it —
see "The replicated algorithm" below.

Module-private in `source-fetcher.ts` (no `export`, no test reaches them directly): `getCacheDir`,
`fetchFromLocalSource`, `clearGigetCache`, `fetchFromRemoteSource`, `createDetailedFetchError`.

## `fetchFromSource` — the two-branch fork

```typescript
// source-fetcher.ts — fetchFromSource
export async function fetchFromSource(
  source: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const { forceRefresh = false, subdir } = options;

  if (isLocalSource(source)) {
    return fetchFromLocalSource(source, subdir);
  }

  return fetchFromRemoteSource(source, { forceRefresh, subdir });
}
```

```typescript
// source-fetcher.ts — FetchOptions / FetchResult
export type FetchOptions = { forceRefresh?: boolean; subdir?: string };
export type FetchResult = { path: string; fromCache: boolean; source: string };
```

| Field of `FetchOptions` | Default     | Read by                                                                                    |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `forceRefresh`          | `false`     | **remote branch only** — `fetchFromSource` passes `subdir` alone to `fetchFromLocalSource` |
| `subdir`                | `undefined` | both branches                                                                              |

| Field of `FetchResult` | Local branch                           | Remote branch                                                  |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `path`                 | absolute resolved dir (`absolutePath`) | `cacheDir` on a hit, `downloadTemplate().dir` otherwise        |
| `fromCache`            | **always `false`**                     | `true` only on the cache-hit return                            |
| `source`               | the **original** `source`              | `fullSource` — i.e. `source` + `/` + `subdir`, on both returns |

**The `source` field means different things on the two branches, and nothing reads it.** The local
branch echoes the argument; the remote branch echoes the subdir-joined `fullSource` on both of its
returns. Grep-verified: every production call site reads `.path` and/or `.fromCache` —
`loadFromRemote` (`source-loader.ts`), `fetchSourceSkills` (`multi-source-loader.ts`),
`fetchSkillSource` (`import/skill.ts`) — and none reads `.source`. Reconcile the two branches before
you start.

**Which branch runs is decided by `isLocalSource`, not by this module.**
`isLocalSource` in `src/cli/lib/configuration/config.ts`:

| Input shape                                                                                                                              | `isLocalSource` | Branch |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| starts with `/` or `.`                                                                                                                   | `true`          | local  |
| starts with a member of `REMOTE_PROTOCOLS` (`config.ts`: `github:`, `gh:`, `gitlab:`, `bitbucket:`, `sourcehut:`, `https://`, `http://`) | `false`         | remote |
| anything else (e.g. bare `myorg/myrepo`)                                                                                                 | `true`          | local  |
| anything else **containing `..` or `~`**                                                                                                 | _throws_        | —      |

The third row is load-bearing and counter-intuitive: **a protocol-less `org/repo` is treated as a
local path**, so it never reaches giget. See Trap 4.

### Local branch (`fetchFromLocalSource`)

1. `fullPath = subdir ? path.join(source, subdir) : source`.
2. `absolutePath = path.isAbsolute(fullPath) ? fullPath : path.resolve(process.cwd(), fullPath)`
   — **relative sources resolve against the process CWD**, not against `projectDir` and not against
   any config location. A relative source in a config file means "relative to wherever the user ran
   the command".
3. `directoryExists(absolutePath)` false → `throw new Error("Local source not found: '<abs>'")`.
   It is **not** routed through `createDetailedFetchError`; that translator wraps `downloadTemplate`
   rejections only, in `fetchFromRemoteSource`'s `catch`, so a local-source failure reaches the
   caller with this bare message and no remediation text.
4. Returns `{ path: absolutePath, fromCache: false, source }`.

There is no cache, no copy, and no write. A local source is used **in place**.

### Remote branch (`fetchFromRemoteSource`)

```
cacheDir   = getCacheDir(source)                       ← NOTE: source, not fullSource
fullSource = subdir ? `${source}/${subdir}` : source

if (!forceRefresh && await directoryExists(cacheDir))
    → return { path: cacheDir, fromCache: true, source: fullSource }
if (forceRefresh)
    → await clearGigetCache(source)                    (giget's tarball/ETag cache)
    → await remove(cacheDir)                           (our extracted copy)
await ensureDir(path.dirname(cacheDir))
await downloadTemplate(fullSource, { dir: cacheDir, force: true, offline: false })
    → return { path: result.dir, fromCache: false, source: fullSource }
    → catch → throw createDetailedFetchError(error, source)
```

**Cache validity is `directoryExists(cacheDir)` and nothing else.** No TTL, no ETag check,
no manifest, no emptiness check. An interrupted first fetch that left the directory behind is a
permanent cache hit until someone passes `forceRefresh` — see Trap 1.

`force: true` is passed unconditionally in the `downloadTemplate` call, with an inline reason
("Always force when downloading to avoid 'already exists' error"): giget refuses to write into a
non-empty `dir` otherwise, and the `ensureDir(path.dirname(cacheDir))` above it has just created the
parent.

`remove` (`src/cli/utils/fs.ts`) delegates to `fs-extra`, which is a no-op on a missing path,
so the `forceRefresh` teardown is safe on a cold cache.

## The cache key — `sanitizeSourceForCache`

```typescript
// source-fetcher.ts — sanitizeSourceForCache
export function sanitizeSourceForCache(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, CACHE_HASH_LENGTH);
  const readable = source
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, CACHE_READABLE_PREFIX_LENGTH);
  return readable ? `${readable}-${hash}` : hash;
}
```

| Property                       | Value                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Shape                          | `<readable>-<hash>`, or `<hash>` alone when the readable part sanitises to empty |
| `CACHE_HASH_LENGTH`            | 16 hex chars — `consts.ts`, commented "64 bits of collision resistance"          |
| `CACHE_READABLE_PREFIX_LENGTH` | 32 chars — `consts.ts`, commented "for debugging"                                |
| Max output length              | 32 + 1 + 16 = 49                                                                 |
| Character set                  | `[a-zA-Z0-9-]` only, for every input including Unicode                           |
| Determinism                    | pure function of `source`; no clock, no env, no fs                               |

**Why a hash at all, when the readable prefix already looks unique.** The prefix is lossy by
construction — every non-alphanumeric run collapses to a single `-`, so `github:user/repo` and
`github-user-repo` produce the _same_ prefix. The SHA-256 suffix is what actually separates them, and
`source-fetcher.test.ts`'s "should avoid collisions for sources that old regex approach would
collapse" exists specifically to pin that pair apart. Do not "simplify" this to the prefix alone.

**Two functions consume it:**

| Consumer                              | Where                       | Uses                                                        |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `getCacheDir` (module-private)        | `source-fetcher.ts`         | `path.join(CACHE_DIR, "sources", sanitized \|\| "unknown")` |
| `seedDefaultSourceCache` (E2E helper) | `e2e/helpers/test-utils.ts` | re-derives the same path under a fake `HOME`                |

`getGigetCacheDir` does **not** use it — that function reproduces giget's own naming, not ours.

The `|| "unknown"` fallback in `getCacheDir` is unreachable: `sanitizeSourceForCache` always returns
at least the 16-char hash, even for `""` (pinned by `source-fetcher.test.ts`'s "should handle empty
string input").

### Cache layout, and the two places it is encoded

```
$CACHE_DIR/sources/<sanitizeSourceForCache(source)>/        ← ours, extracted tree (getCacheDir)
<gigetCacheRoot>/<providerName>/<templateName>/*.tar.gz     ← giget's, tarball + ETag (getGigetCacheDir)
```

`CACHE_DIR` is owned by `reference/utilities.md:389`. `gigetCacheRoot` is `$XDG_CACHE_HOME/giget` when
that variable is set, else `~/.cache/giget` (`getGigetCacheDir`'s `gigetCacheRoot`).

**The `"sources"` path segment is written twice in the repo** — in `getCacheDir`
(`source-fetcher.ts`) and as `SOURCE_CACHE_SUBDIR` in `e2e/helpers/test-utils.ts`, whose comment
says "mirrors getCacheDir in source-fetcher.ts". The duplication exists because `getCacheDir` is
module-private. `e2e/interactive/sources-step-duplicate-marketplace-column.e2e.test.ts` records the
consequence in its own file header: if the two derivations drift, the seeded cache is never read,
the public-marketplace tagging pass silently no-ops, and that spec's assertions pass **vacuously**. Its only guard is the
`directoryExists` setup assertion on the value `seedDefaultSourceCache` returns.

## `getGigetCacheDir` — the replicated algorithm

This is the one piece of this module that a future agent must not treat as ordinary code.

```typescript
// source-fetcher.ts — getGigetCacheDir's doc comment (verbatim intent)
// Replicates giget's internal cache path logic:
//   `{cacheRoot}/{providerName}/{templateName}`
// where templateName is `repo.replace("/", "-")` sanitized to `[a-zA-Z0-9-]`.
// Returns undefined if the source format doesn't match giget's git URI pattern.
```

**It reimplements a private, unexported algorithm belonging to a dependency.** giget exposes no API
for "where did you put the tarball for this source", so the only way to invalidate giget's ETag cache
(`clearGigetCache`) is to compute the path the same way giget does and `rm -rf` it. Two of
this module's module-level regexes are **verbatim copies** of giget's:

| Our constant                                                                    | giget's                            | Match     |
| ------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| `SOURCE_PROTO_RE` `/^([\w-.]+):/`                                               | `sourceProtoRe`, giget dist `:250` | identical |
| `GIT_URI_RE` `/^(?<repo>[\w.-]+\/[\w.-]+)(?<subdir>[^#]+)?(?<ref>#[\w./@-]+)?/` | `inputRegex`, giget dist `:39`     | identical |

**Verified against the installed `giget@1.2.5`**. Line numbers below are in
`node_modules/giget/dist/shared/giget.BgKdRmJH.mjs`; **the chunk filename is content-hashed and will
change on any reinstall** — re-locate it by grepping for `cacheDirectory` under `node_modules/giget/dist/`.

| Step                          | giget                                                                                              | Our replica                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| cache root                    | `:68-69` `XDG_CACHE_HOME ? resolve($XDG_CACHE_HOME, "giget") : resolve(homedir(), ".cache/giget")` | `gigetCacheRoot` — same, `path.resolve` both ways            |
| provider name                 | `:262-265` from `sourceProtoRe`; `:266-268` `http`/`https` keep the whole input as source          | `protoMatch` / `providerName`                                |
| template name (git providers) | `:158`, `:174`, `:189` `parsed.repo.replace("/", "-")`, then `:282` `.replace(/[^\da-z-]/gi, "-")` | `templateName` — both steps, one expression                  |
| final path                    | `:287-290` `resolve(cacheDirectory(), providerName, template.name)`                                | the `return` — `path.join(root, providerName, templateName)` |

**Why `undefined` for `http`/`https`** — the `protoMatch[1]` guard at the top of
`getGigetCacheDir`. giget's `http` provider derives `template.name`
from the HTTP response — `basename(url.pathname)` or the `content-disposition` filename, plus an
8-char URL slice (giget dist `:103-135`). That name cannot be computed from the source string alone,
so there is nothing to return. The second `undefined` fires when `GIT_URI_RE` finds no `repo` group
at all. `clearGigetCache` treats both as "nothing to clear" and returns on its falsy-`gigetDir`
guard.

### Drift checklist — run this on any `giget` upgrade

The coupling is silent: if giget changes its layout, `clearGigetCache` deletes a path that no longer
exists, `forceRefresh` stops bypassing giget's ETag, and a "refreshed" source quietly returns stale
content. Nothing fails. `source-fetcher.test.ts`'s `getGigetCacheDir` describe block pins our side
of the contract only — it
asserts our output equals a hand-written expected path, so it stays green while giget moves.

1. Re-locate the dist chunk and diff `cacheDirectory()`, `sourceProtoRe`, `inputRegex`, the provider
   `name:` fields, and the `template.name` sanitisation against the four rows in the table above.
2. Confirm giget still refuses a non-empty `dir` without `force: true` (`fetchFromRemoteSource`'s
   `downloadTemplate` call depends on it).
3. Confirm the `http`/`https` `template.name` still depends on the HTTP response
   (`getGigetCacheDir`'s `http`/`https` early return depends on it _not_ being derivable).

### Known divergence: the `?? "github"` default

`getGigetCacheDir`'s `providerName` falls back to `"github"` when the source has no `proto:`
prefix. **giget falls back to `"registry"`**, not `"github"`: giget dist `:259-260` reads
`const registry = options.registry === false ? undefined : registryProvider(...)` then
`let providerName = options.provider || (registry ? "registry" : "github")`, and
`fetchFromRemoteSource`'s `downloadTemplate` call passes neither `provider` nor `registry: false`,
so `registry` is always a
function and `"registry"` always wins.

**This divergence is currently unreachable through `fetchFromSource`.** A protocol-less source is
`isLocalSource === true` (see the fork table above) and never reaches the remote branch. It is
reachable only by calling `getGigetCacheDir` directly — which one test does
(`source-fetcher.test.ts`'s "should default to github provider when no protocol prefix"),
pinning our behaviour rather than giget's. Two changes would make it live: loosening `isLocalSource`,
or passing `provider` / `registry` to `downloadTemplate`.

## `forceRefresh` end to end

`reference/features/skills-and-matrix.md:250` documents the flag at the `SourceLoadOptions` level
("Bypass the giget cache in `fetchFromSource()` / `fetchMarketplace()`"). Here is what actually
observes it:

| Layer                                     | Effect of `forceRefresh: true`                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `fetchFromSource` local branch            | **none** — never forwarded by `fetchFromSource`                              |
| `fetchFromRemoteSource`'s cache-hit guard | skips the early return, so `fromCache` cannot come back `true`               |
| `clearGigetCache`                         | deletes giget's tarball/ETag dir, so `downloadTemplate` cannot short-circuit |
| `remove(cacheDir)`                        | deletes our extracted tree, so files removed upstream disappear locally      |

**`fromCache` is the only externally observable trace of the bypass.** `forceRefresh: true` on a
remote source guarantees `fromCache === false`; `forceRefresh: false` returns `fromCache === true`
whenever the directory exists. Pinned by all three cases in
`src/cli/lib/loading/source-fetcher-refresh.test.ts`.

**`remove(cacheDir)` is why `forceRefresh` is not merely "re-download".** `downloadTemplate` extracts
over the existing tree; without the `remove`, a skill deleted upstream would survive in the cache
forever. `source-fetcher-refresh.test.ts`'s "should not leave orphan files after refresh" is the
guard: it plants `orphan-skill.md`, refreshes, and asserts it is gone.

**Exactly one caller hard-codes `forceRefresh: true`:** `addSource` in
`src/cli/lib/configuration/source-manager.ts`. Adding a source must validate the _live_ repo — a
cache hit would let a URL that no longer resolves be registered. Every other caller forwards a
`SourceLoadOptions.forceRefresh` it received (see the call-site table).

## Error translation — `createDetailedFetchError`

Every `downloadTemplate` rejection is replaced by `fetchFromRemoteSource`'s `catch`, never wrapped:
the original error object is discarded and only `getErrorMessage(error)` is inspected. Matching is **substring on the message**,
first match wins:

| Message contains                       | Produces                                  | Remedy the message names          |
| -------------------------------------- | ----------------------------------------- | --------------------------------- |
| `404` or `Not Found`                   | "Repository not found: `<source>`"        | `GIGET_AUTH`                      |
| `401` or `Unauthorized`                | "Authentication required for: `<source>`" | `GIGET_AUTH`, token scopes        |
| `403` or `Forbidden`                   | "Access denied to: `<source>`"            | `repo` scope                      |
| `ENOTFOUND`, `ETIMEDOUT`, or `network` | "Network error fetching: `<source>`"      | `HTTPS_PROXY`, `FORCE_NODE_FETCH` |
| anything else (the fallback `return`)  | "Failed to fetch `<source>`: `<message>`" | —                                 |

`GIGET_AUTH` is read by giget itself (giget dist `:255` `auth: process.env.GIGET_AUTH`); this module
only names it in prose. The messages are the CLI's entire auth documentation for private
marketplaces — an implementing agent changing them is changing user-facing docs.

The reported `<source>` is the **un-subdir'd** `source`, while the failing fetch used `fullSource` —
`fetchFromRemoteSource`'s `catch` passes `source`.

## `fetchMarketplace` — the fetch/cache half

The validation chain is owned by `reference/boundary-map.md:559` (§6.4) and is not repeated here.
What belongs to _this_ doc:

- It routes through `fetchFromSource` with `subdir: ""` (commented "Root of repo"). `""` is falsy,
  so both branches treat it exactly like `undefined` — `fetchFromLocalSource`'s `fullPath` and
  `fetchFromRemoteSource`'s `fullSource` each ternary on it. The explicit `""` is
  intent-documentation, not behaviour. The same idiom appears in `fetchAgentDefinitionsFromRemote`
  (`src/cli/lib/agents/agent-fetcher.ts`).
- `forceRefresh` is forwarded; `subdir` from the caller's `FetchOptions` is **discarded** — the
  `fetchFromSource` call overrides it.
- The "marketplace not found" throw fires on a missing `.claude-plugin/` **directory**,
  checked via `directoryExists(path.dirname(marketplacePath))` — a present directory with no
  `marketplace.json` falls through to `readFileSafe` and surfaces as an ENOENT instead.
- It returns `MarketplaceFetchResult` (`src/cli/types/plugins.ts`), whose `fromCache` is forwarded
  from `FetchResult` in the return literal as `result.fromCache ?? false`. **`FetchResult.fromCache`
  is a required `boolean`** — the `?? false` is dead and must not be read as evidence that
  `fromCache` can be `undefined`.

## `loader.ts` — the ID-targeted read path

`loader.ts` reads `SKILL.md` frontmatter off a directory the fetcher produced. It is **not** the
matrix path: `extractAllSkills` (`matrix-loader.ts`, documented at
`reference/features/skills-and-matrix.md:120-134`) globs `**/metadata.yaml` across the whole source;
the functions below glob `**/SKILL.md` and, for `loadSkillsByIds`, resolve a caller-supplied ID list.
Neither reads `metadata.yaml` content — `loadSkillsFromDir` only checks the file's _existence_.

### `loadSkillsByIds(skillIds, projectRoot)`

Returns `SkillDefinitionMap` (`Partial<Record<SkillId, SkillDefinition>>`,
`src/cli/types/skills.ts`). Reads from `path.join(projectRoot, DIRS.skills)` — i.e. `src/skills`
under the source root.

1. **`buildIdToDirectoryPathMap`** globs `**/SKILL.md`, parses each frontmatter in parallel, and
   emits **two keys per skill**: `frontmatter.name → dirPath` and
   `dirPath → dirPath`. A skill is therefore addressable by machine id _or_ by its directory path.
2. **`expandDirectoryRef`** handles an id that is not a key: it keeps every key whose
   _value_ starts with `` `${skillId}/` ``, so `web/framework` expands to its children. Zero matches →
   `warn("Unknown skill reference '<id>'")` and an empty list.
3. `unique()` (remeda) dedupes the flattened id list.
4. Per id: read `SKILL.md`, `parseFrontmatter`, key the result under **`frontmatter.name`** (the
   `canonicalId` binding), not under the requested id.

**Every failure is a `warn` + `continue`** — the unresolved-id, missing-frontmatter and read-error
paths all take it. The function never throws and
never reports which ids it dropped — a caller that needs "did I get everything" must diff its request
against `Object.keys()` of the result.

Emitted `SkillDefinition.path` is `` `${DIRS.skills}/${directoryPath}/` `` with a trailing slash,
pinned as `"src/skills/good-skill/"` in `loader.test.ts`'s `loadSkillsByIds` block.

### `LoadSkillsFromDirOptions` / `loadSkillsFromDir`

```typescript
// loader.ts — LoadSkillsFromDirOptions
export type LoadSkillsFromDirOptions = {
  pathPrefix?: string; // default ""  — prefix recorded on each skill's `path`
  requireMetadata?: boolean; // default false — skip a SKILL.md with no sibling metadata.yaml
};
```

| Behaviour               | Guard / binding              | Detail                                                                             |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| Missing directory       | `directoryExists(skillsDir)` | returns `{}` — **not** an error                                                    |
| `requireMetadata: true` | `fileExists(metadataPath)`   | `warn`s by name and skips: "Add metadata.yaml to register it with the CLI"         |
| Emitted `path`          | `displayPath`                | `` `${pathPrefix}/${relativePath}/` ``, or `` `${relativePath}/` `` when no prefix |
| Frontmatter guard       | `!frontmatter?.name`         | stricter than `loadSkillsByIds`, which only checks `!frontmatter`                  |
| Read failure            | the per-file `catch`         | `verbose`, not `warn` — quieter than every other path in this file                 |

**Do not read the `?.name` / `|| ""` asymmetry as two different contracts.**
`skillFrontmatterLoaderSchema` (`src/cli/lib/schemas.ts`) already declares `name` and
`description` as required `z.string()`, so a non-`null` return from `parseFrontmatter` always has
both. The only input the two guards disagree on is an **empty-string** `name`, which
`loadSkillsFromDir` skips on `!frontmatter?.name` and `loadSkillsByIds` — whose guard is the looser
`!frontmatter` — would accept and key the map under `""`. No fixture produces one; treat it as
latent, not as a behaviour to rely on.

**`requireMetadata` is the local-vs-plugin distinction**, spelled out in the type's own JSDoc: local
skills must be registered with a `metadata.yaml`; plugin skills carry none. The two callers set it
accordingly — `discoverLocalProjectSkills` passes `true`
(`src/cli/lib/operations/skills/discover-skills.ts`), `loadPluginSkills` passes `false`
(`loader.ts`).

`loadPluginSkills(pluginDir)` is a fixed-argument wrapper reading `<pluginDir>/skills`. Its role in
plugin discovery is documented at `reference/features/plugin-system.md:131`.

## Call sites (grep-verified over `src/`, `e2e/`, `scripts/` —)

### `fetchFromSource`

| Caller                                      | File                                 | Options passed                 |
| ------------------------------------------- | ------------------------------------ | ------------------------------ |
| `resolveBaseResult` (default-source branch) | `lib/loading/source-loader.ts`       | `{ forceRefresh }`             |
| `loadFromRemote`                            | `lib/loading/source-loader.ts`       | `{ forceRefresh }`             |
| `fetchSourceSkills`                         | `lib/loading/multi-source-loader.ts` | `{ forceRefresh }`             |
| `fetchAgentDefinitionsFromRemote`           | `lib/agents/agent-fetcher.ts`        | `{ forceRefresh, subdir: "" }` |
| `fetchSkillsFromExternalSource`             | `commands/search.ts`                 | `{}`                           |
| `fetchSkillSource`                          | `commands/import/skill.ts`           | _(none)_                       |
| `fetchMarketplace`                          | `lib/loading/source-fetcher.ts`      | `{ forceRefresh, subdir: "" }` |

**No production caller passes a non-empty `subdir`.** That fact is what keeps Trap 2 latent.

`fetchAgentDefinitionsFromRemote` (`agent-fetcher.ts`) types its own options as
`FetchOptions & { agentsDir?: string }` — the only place `FetchOptions` is extended rather than
constructed.

### `fetchMarketplace`

| Caller                                                  | File                                          | Note                                             |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `addSource`                                             | `lib/configuration/source-manager.ts`         | `{ forceRefresh: true }` — validates a live repo |
| `resolveMarketplaceLabels` (called by `loadFromRemote`) | `lib/loading/source-loader.ts`                | `{ forceRefresh }`                               |
| `tagPublicSourceSkills`                                 | `lib/loading/multi-source-loader.ts`          | `{ forceRefresh }`, `DEFAULT_SOURCE`             |
| `ensureMarketplace`                                     | `lib/operations/source/ensure-marketplace.ts` | `{}` — lazy name resolution                      |

### `loadSkillsByIds` / `loadSkillsFromDir`

| Callee                                       | Caller                                                                    | Purpose                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `loadSkillsByIds`                            | `installPluginConfig` (`lib/installation/local-installer.ts`)             | stack skill metadata for compilation, read from `sourceResult.sourcePath` |
| `loadSkillsByIds`                            | `compileStackPlugin` (`lib/stacks/stack-plugin-compiler.ts`)              | stack skill metadata, read from `projectRoot`                             |
| `loadSkillsFromDir`                          | `discoverLocalProjectSkills` (`lib/operations/skills/discover-skills.ts`) | local `.claude/skills` discovery, `requireMetadata: true`                 |
| `loadSkillsFromDir` (via `loadPluginSkills`) | `discoverAllPluginSkills` (`lib/plugins/plugin-discovery.ts`)             | plugin skill discovery                                                    |

`installPluginConfig` (`local-installer.ts`) carries a documented boundary cast
(`as Partial<Record<SkillId, LocalResolvedSkill>>`) because `LocalResolvedSkill` extends
`SkillDefinition`.

## Invariants

1. **A local source is never cached and never copied.** `fromCache` is hard-coded `false` on that
   branch; `path` is the caller's directory.
2. **The cache key is a pure function of the source string** — `sanitizeSourceForCache` takes no
   clock, env, or fs input. The same source always maps to the same directory, across processes and
   machines.
3. **`CACHE_DIR` is resolved once, at module load of `consts.ts`, from `os.homedir()`.**
   A subprocess with a different `HOME` gets a different cache root; that is exactly what
   `seedDefaultSourceCache` exploits (`e2e/helpers/test-utils.ts`) and what lets E2E specs run
   offline.
4. **`source-fetcher.ts` is the only module in `src/` that imports `giget`** (grep-verified).
   Any new network fetch of a source belongs behind `fetchFromSource`, not beside it.
5. **`getGigetCacheDir` returning `undefined` is a success, not a failure** — `clearGigetCache`
   returns silently on its falsy-`gigetDir` guard and the fetch proceeds. `forceRefresh` on an
   `https://` source therefore clears our cache but not giget's.
6. **Everything in `loader.ts` degrades to a partial result.** No function there throws on a bad
   skill; they `warn`/`verbose` and skip.

## Traps

**Trap 1 — a half-written cache directory is a permanent cache hit.** `directoryExists` is the whole
validity test in `fetchFromRemoteSource`. If `downloadTemplate` is killed mid-extract, the next load
returns the partial tree with `fromCache: true` and no warning. Recovery is `forceRefresh` or deleting
`$CACHE_DIR/sources/<key>` by hand. Do not add an emptiness check without deciding what an
intentionally-empty source means.

**Trap 2 — `subdir` is not part of the cache key.** `fetchFromRemoteSource`'s `cacheDir` keys on
`source`; its `fullSource` adds the subdir and hands _that_ to `downloadTemplate`. Two fetches of
the same repo with different subdirs share one cache directory, so the second returns the first's contents with
`fromCache: true`. Latent today only because no production caller passes a non-empty `subdir` (see the
call-site table). **If you add one, change `getCacheDir(source)` to key on `fullSource` in the same
commit.**

**Trap 3 — `forceRefresh` must clear _two_ caches.** Deleting only `cacheDir` leaves giget's ETag, and
`downloadTemplate` will 304 straight back to the stale tarball. That is the entire reason
`clearGigetCache` and its replicated path algorithm exist. Removing its call from
`fetchFromRemoteSource`'s `forceRefresh` block looks like a harmless simplification and silently
breaks `--refresh` on unchanged-ETag repos.

**Trap 4 — a bare `org/repo` is a local path, not a GitHub repo.** `isLocalSource` (`config.ts`)
returns `true` for anything without a `REMOTE_PROTOCOLS` prefix, so
`fetchFromSource("agents-inc/skills")` resolves `./agents-inc/skills` against `process.cwd()` and
throws "Local source not found". Sources must carry `github:` / `gh:` / `https://` explicitly;
`DEFAULT_SOURCE` does (`config.ts`, `"github:agents-inc/skills"`).

**Trap 5 — the E2E cache seed can fail silently.** See "Cache layout" above and the file header of
`e2e/interactive/sources-step-duplicate-marketplace-column.e2e.test.ts`.

**Trap 6 — `loadSkillsByIds` reads a directory-expanded skill twice.** `buildIdToDirectoryPathMap`
stores two keys per skill and `expandDirectoryRef` filters on the _value_, so expanding a parent
directory yields both the id key and the path key for each child. `unique()` cannot collapse them —
they are different strings. The output map is still correct (both write `skills[canonicalId]`), but
each `SKILL.md` is read twice and each `verbose` line prints twice. Do not "fix" the duplicate log by de-duplicating on `canonicalId` after the read; de-duplicate
the id list before it.

## Test surface

All four files were **run**: 89 tests, all passing.

| File                                                        | Tests | Covers (by describe block)                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/loading/source-fetcher.test.ts`                | 38    | `fetchFromSource with local paths` (incl. `subdir` and the not-found throw); `remote source URL validation` (`isLocalSource` classification); `sanitizeSourceForCache` determinism/collision/length/Unicode/empty; `fetchMarketplace security validation`; `getGigetCacheDir` per-provider, `XDG_CACHE_HOME`, ref, subdir, dot-sanitisation |
| `src/cli/lib/loading/source-fetcher-refresh.test.ts`        | 3     | the only tests that exercise the **remote** branch — `giget` and `CACHE_DIR` are both mocked                                                                                                                                                                                                                                                |
| `src/cli/lib/loading/source-fetcher-unknown-fields.test.ts` | 2     | `warnUnknownFields` on `marketplace.json`, positive **and** silence guard                                                                                                                                                                                                                                                                   |
| `src/cli/lib/loading/loader.test.ts`                        | 46    | `parseFrontmatter`, the agent loaders, `loadSkillsByIds`, `loadPluginSkills`                                                                                                                                                                                                                                                                |

**How the remote branch is made testable** (`source-fetcher-refresh.test.ts`'s module-mock block):
`CACHE_DIR` is
replaced through a **getter** on a `vi.mock` of `../../consts`, because the value must be read _after_
`beforeEach` assigns the temp dir — a plain property would capture `undefined`. `giget` is mocked to a
bare `downloadTemplate: vi.fn()`. Copy this pattern rather than inventing another; a static mock of
`CACHE_DIR` cannot work.

**What has no test at all:** `createDetailedFetchError`'s five branches — no test asserts any of the
message texts. `clearGigetCache` is likewise untested; only its helper `getGigetCacheDir` is.

## Known limitations

| #   | Limitation                                                                | Where                                                                                    | Current behaviour                                                                                                                 |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cache has no validity check beyond directory existence                    | `fetchFromRemoteSource`'s cache-hit guard                                                | Partial/corrupt trees are served indefinitely. See Trap 1                                                                         |
| 2   | `subdir` absent from the cache key                                        | `fetchFromRemoteSource`'s `cacheDir`                                                     | Latent collision. See Trap 2                                                                                                      |
| 3   | giget's cache path is replicated, not queried                             | `getGigetCacheDir`                                                                       | Breaks silently on a giget upgrade; our tests pin our side only. See the drift checklist                                          |
| 4   | Proto-less default provider disagrees with giget (`github` vs `registry`) | `getGigetCacheDir`'s `providerName`                                                      | Unreachable via `fetchFromSource` today; see "Known divergence"                                                                   |
| 5   | `createDetailedFetchError` discards the original error                    | `fetchFromRemoteSource`'s `catch`                                                        | Only `getErrorMessage(error)` survives; no `cause`, no stack. A non-matching giget error keeps its text via the fallback `return` |
| 6   | Substring matching on error text                                          | `createDetailedFetchError`                                                               | A repo literally named `404` or a body containing `network` re-routes the message                                                 |
| 7   | The `"sources"` cache segment is encoded in two places                    | `getCacheDir` (`source-fetcher.ts`), `SOURCE_CACHE_SUBDIR` (`e2e/helpers/test-utils.ts`) | `getCacheDir` is module-private, so the E2E helper re-derives it. See Trap 5                                                      |
