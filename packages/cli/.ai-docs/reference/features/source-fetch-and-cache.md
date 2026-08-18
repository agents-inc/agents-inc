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
    revalidation,
    ETag,
    fetch-record,
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

| Topic                                                                                                 | Owner                                     |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `CACHE_DIR`'s value                                                                                   | `reference/utilities.md`                  |
| `marketplace.json` size / depth / schema chain, `MAX_MARKETPLACE_FILE_SIZE`, `MAX_JSON_NESTING_DEPTH` | `reference/boundary-map.md`               |
| `SourceLoadOptions`                                                                                   | `reference/features/skills-and-matrix.md` |
| The skill-id namespace rule and the collision guard a fetched source meets AFTER extraction           | `reference/features/skills-and-matrix.md` |

**A fetched source is not yet an accepted one.** Everything below ends when the bytes are on disk and
`fetchFromSource` returns a path. `loadAndMergeFromBasePath` then extracts the skills and calls
`refuseCatalogueCollisions`, which throws when a custom marketplace ships ids the public catalogue
owns — so a fetch that succeeded and cached cleanly can still be followed by a refusal, and the cache
entry it left is legitimate. Nothing in this layer inspects a skill id.

`reference/features/skills-and-matrix.md` carries the one-line inventory row for this file
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

**Everything else in `source-fetcher.ts` is module-private** — the two branch functions
(`fetchFromLocalSource`, `fetchFromRemoteSource`), the cache-path helper `getCacheDir`, the giget
teardown `clearGigetCache`, the error translator `createDetailedFetchError`, and the whole
revalidation cluster below it (`revalidateCachedCopy`, `classifyCachedCopy`, `fetchEtag`,
`readFetchRecord`, `recordFetchedCopy`, `fetchRecordPath`, `parseJsonOrUndefined`, `announceRefetch`,
`markCopyCurrentForThisRun`). Re-derive with `grep -c '^export' src/cli/lib/loading/source-fetcher.ts`
against the exported table above rather than trusting this sentence to have kept up — the file grows
private helpers faster than any pass reads it.

## `fetchFromSource` — the two-branch fork

```typescript
// source-fetcher.ts — fetchFromSource
export async function fetchFromSource(
  source: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const { subdir } = options;

  if (isLocalSource(source)) {
    return fetchFromLocalSource(source, subdir);
  }

  return fetchFromRemoteSource(source, subdir);
}
```

```typescript
// source-fetcher.ts — FetchOptions / FetchResult
export type FetchOptions = { subdir?: string };
export type FetchResult = { path: string; fromCache: boolean; source: string };
```

| Field of `FetchOptions` | Default     | Read by       |
| ----------------------- | ----------- | ------------- |
| `subdir`                | `undefined` | both branches |

**There is no "force" option and no flag behind one.** Freshness is not a question the caller
answers — every remote load revalidates and decides for itself. See "Revalidation" below.

| Field of `FetchResult` | Local branch                           | Remote branch                                                  |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `path`                 | absolute resolved dir (`absolutePath`) | `cacheDir` on a hit, `downloadTemplate().dir` otherwise        |
| `fromCache`            | **always `false`**                     | `true` only on the cache-hit return                            |
| `source`               | the **original** `source`              | `fullSource` — i.e. `source` + `/` + `subdir`, on both returns |

**The `source` field means different things on the two branches, and nothing reads it.** The local
branch echoes the argument; the remote branch echoes the subdir-joined `fullSource` on both of its
returns. Grep-verified: every production call site reads `.path` and/or `.fromCache` — `loadFromLocal`,
`loadFromRemote` and `loadSkillsMatrixFromSource` (all in `loading/source-loader.ts`),
`fetchMarketplace` (`loading/source-fetcher.ts`) and `fetchAgentDefinitionsFromRemote`
(`agents/agent-fetcher.ts`) — and none reads `.source`. Reconcile the two branches before you start.

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
3. `directoryExists(absolutePath)` false → throws `Local marketplace not found: '<abs>'`, followed
   by its own remediation lines ("Nothing is at that path, and a local marketplace must be a
   directory holding skills", then `--marketplace <DEFAULT_SOURCE>`). It is **not** routed through
   `createDetailedFetchError`; that translator wraps `downloadTemplate` rejections only, in
   `fetchFromRemoteSource`'s `catch`. The two error vocabularies are therefore separate — a change
   to the remote-side remediation text does not reach this one.
4. Returns `{ path: absolutePath, fromCache: false, source }`.

There is no cache, no copy, and no write. A local source is used **in place**.

### Remote branch (`fetchFromRemoteSource`)

```
cacheDir   = getCacheDir(source)                       ← NOTE: source, not fullSource
fullSource = subdir ? `${source}/${subdir}` : source

if (await directoryExists(cacheDir))
    verdict = await revalidateCachedCopy(cacheDir, source)   (memoised per run)
    "current"     → return { path: cacheDir, fromCache: true, source: fullSource }
    "unreachable" → return { path: cacheDir, fromCache: true, source: fullSource }
                    (the warn was already emitted INSIDE classifyCachedCopy — see below)
    "superseded"  → announceRefetch → log(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT)  ↓
    "unrecorded"  → announceRefetch → (no line)                                           ↓
    → await clearGigetCache(source)                    (giget's tarball/ETag cache)
    → await remove(cacheDir)                           (our extracted copy)
await ensureDir(path.dirname(cacheDir))
await downloadTemplate(fullSource, { dir: cacheDir, force: true, offline: false })
    → await recordFetchedCopy(cacheDir, result)        (writes <cacheDir>.etag.json)
    → markCopyCurrentForThisRun(cacheDir)              (later loads THIS run read "current")
    → return { path: result.dir, fromCache: false, source: fullSource }
    → catch → throw createDetailedFetchError(error, source)
```

**Cache validity is the ETag the source answers with.** `directoryExists(cacheDir)` decides only
whether there is a copy to ask about; what happens next is the verdict. There is still no TTL and no
emptiness check — an interrupted first fetch that left a directory behind is a cache hit for as long
as the source's ETag has not moved, see Trap 1.

`force: true` is passed unconditionally in the `downloadTemplate` call, with an inline reason
("Always force when downloading to avoid 'already exists' error"): giget refuses to write into a
non-empty `dir` otherwise, and the `ensureDir(path.dirname(cacheDir))` above it has just created the
parent.

`remove` (`src/cli/utils/fs.ts`) delegates to `fs-extra`, which is a no-op on a missing path,
so the teardown before a re-fetch is safe on a cold cache.

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

`CACHE_DIR` is owned by `reference/utilities.md`. `gigetCacheRoot` is `$XDG_CACHE_HOME/giget` when
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
exists, a re-fetch stops bypassing giget's own ETag check, and a source that moved on quietly
returns stale content. Nothing fails. `source-fetcher.test.ts`'s `getGigetCacheDir` describe block pins our side
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

## Revalidation — how a load decides the cached copy is still the source

Every remote load asks the source whether the copy in the cache is still what it would send. The
question is at most one HEAD request against the tarball URL, and the answer is a `CacheVerdict`:

| Verdict       | Reached when                                                   | Requests it makes                                            | What the load does                             | What the user sees                              |
| ------------- | -------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| `current`     | live ETag equals the recorded one                              | **one HEAD, no GET**                                         | returns the cache, `fromCache: true`           | nothing                                         |
| `current`     | the record carries no `etag`, or the host answered without one | one HEAD, or **none at all** (see below)                     | returns the cache, `fromCache: true`           | nothing (`verbose` only)                        |
| `superseded`  | live ETag differs from the recorded one                        | the HEAD, then the download, then a second HEAD to re-record | discards both caches, downloads, records again | `STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT` |
| `unrecorded`  | a cache directory with no usable `.etag.json` beside it        | none before the download; one HEAD after it                  | same as `superseded`, to establish a record    | nothing                                         |
| `unreachable` | the HEAD threw — offline, blocked, or slower than the timeout  | one attempted HEAD                                           | returns the cache, `fromCache: true`           | `sourceUnreachableUsingCache(source)` as a warn |

**Two `current` arms make ZERO network requests**, and they are the ones a reader assuming
"every load costs one HEAD" gets wrong. `classifyCachedCopy` returns `current` on
`record.etag === undefined` **before** `fetchEtag` is reached, and the second and later loads of the
same run read the memoised verdict rather than asking again. A cold-cache run pays no revalidation
HEAD either — `directoryExists(cacheDir)` is false, so the whole classifier is skipped and the only
HEAD is `recordFetchedCopy`'s, after the download.

**The `unreachable` warning is emitted inside `classifyCachedCopy`, not at the call site.** It has
to be: the verdict is memoised per source per run, so a warn left in `fetchFromRemoteSource` would
repeat for every later load of the same command against a question that was only ever asked once.
Read the line as belonging to the classification, not to the fetch.

**Where the warning is read.** `warn()` writes to stderr for a plain command, but a
load that opens a wizard buffers instead — `init` and `edit` pass `captureStartupMessages` — because
the wizard clears the terminal on its way in. Those runs show the same line in the wizard's
startup-message band; see [component-patterns.md](../component-patterns.md#wizardlayout-startup-message-band).

`current` covers two states deliberately: an ETag that matched, and an ETag that cannot be had at
all (the record carries none, or the host answered without one). Both mean "keep the copy and say
nothing"; the difference is only ever `verbose`. Re-fetching on every load instead would cost a full
download per command against any host that does not send ETags.

**The fetch record.** `recordFetchedCopy` writes `<cacheDir>.etag.json` — beside the cache
directory, never inside it, so the extracted tree stays exactly what the source shipped.
It holds `{ tar, etag? }`, validated on read by `sourceRevalidationSchema`
(`lib/schemas.ts`); an unparseable or unusable record reads as no record at all, which is the
`unrecorded` verdict. `tar` is read off giget's own `downloadTemplate` result rather than rebuilt
here — that is what keeps revalidation provider-agnostic, since the URL is whatever giget resolved
for the source. **`GIGET_AUTH` is never written into the record**; it is read from the environment
per request, so the HEAD carries the same token giget's own download does and a private source does
not report itself unreachable.

**One question per source per run, and one DOWNLOAD per source per run.** `revalidateCachedCopy`
memoises the in-flight promise by cache directory in a module-level `Map` (`askedThisRun`). A single
command loads the same source more than once — the matrix and the marketplace label are separate
`fetchFromSource` calls — and the answer cannot change between them.

**The memo is also written by the download path**, which is the half a reader misses.
`markCopyCurrentForThisRun(cacheDir)` seats `Promise.resolve("current")` immediately after
`recordFetchedCopy`, so a run that has just re-fetched a moved source does not re-read its own
`superseded` verdict and download the same tarball again. Without it a moved source is downloaded
once per LOAD rather than once per run: the first load answers `superseded` truthfully, acts on it,
and the second load reads that same cached answer — true when given, already acted on by then.
Deleting the call restores that behaviour silently; nothing about the first load looks wrong.

**`REVALIDATION_TIMEOUT_MS` is 5000** (raised from 2500, owner 2026-08-09: being offline is rare, and
a longer honest wait for it beats a wrong verdict on a slow link). Measured against the default
marketplace the question costs ~260ms, so the bound is around twenty times a healthy answer — a slow
link is still given the chance to answer rather than having its copy called stale. It remains a
bound: the platform's own connect timeout is ~10s, which is what a user on a dropped connection would
otherwise wait before being handed the copy they already had. The `AbortSignal.timeout` is what
enforces it, and the abort lands in the same `catch` as any other network failure — `unreachable`.

**`remove(cacheDir)` is why a re-fetch is not merely "download again".** `downloadTemplate` extracts
over the existing tree; without the `remove`, a skill deleted upstream would survive in the cache
forever. `source-fetcher-revalidation.test.ts`'s "re-fetches and announces the update when the ETag
moved" is the guard: it plants an orphan file, moves the ETag, and asserts the orphan is gone.

**`fromCache` is the externally observable trace.** It comes back `true` on `current` and
`unreachable`, `false` whenever the load downloaded.

**What giget does on its own.** giget 1.2.5's `download()` already HEADs the tarball and compares
against an ETag it stores next to its own tarball cache, skipping the body when they match — but it
extracts the tarball regardless, measured at ~1.7s for the default marketplace. That is why the
check above is ours and runs first: a cache hit must cost one round trip and no extraction.

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

`GIGET_AUTH` is read by giget for the download, and **independently by this module for the
revalidation HEAD** — `fetchEtag` reads `process.env.GIGET_AUTH` per request and sends it as a
`Bearer` header. That is deliberate: a private marketplace whose HEAD went unauthenticated would
answer 401, the HEAD would throw, and the source would report itself `unreachable` on every load
while the download beside it succeeded. The token is never written into the fetch record. The
messages above are the CLI's entire auth documentation for private marketplaces — an implementing
agent changing them is changing user-facing docs.

The reported `<source>` is the **un-subdir'd** `source`, while the failing fetch used `fullSource` —
`fetchFromRemoteSource`'s `catch` passes `source`.

## `fetchMarketplace` — the fetch/cache half

The validation chain is owned by `reference/boundary-map.md` §6.4 and is not repeated here.
What belongs to _this_ doc:

- It routes through `fetchFromSource` with `subdir: ""` (commented "Root of repo"). `""` is falsy,
  so both branches treat it exactly like `undefined` — `fetchFromLocalSource`'s `fullPath` and
  `fetchFromRemoteSource`'s `fullSource` each ternary on it. The explicit `""` is
  intent-documentation, not behaviour. The same idiom appears in `fetchAgentDefinitionsFromRemote`
  (`src/cli/lib/agents/agent-fetcher.ts`).
- It takes no options of its own any more: the signature is `fetchMarketplace(source)`, and the
  `subdir: ""` above is the whole of what it passes down.
- The "marketplace not found" throw fires on a missing `.claude-plugin/` **directory**,
  checked via `directoryExists(path.dirname(marketplacePath))` — a present directory with no
  `marketplace.json` falls through to `readFileSafe` and surfaces as an ENOENT instead.
- It returns `MarketplaceFetchResult` (`src/cli/types/plugins.ts`), whose `fromCache` is forwarded
  straight from `FetchResult` in the return literal. **`FetchResult.fromCache` is a required
  `boolean`**, so there is nothing to default; the `?? false` that used to sit here is gone and must
  not be re-added — it read as evidence the field could be `undefined`.

## `loader.ts` — the ID-targeted read path

`loader.ts` reads `SKILL.md` frontmatter off a directory the fetcher produced. It is **not** the
matrix path: `extractAllSkills` (`matrix-loader.ts`, documented in
`reference/features/skills-and-matrix.md` § Data Flow) globs `**/metadata.yaml` across the whole source;
the functions below glob `**/SKILL.md` and, for `loadSkillsByIds`, resolve a caller-supplied ID list.
`loadSkillsByIds` does not read `metadata.yaml` at all. `loadSkillsFromDir` reads it under
`requireMetadata` and refuses the skill directory when it describes no skill — see the table below.

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
  requireMetadata?: boolean; // default false — skip a SKILL.md whose metadata.yaml describes no skill
};
```

Returns `LoadedSkills` — the skill map **and** `unusableMetadata`, one entry per skill directory
whose `metadata.yaml` exists but describes no skill. Only ever non-empty under `requireMetadata`.

| Behaviour                        | Guard / binding                 | Detail                                                                             |
| -------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Missing directory                | `directoryExists(skillsDir)`    | returns `{}` — **not** an error                                                    |
| `requireMetadata: true`          | `fileExists(metadataPath)`      | `warn`s by name and skips: "Add metadata.yaml to register it with the CLI"         |
| metadata.yaml describes no skill | `readSkillMetadata(...).usable` | pushed onto `unusableMetadata` and skipped — the SKILL.md is never reached         |
| Emitted `path`                   | `displayPath`                   | `` `${pathPrefix}/${relativePath}/` ``, or `` `${relativePath}/` `` when no prefix |
| Frontmatter guard                | `!frontmatter?.name`            | stricter than `loadSkillsByIds`, which only checks `!frontmatter`                  |
| Read failure                     | the per-file `catch`            | `verbose`, not `warn` — quieter than every other path in this file                 |

**`readSkillMetadata` is the single judgment of whether a `metadata.yaml` describes its skill**, and
the three passes that meet one share it: this function (behind `compile`'s discovery),
`extractLocalSkill` (`lib/skills/local-skill-loader.ts`, behind `config-types.ts` regeneration) and
`validateInstalledSkillMetadata` (`lib/content-validator.ts`, behind `doctor`). It refuses a file
nothing parses out of AND a file that parses without the fields `localRawMetadataSchema` requires
(`displayName`, `slug`, `category`, `domain`). What each pass DOES about a refusal differs — compile
refuses the run, discovery skips the skill, doctor reports it — but what they call describing does
not. `doctor` layers its stricter published-skill schema on the fields the judgment returns, never
beside them.

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
plugin discovery is documented in `reference/features/plugin-system.md` § Plugin Discovery.

## Call sites (grep-verified over `src/`, `e2e/`, `scripts/` —)

### `fetchFromSource`

| Caller                                      | File                            | Options passed   |
| ------------------------------------------- | ------------------------------- | ---------------- |
| `resolveBaseResult` (default-source branch) | `lib/loading/source-loader.ts`  | none             |
| `loadFromLocal` (local sources only)        | `lib/loading/source-loader.ts`  | none             |
| `loadFromRemote`                            | `lib/loading/source-loader.ts`  | none             |
| `fetchAgentDefinitionsFromRemote`           | `lib/agents/agent-fetcher.ts`   | `{ subdir: "" }` |
| `fetchMarketplace`                          | `lib/loading/source-fetcher.ts` | `{ subdir: "" }` |

**No production caller passes a non-empty `subdir`.** That fact is what keeps Trap 2 latent.

`fetchAgentDefinitionsFromRemote` (`agent-fetcher.ts`) types its own options as
`FetchOptions & { agentsDir?: string }` — the only place `FetchOptions` is extended rather than
constructed.

### `fetchMarketplace`

| Caller                                                                      | File                                          | Note                 |
| --------------------------------------------------------------------------- | --------------------------------------------- | -------------------- |
| `resolveMarketplaceLabels` (called by `loadFromLocal` and `loadFromRemote`) | `lib/loading/source-loader.ts`                | source label lookup  |
| `ensureMarketplace`                                                         | `lib/operations/source/ensure-marketplace.ts` | lazy name resolution |

### `loadSkillsByIds` / `loadSkillsFromDir`

| Callee                                       | Caller                                                                    | Purpose                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `loadSkillsByIds`                            | `installPluginConfig` (`lib/installation/local-installer.ts`)             | stack skill metadata for compilation, read from `sourceResult.sourcePath` |
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
   returns silently on its falsy-`gigetDir` guard and the fetch proceeds. A re-fetch of an
   `https://` source therefore clears our cache but not giget's, and giget's own ETag check is what
   decides whether it re-downloads the tarball.
6. **Everything in `loader.ts` degrades to a partial result.** No function there throws on a bad
   skill; they `warn`/`verbose` and skip.

## Traps

**Trap 1 — a half-written cache directory survives until the source's ETag moves.** Revalidation
asks whether the SOURCE changed, not whether the extraction finished. If `downloadTemplate` is
killed mid-extract, the record beside the directory is never written, so the next load reads
`unrecorded` and re-fetches — but a directory left by an OLDER complete fetch whose record still
matches comes back `current` with `fromCache: true` and no warning. Recovery is deleting
`$CACHE_DIR/sources/<key>` by hand. Do not add an emptiness check without deciding what an
intentionally-empty source means.

**Trap 2 — `subdir` is not part of the cache key.** `fetchFromRemoteSource`'s `cacheDir` keys on
`source`; its `fullSource` adds the subdir and hands _that_ to `downloadTemplate`. Two fetches of
the same repo with different subdirs share one cache directory, so the second returns the first's contents with
`fromCache: true`. Latent today only because no production caller passes a non-empty `subdir` (see the
call-site table). **If you add one, change `getCacheDir(source)` to key on `fullSource` in the same
commit.**

**Trap 3 — a re-fetch must clear _two_ caches.** Deleting only `cacheDir` leaves giget's stored
ETag, and `downloadTemplate` short-circuits straight back to the tarball it already has. That is the
entire reason `clearGigetCache` and its replicated path algorithm exist. Removing its call from the
re-fetch block in `fetchFromRemoteSource` looks like a harmless simplification and silently turns
the `superseded` verdict into a re-extraction of the stale tarball — with the "newer content" line
printed over it.

**Trap 4 — a bare `org/repo` is a local path, not a GitHub repo.** `isLocalSource` (`config.ts`)
returns `true` for anything without a `REMOTE_PROTOCOLS` prefix, so
`fetchFromSource("agents-inc/skills")` resolves `./agents-inc/skills` against `process.cwd()` and
throws "Local marketplace not found". Sources must carry `github:` / `gh:` / `https://` explicitly;
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

Four files. Run them rather than reading a total off this page: `npm test` builds `dist/` first,
which a bare `vitest run` refuses to do against a stale build, and a per-file count is wrong within
a fortnight.

| File                                                        | Covers (by describe block)                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/loading/source-fetcher.test.ts`                | `fetchFromSource with local paths` (incl. `subdir` and the not-found throw); `remote source URL validation` (`isLocalSource` classification); `sanitizeSourceForCache` determinism/collision/length/Unicode/empty; `fetchMarketplace security validation`; `getGigetCacheDir` per-provider, `XDG_CACHE_HOME`, ref, subdir, dot-sanitisation |
| `src/cli/lib/loading/source-fetcher-revalidation.test.ts`   | the only tests that exercise the **remote** branch — `giget`, `CACHE_DIR` and the global `fetch` are all mocked. One per verdict (`current` twice: matched ETag, and a record carrying none), plus the once-per-run memo and the record written after a download                                                                            |
| `src/cli/lib/loading/source-fetcher-unknown-fields.test.ts` | `warnUnknownFields` on `marketplace.json`, positive **and** silence guard                                                                                                                                                                                                                                                                   |
| `src/cli/lib/loading/loader.test.ts`                        | `parseFrontmatter`, the agent loaders, `loadSkillsByIds`, `loadPluginSkills`                                                                                                                                                                                                                                                                |

**How the remote branch is made testable** (`source-fetcher-revalidation.test.ts`'s module-mock block):
`CACHE_DIR` is
replaced through a **getter** on a `vi.mock` of `../../consts`, because the value must be read _after_
`beforeEach` assigns the temp dir — a plain property would capture `undefined`. `giget` is mocked to a
bare `downloadTemplate: vi.fn()`, and the revalidation HEAD is stubbed per test with
`vi.stubGlobal("fetch", …)` returning a real `Response` (`new Response(null, { headers })` — the
codebase's assertion rules refuse a cast-shaped fake). Copy this pattern rather than inventing
another; a static mock of `CACHE_DIR` cannot work.

**What no spec exercises**, re-derivable by grepping the four files above for each name:
`createDetailedFetchError`'s five branches — no assertion names any of its message texts — and
`clearGigetCache`, whose helper `getGigetCacheDir` is pinned while the removal it drives is not.
Both are assertions of ABSENCE, and `scripts/check-enumeration-drift.ts` cannot falsify one: writing
the missing spec moves no symbol name, so this paragraph stays green whether or not it is still
true. Grep before relying on it.

## Known limitations

| #   | Limitation                                                                 | Where                                                                                    | Current behaviour                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A cached tree is validated against the SOURCE's ETag, never against itself | `fetchFromRemoteSource`'s cache-hit guard                                                | A partial tree whose record still matches is served until the source moves. See Trap 1                                            |
| 2   | `subdir` absent from the cache key                                         | `fetchFromRemoteSource`'s `cacheDir`                                                     | Latent collision. See Trap 2                                                                                                      |
| 3   | giget's cache path is replicated, not queried                              | `getGigetCacheDir`                                                                       | Breaks silently on a giget upgrade; our tests pin our side only. See the drift checklist                                          |
| 4   | Proto-less default provider disagrees with giget (`github` vs `registry`)  | `getGigetCacheDir`'s `providerName`                                                      | Unreachable via `fetchFromSource` today; see "Known divergence"                                                                   |
| 5   | `createDetailedFetchError` discards the original error                     | `fetchFromRemoteSource`'s `catch`                                                        | Only `getErrorMessage(error)` survives; no `cause`, no stack. A non-matching giget error keeps its text via the fallback `return` |
| 6   | Substring matching on error text                                           | `createDetailedFetchError`                                                               | A repo literally named `404` or a body containing `network` re-routes the message                                                 |
| 7   | The `"sources"` cache segment is encoded in two places                     | `getCacheDir` (`source-fetcher.ts`), `SOURCE_CACHE_SUBDIR` (`e2e/helpers/test-utils.ts`) | `getCacheDir` is module-private, so the E2E helper re-derives it. See Trap 5                                                      |
