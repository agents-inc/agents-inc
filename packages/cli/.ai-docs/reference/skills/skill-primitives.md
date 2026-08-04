---
scope: reference
area: skills
keywords:
  [
    skill-copier,
    skill-metadata,
    skill-fetcher,
    local-skill-loader,
    skill-plugin-compiler,
    copySkill,
    copySkillFromSource,
    copySkillTo,
    CopyProgressCallback,
    CopiedSkill,
    validateSkillPath,
    fetchSkills,
    FetchSkillsOptions,
    readLocalSkillMetadata,
    readForkedFromMetadata,
    getLocalSkillsWithMetadata,
    computeSourceHash,
    computeSkillFolderHash,
    computeFileHash,
    injectForkedFromMetadata,
    writeMetadataYaml,
    ForkedFromMetadata,
    LocalSkillMetadata,
    LocalRawMetadata,
    LocalSkillDiscoveryResult,
    SkillPluginOptions,
    forkedFrom,
    contentHash,
  ]
related:
  - reference/features/skills-and-matrix.md
  - reference/boundary-map.md
  - reference/types/zod-schemas.md
  - reference/features/plugin-system.md
  - reference/features/operations-layer.md
last_validated: 2026-08-02
---

<!-- VALIDATED 2026-08-02 · FULL (new file, product 0.147.1)
     Every function, type, caller and reachability claim below was derived this session by
     reading all five source files end to end and grepping the whole of src/, e2e/ and
     scripts/ for each exported symbol. No claim is carried over from another doc.
     Two claims elsewhere were found WRONG while writing and are corrected here with the
     evidence attached: skills-and-matrix.md:540 (see "The two hashers") and the JSDoc on
     readLocalSkillMetadata in skill-metadata.ts (see Traps #4). Neither was edited by this pass. -->

# Skill Primitives (`src/cli/lib/skills/`)

**Last Updated:** 2026-08-02
**Last Validated:** 2026-08-02

> **Extracted from:** `reference/features/skills-and-matrix.md`, which gives `src/cli/lib/skills/`
> an eight-row file table at lines 82–95 and prose for only `source-switcher.ts`, `generators.ts`
> and `versioning.ts`. This file adds the per-function inventory those three already have, for the
> five modules that had none.
>
> **Why the filename is not `features/skills-and-matrix.md`.** This is a split-detail doc, and the
> map's convention for one is an **area subdirectory named after the source directory**, with the
> file named after the module(s) it covers — the `config/config-writer.md` precedent (split out of
> `features/configuration.md`). `reference/skills/` is new; it is the right home for the remaining
> `lib/skills` splits (`source-switcher.ts`, `generators.ts`) when they follow.

## Scope

**This doc owns:** the functions and exported types of `skill-copier.ts`, `skill-metadata.ts`,
`skill-fetcher.ts`, `local-skill-loader.ts` and `skill-plugin-compiler.ts` — their contracts,
reachability, and the invariants that hold across them.

**This doc deliberately does NOT own:**

| Topic                                            | Owner                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| The `metadata.yaml` **field list** and schema    | `reference/features/skills-and-matrix.md` lines 326–345                         |
| The Zod schema inventory (`.passthrough()` etc.) | `reference/types/zod-schemas.md` lines 70–95                                    |
| Path-traversal **security framing**              | `reference/boundary-map.md` § 5.3 (lines 488–493) and its § 3.3 (lines 307–313) |
| `source-switcher.ts`, `generators.ts`            | `reference/features/skills-and-matrix.md` lines 523–530, 554–565                |
| Plugin manifest / marketplace shape              | `reference/features/plugin-system.md`                                           |

Do not restate a field list or a count from those docs here.

## Reachability

**Read this table before changing anything in this directory.** Three of the exported symbols below
have **no production caller at all** — `copySkill`, `copySkillsToPluginFromSource`, `fetchSkills` —
and one of those three (`copySkill`) has no caller even in tests. Five more are reachable from
production through exactly one internal caller inside their own module. All of them are re-exported
by `skills/index.ts` regardless, so the barrel is no evidence of use.

| Export                           | File                       | Production callers                                                                                                                                                                                                        |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copySkillsToLocalFlattened()`   | `skill-copier.ts`          | `executeMigration` (`installation/mode-migrator.ts`), `copyScopedLocalSkills` (`operations/skills/copy-local-skills.ts`), `ejectSkills` (`commands/eject.ts`)                                                             |
| `copySkillsToPluginFromSource()` | `skill-copier.ts`          | **none** — barrel + `skill-copier.test.ts` only                                                                                                                                                                           |
| `copySkillFromSource()`          | `skill-copier.ts`          | one, internal: `copySkillsToPluginFromSource`                                                                                                                                                                             |
| `copySkill()`                    | `skill-copier.ts`          | **none, not even a test.** Its only other appearance in the repo is its `skills/index.ts` barrel line                                                                                                                     |
| `validateSkillPath()`            | `skill-copier.ts`          | internal (`resolveSkillPath`) + `skill-copier.test.ts`                                                                                                                                                                    |
| `fetchSkills()`                  | `skill-fetcher.ts`         | **none** — barrel `skills/index.ts` + `skill-fetcher.test.ts`                                                                                                                                                             |
| `readForkedFromMetadata()`       | `skill-metadata.ts`        | `classifySkillDirs` (`commands/uninstall.tsx`)                                                                                                                                                                            |
| `readLocalSkillMetadata()`       | `skill-metadata.ts`        | one, internal: `readForkedFromMetadata`. **Its JSDoc names a caller that does not exist** — see Traps                                                                                                                     |
| `getLocalSkillsWithMetadata()`   | `skill-metadata.ts`        | one, internal: `compareLocalSkillsWithSource`                                                                                                                                                                             |
| `computeSourceHash()`            | `skill-metadata.ts`        | one, internal: `classifyLocalSkill`                                                                                                                                                                                       |
| `compareLocalSkillsWithSource()` | `skill-metadata.ts`        | `compareSkillsWithSource` (`operations/skills/compare-skills.ts`) — called twice there, once per scope: project, then home                                                                                                |
| `injectForkedFromMetadata()`     | `skill-metadata.ts`        | `copySkillTo` (`skill-copier.ts`), `updateLocalSkills` (`commands/update.tsx`)                                                                                                                                            |
| `writeMetadataYaml()`            | `skill-metadata.ts`        | `mergeForkedFromIntoYaml`, `convertJsonToYamlWithForkedFrom` and `createMinimalMetadata` (`commands/import/skill.ts`, imported by module path — it is not in the barrel), plus `injectForkedFromMetadata` in its own file |
| `discoverLocalSkills()`          | `local-skill-loader.ts`    | `mergeDiscoveredLocalSkills` (`loading/source-loader.ts`), `countLocalSkills` (`configuration/source-manager.ts`), `checkSkillsResolved` (`commands/doctor.ts`, twice)                                                    |
| `compileSkillPlugin()`           | `skill-plugin-compiler.ts` | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                                                                             |
| `compileAllSkillPlugins()`       | `skill-plugin-compiler.ts` | `compileSkills` (`commands/build/plugins.ts`), `buildMarketplace` (`commands/new/marketplace.ts`)                                                                                                                         |
| `printCompilationSummary()`      | `skill-plugin-compiler.ts` | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                                                                             |

**Do not delete the unreachable three on the strength of this table alone.** They are public barrel
API — their `skills/index.ts` re-export lines — so an external consumer of the package can hold them.
The point of the table is the opposite one: **an agent asked to "change how a skill lands on disk"
must edit `copySkillsToLocalFlattened`, not `copySkill`** — `copySkill` looks like the primitive and
changing it accomplishes nothing.

**Grep trap.** `grep fetchSkills` hits `commands/search.ts`, where a module-private
`fetchSkillsFromExternalSource` is declared and called from `loadSkillsFromAllSources` — an
unrelated function that never calls `fetchSkills`. Match on the
word boundary or you will conclude the fetcher has a caller.

---

## `skill-copier.ts` — copying a skill onto disk

**File:** `src/cli/lib/skills/skill-copier.ts` (213 lines)

### Layering

The two functions the rest of the corpus knows (`boundary-map.md:311`) sit on top of a private core.
Everything eventually reaches `copySkillTo`:

```
copySkillsToPluginFromSource()  copySkillsToLocalFlattened()   [entry points, take SkillId[]]
        |                                |
        |  local? -> resolveLocalCopiedSkill()   local? -> in-place OR raw copy() (see below)
        v                                v
copySkillFromSource()            copySkillToLocalFlattened()   [private]
        |                                |
        +------------> copySkillTo() <---+                      [private core]
                            |
        generateSkillHash() + ensureDir() + copy() + injectForkedFromMetadata()

copySkill()  ------------> copySkillTo()                        [exported, zero callers]
```

### Exported surface

| Export                                                                                       | Signature / shape                                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `CopiedSkill`                                                                                | `{ skillId; contentHash; sourcePath; destPath; local?: boolean }` |
| `CopyProgressCallback`                                                                       | `(completed: number, total: number) => void`                      |
| `validateSkillPath()`                                                                        | `(resolvedPath, expectedParent, skillPath) => void` — throws      |
| `copySkill(skill, stackDir, registryRoot, source?)`                                          | Source root supplied as a plain path                              |
| `copySkillFromSource(skill, stackDir, sourceResult)`                                         | Source root and `source` label taken from `SourceLoadResult`      |
| `copySkillsToPluginFromSource(ids, pluginDir, sourceResult, sourceSelections?, onProgress?)` | Nested plugin layout                                              |
| `copySkillsToLocalFlattened(ids, localSkillsDir, sourceResult, sourceSelections?)`           | Flat `<dir>/<skill-id>/` layout                                   |

`copySkill` and `copySkillFromSource` differ **only** in where the source root and the provenance
`source` string come from: `copySkill` takes `registryRoot` plus an optional `source` label,
`copySkillFromSource` reads both off `SourceLoadResult` (`sourceResult.sourcePath`,
`sourceResult.sourceConfig.source`). Neither is a "copy one skill" convenience for
callers — both delegate straight to `copySkillTo` with paths built by the two resolvers below.

### Path resolution — the layout difference

| Helper                        | Produces                                                                   |
| ----------------------------- | -------------------------------------------------------------------------- |
| `getSkillSourcePath()`        | `<rootDir>/src/<skill.path>` (`SOURCE_SRC_DIR = "src"` in `consts.ts`)     |
| `getSkillDestPath()`          | `<stackDir>/skills/<skill.path minus a leading "skills/">` — **nested**    |
| `getFlattenedSkillDestPath()` | `<localSkillsDir>/<skill.id>` — **flat, keyed by ID, not by path**         |
| `resolveSkillPath()`          | `path.join` + `validateSkillPath`, so no join in this file skips the guard |

`skill.path` for a marketplace skill is `skills/<dir>/` — built by `extractAllSkills` in
`matrix/matrix-loader.ts` —
which is why `getSkillDestPath` strips exactly one leading `skills/` before re-prefixing it. Two
destinations therefore exist for the same skill: the plugin copier reproduces the source tree, the
flattened copier collapses it to one directory per skill ID. `.claude/skills/` is the flat one
(`LOCAL_SKILLS_PATH = ".claude/skills"` in `consts.ts`).

`validateSkillPath` rejects null bytes (`NULL_BYTE_PATTERN`) and any path escaping
`expectedParent` via `isPathWithin`. It is the traversal guard for **every** path this module builds.
The security framing is owned by `boundary-map.md` § 5.3 — read it there, do not restate it.

### Invariants

1. **Provenance is stamped by `copySkillTo` and by nothing else.** `copySkillTo` hashes the
   source `SKILL.md`, copies the directory, then calls `injectForkedFromMetadata`. Any code
   path that reaches disk without going through it produces a skill with **no `forkedFrom` block**.
2. **Two such paths exist in this file, both in `copySkillsToLocalFlattened`.** The in-place branch
   (via `resolveLocalCopiedSkill`) and the relocate-a-local-skill branch (which calls `ensureDir` +
   `copy` directly) both return a `CopiedSkill` without stamping metadata.
   This is deliberate — a local skill has no upstream to be forked from — and it is why
   `compareLocalSkillsWithSource` later classifies those skills `"local-only"`.
3. **`CopiedSkill.local === true` marks in-place only.** It is set in `resolveLocalCopiedSkill` and nowhere
   else. The relocate branch returns no `local` key even though the skill is local; read the flag as
   "was not copied", not as "is a local skill".
4. **`sourceSelections` overrides localness, in both entry points.** `userSelectedRemote` is
   `selectedSource && selectedSource !== EJECT_SOURCE`, computed in both entry points
   (`EJECT_SOURCE = "eject"` in `consts.ts`). A `local: true` skill with an explicit non-eject
   source selection is routed to the remote branch — see Traps for why that branch cannot resolve.
5. **Both entry points fan out with `Promise.all`.** There is no per-skill error isolation: one
   rejection rejects the whole call, with the already-completed copies left on disk.
6. **`getSkillById` throws for an unknown ID.** Both entry points call it per skill from
   `matrix/matrix-provider.ts`, so an ID absent from the current matrix aborts the batch. Pinned by
   `skill-copier.test.ts`'s "throws for unknown skills" spec.

### `CopyProgressCallback` is currently un-driven

`onProgress` is a parameter of `copySkillsToPluginFromSource` only, invoked after each skill inside
its `Promise.all` map. That function has **no production caller**, so nothing in the shipping CLI
passes a `CopyProgressCallback`. The wizard does not drive it. `UpdateLocalSkillsOptions` in
`commands/update.tsx` declares a similar-looking `onProgress?: (skillId: string) => void` — a
different arity, a different type, and unrelated to this one. `copySkillsToLocalFlattened`, the entry point that _is_ reachable, accepts no
progress callback at all: adding progress reporting to eject/migrate means adding the parameter, not
wiring an existing one.

---

## `skill-metadata.ts` — reading and writing `forkedFrom`

**File:** `src/cli/lib/skills/skill-metadata.ts` (328 lines)

### Types

| Type                    | Shape                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `ForkedFromMetadata`    | `{ skillId: SkillId; contentHash: string; date: string; source?: string }`                             |
| `LocalSkillMetadata`    | `{ forkedFrom?: ForkedFromMetadata; [key: string]: unknown }`                                          |
| `SkillComparisonResult` | `{ id; localHash; sourceHash; status: "current" \| "outdated" \| "local-only"; dirName; sourcePath? }` |

`LocalSkillMetadata` is the **declared** shape that `localSkillMetadataSchema` is cast to —
`schemas.ts` imports the type and `localSkillMetadataSchema` applies
`as z.ZodType<LocalSkillMetadata>` after `.passthrough()`. The index signature exists because
passthrough widens the parse output; the hand-written type is what consumers actually read. **The type and the schema are kept in sync by
hand.** Adding a field to one and not the other type-checks and silently misleads every reader. The
import is type-only, so the `schemas.ts ↔ skills/` cycle it forms is erased at runtime.

### The read path

| Function                                   | Contract                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readLocalSkillMetadata(skillDir)`         | Reads `<skillDir>/metadata.yaml`, `parseYaml`, `localSkillMetadataSchema.safeParse`. Returns `null` if absent **or** invalid; a Zod failure additionally `warn`s with `formatZodIssues` |
| `readForkedFromMetadata(skillDir)`         | `readLocalSkillMetadata(...)?.forkedFrom ?? null`. Two lines; adds no I/O of its own                                                                                                    |
| `getLocalSkillsWithMetadata(projectDir)`   | Lists `<projectDir>/.claude/skills/*`, reads each in parallel, returns `Map<id, { dirName, forkedFrom }>`. Empty `Map` when the directory is absent                                     |
| `computeSourceHash(sourcePath, skillPath)` | `computeFileHash(<sourcePath>/src/<skillPath>/SKILL.md)`; `null` when that file does not exist                                                                                          |
| `compareLocalSkillsWithSource(...)`        | Fans `classifyLocalSkill` over the map, `sortBy(r => r.id)`                                                                                                                             |

**Four distinct failure states collapse to one `null`.** No metadata.yaml, unreadable metadata.yaml,
Zod-invalid metadata.yaml, and valid metadata.yaml with no `forkedFrom` key are indistinguishable to
every caller of `readForkedFromMetadata`. `shouldRemoveSkill` in `commands/uninstall.tsx` is the
consequential consumer — it is exactly `forkedFrom !== null`, so a skill whose metadata.yaml is merely
**malformed** is classified user-authored and **preserved**. That is the safe direction of the
asymmetry (uninstall deletes directories), and it is why nobody has tightened it — but a caller that
wants "was this installed by the CLI" cannot get a true answer from this API today.

**Map keying, and what it hides.** `getLocalSkillsWithMetadata` keys by
`forkedFrom?.skillId ?? dirName`, so an aliased directory is reachable under its canonical
ID. Two directories carrying the same `forkedFrom.skillId` collapse to one entry — **last one in
directory order wins**, and the loser is invisible to `compareLocalSkillsWithSource` and therefore to
`agents-inc outdated`. The source comment above that parallel read states this outright; there is
no warn.

### `classifyLocalSkill` — the three-way status

Private to `skill-metadata.ts`. The order of its guards is the contract:

| Condition (in guard order)                                      | Result                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| No `forkedFrom`                                                 | `"local-only"`, both hashes `null`, `id` cast from the map key |
| `forkedFrom.skillId` not in `sourceSkills`                      | `"local-only"`, `localHash` kept, `sourceHash: null`           |
| Source `SKILL.md` missing (`computeSourceHash` returned `null`) | `"local-only"`                                                 |
| Hashes equal                                                    | `"current"`                                                    |
| Hashes differ                                                   | `"outdated"`                                                   |

`sourcePath` is present on the result **only** in the last two cases, which is exactly the field
`updateLocalSkills` (`commands/update.tsx`) guards on before attempting an update.

### The write path

`injectForkedFromMetadata(destPath, skillId, contentHash, source?)` reads the existing
`metadata.yaml`, strips the yaml-language-server comment (`stripYamlSchemaComment`), `safeParse`s it,
then writes `{ ...parsed, forkedFrom: { skillId, contentHash, date: getCurrentDate(), ...(source ? { source } : {}) } }`
back through `writeMetadataYaml` with a fresh schema comment.

Three properties a caller must know:

1. **The file must already exist.** The `readFile(metadataPath)` is unguarded — this runs after
   the directory copy, never before it.
2. **A parse failure loses every other field.** A failed `localSkillMetadataSchema.safeParse` warns
   `"Malformed metadata.yaml at '<path>' — existing fields may be lost"` and then spreads `{}`, so the
   rewritten file contains `forkedFrom` and nothing else.
3. **`forkedFrom` is replaced wholesale, not merged.** Omitting the `source` argument does not
   preserve a previously recorded `source` — it drops it. `updateLocalSkills` (`commands/update.tsx`)
   calls
   `injectForkedFromMetadata(destPath, skill.id, skill.sourceHash)` with three arguments, so
   **every `agents-inc update` erases `forkedFrom.source` from the skills it updates.** The copier
   (`copySkillTo` in `skill-copier.ts`) passes it; the updater does not.

`writeMetadataYaml(filePath, metadata, schemaComment = "")` is the single serializer:
`stringifyYaml` with `lineWidth: YAML_FORMATTING.LINE_WIDTH_NONE`, prefixed by the comment. Use it
rather than calling `stringifyYaml` inline — the line-width policy is what keeps a long
`usageGuidance` on one line instead of being folded by the YAML writer.

---

## The two hashers — and which one `forkedFrom.contentHash` really uses

There are two skill hashers in `src/cli/lib/versioning.ts`, and **they hash different things**:

| Hasher                              | Input                                                                                                   | Feeds                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `computeFileHash(filePath)`         | One file's bytes                                                                                        | `forkedFrom.contentHash` — **the update-detection path**         |
| `computeSkillFolderHash(skillPath)` | `SKILL_CONTENT_FILES` + every file under `SKILL_CONTENT_DIRS`, joined `<name>:<content>` with `\n---\n` | plugin `.content-hash` / version bumping, and a write-only field |

Both truncate to `HASH_PREFIX_LENGTH = 7` (`consts.ts`) via `computeStringHash`
(`versioning.ts`).

**`computeSkillFolderHash` does not feed `forkedFrom.contentHash`.** Both sides of the
outdated-comparison use the **`SKILL.md` file hash**:

- **Write side:** `generateSkillHash` (`skill-copier.ts`) joins `STANDARD_FILES.SKILL_MD` onto the
  source dir and returns `computeFileHash(...)`. Its result is passed to
  `injectForkedFromMetadata` by `copySkillTo`.
- **Read side:** `computeSourceHash` (`skill-metadata.ts`) joins the same `SKILL.md` and returns
  `computeFileHash(...)`. Its result is compared against `forkedFrom.contentHash` by
  `classifyLocalSkill` — both in its `localHash` binding and in its status ternary.
- **Third writer, same choice:** `importSkillFromSource` (`commands/import/skill.ts`) uses
  `computeFileHash(skillMdPath)`.

That symmetry is the whole reason `computeSourceHash` exists as a separate function rather than a
call to `computeSkillFolderHash`: **the comparison is only meaningful if both sides hash the same
bytes**, and the installed copy's own hash was taken over `SKILL.md` alone at install time. Editing
a skill's `examples/` or `reference.md` locally therefore does **not** show up as `"outdated"`.

> **Correction owed to a sibling doc.** `reference/features/skills-and-matrix.md:540` states that
> `computeSkillFolderHash` is "used for `forkedFrom.contentHash` in metadata to detect local
> modifications". It is not, on either side. That line needs the hasher swapped; this doc was written
> without editing it.

**The top-level `contentHash` field is written and never read.** `scaffoldSkillFiles`
(`commands/new/skill.ts`) computes a `computeSkillFolderHash` and `generateMetadataYaml` in the same
file emits it as a **top-level** `contentHash:` key, not under `forkedFrom`. Two test helpers do the
same (`writeTestSkill` in `lib/__tests__/helpers/disk-writers.ts`, `createTestSource` in
`lib/__tests__/fixtures/create-test-source.ts`). Grepping the whole of `src/` for readers of
`.contentHash` finds exactly two: `classifyLocalSkill` (`skill-metadata.ts`, which reads
`forkedFrom.contentHash`) and `determinePluginVersion` (`versioning.ts`, the plugin `.content-hash`
file). The top-level key survives only because `localRawMetadataSchema` is
`.passthrough()`. Do not add a reader for it expecting it to mean "is this skill modified" — it is a
scaffold-time snapshot of a different hash function.

---

## `skill-fetcher.ts` — glob-based skill copy

**File:** `src/cli/lib/skills/skill-fetcher.ts` (88 lines). **No production callers** (see
Reachability). Both exports are barrel API (`skills/index.ts`).

| Export                                                                   | Contract                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `FetchSkillsOptions`                                                     | `{ forceRefresh?: boolean }`                                                           |
| `fetchSkills(skillIds, marketplace, outputDir, sourcePath, _options={})` | Copies each skill dir into `<outputDir>/skills/<relative path>`; returns the input IDs |

**`FetchSkillsOptions` is inert.** The parameter is named `_options` and never read.
`forceRefresh` has no effect here — cache behaviour lives one layer down in
`loading/source-fetcher.ts`. Passing it is a no-op, not a bug you can fix locally.

### How it differs from `loading/source-fetcher.ts::fetchFromSource`

Different layers, despite the similar names:

|              | `fetchFromSource(source, options)` (`loading/source-fetcher.ts`)                        | `fetchSkills(...)` (`skill-fetcher.ts`)                                      |
| ------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Unit of work | A whole **source repository**                                                           | Individual **skill directories**                                             |
| Network      | Yes — giget clone/cache for remote sources, or a `directoryExists` check for local ones | None. Operates on an **already-resolved** `sourcePath`                       |
| Returns      | `FetchResult { path, fromCache }`                                                       | `SkillId[]` (the input, echoed)                                              |
| Lookup       | n/a                                                                                     | `glob("**/<skillId>*/SKILL.md", <sourcePath>/src/skills)` in `findSkillPath` |

`fetchSkills` therefore runs **after** `fetchFromSource` in any pipeline that used it.

### Contracts and traps

1. **The lookup is a prefix glob and takes the first match.** `**/${skillId}*/SKILL.md` then
   `matches[0]`, both in `findSkillPath`. `web-framework-react` matches a
   `web-framework-react-hook-form` directory, and the winner is decided by glob ordering. The copier does not have this problem — it resolves
   through the matrix's `skill.path`.
2. **It searches a different root from the copier's, by a different mechanism.** Here:
   `<sourcePath>/src/skills` (`SKILLS_DIR_PATH` in `consts.ts`). The copier: `<rootDir>/src` joined
   with `skill.path` (which itself begins `skills/`). The two resolve to the same place for a
   well-formed source, but only one of them consults the matrix.
3. **No `validateSkillPath`.** Destinations come from `path.relative(skillSourceDir, skillPath)`
   inside `fetchSkills`' copy loop, on a glob result, so they are bounded by the glob root rather
   than by an explicit guard. If you add an ID-derived path here, add the guard too.
4. **Sequential loop, no rollback.** `fetchSkills` iterates with `for...of`; a miss throws mid-loop
   and the earlier skills stay copied. Pinned by `skill-fetcher.test.ts`'s "when second of three
   skills is missing, should throw after copying only the first".
5. **`<outputDir>/skills` is created before anything is resolved** — the `ensureDir(skillsOutputDir)`
   at the top of `fetchSkills` — including for an empty ID list. Pinned by
   `skill-fetcher.test.ts`'s "should create skills output directory before resolution" and "should
   return empty array when no skill IDs are provided".
6. **A purely diagnostic code path can abort the fetch.** `logMarketplacePluginMatch` is described
   in its own comment as "diagnostic only", but it builds its message by calling
   `resolvePluginSource` **inside a template literal**, which is evaluated before `verbose()`
   decides whether to print. `resolvePluginSource` throws
   `"Malformed marketplace plugin '<name>': source has neither url, repo, nor string value"`.
   So a marketplace entry whose `name` equals a requested skill ID and whose `source` is malformed
   fails the fetch **even with verbose logging off**. Pinned by `skill-fetcher.test.ts`'s "should
   throw when marketplace plugin source has neither url nor repo". `resolvePluginSource`'s
   precedence is `source.url` -> `string source` -> `repo` + optional `#ref`; the `marketplace`
   parameter is unused (`_marketplace`).

---

## `local-skill-loader.ts` — discovering `.claude/skills/`

**File:** `src/cli/lib/skills/local-skill-loader.ts` (129 lines)

| Export                            | Shape / contract                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `LocalRawMetadata`                | `{ displayName; slug; cliDescription?; category; usageGuidance?; tags?; domain; custom? }`           |
| `LocalSkillDiscoveryResult`       | `{ skills: ExtractedSkillMetadata[]; localSkillsPath: string }`                                      |
| `discoverLocalSkills(projectDir)` | `null` when `<projectDir>/.claude/skills` does not exist; otherwise a result (possibly `skills: []`) |

**`LocalRawMetadata` is the declared shape of `localRawMetadataSchema`, not an independent type.**
`schemas.ts` imports it and `localRawMetadataSchema` casts itself to `z.ZodType<LocalRawMetadata>`
after `.passthrough().superRefine(validateCategoryField)`. The schema itself — including which fields the
`superRefine` relaxes for `custom: true` records — is documented at
`reference/types/zod-schemas.md:80` and `:85`; do not re-describe it here. What belongs here is the
consequence: **`tags?: string[]` appears in this type and in no schema field**, so it is only ever
populated through passthrough, and `reference/features/skills-and-matrix.md:344` records that `tags`
is not part of the metadata schema at all. Treat the type as a superset that must be edited in
lockstep with `schemas.ts`.

### `null` vs `{ skills: [] }`

The distinction is load-bearing for the three callers. `null` means "this project has no
`.claude/skills` directory"; an empty `skills` array means "the directory exists and every entry was
skipped". `mergeDiscoveredLocalSkills` (`loading/source-loader.ts`) and `countLocalSkills`
(`configuration/source-manager.ts`) branch on it.

### Per-skill skip rules (`extractLocalSkill`)

Every failure is per-skill and non-fatal. One corrupt directory must not abort catalog loading for
every command — the try/catch around `parseYaml` says so in a source comment.

| Condition (in guard order)        | Log level | Result |
| --------------------------------- | --------- | ------ |
| No `metadata.yaml`                | verbose   | skip   |
| No `SKILL.md`                     | verbose   | skip   |
| `parseYaml` throws (invalid YAML) | **warn**  | skip   |
| Zod `safeParse` fails             | verbose   | skip   |
| `parseFrontmatter` returns `null` | verbose   | skip   |

Unparseable YAML is the one case that warns; a schema violation only goes to verbose. That asymmetry
is intentional — a schema miss is usually an author's in-progress skill, a YAML syntax error is
usually corruption — but it means a mistyped `domain` disappears silently unless `--verbose` is on.
**Contrast this with the matrix loader:** `extractAllSkills` in `matrix/matrix-loader.ts` lets
`parseYaml` throw and aborts the whole pass (`skills-and-matrix.md` Known Limitation #2). The local
loader is the hardened one; do not "align" it with the matrix loader.

### The record it produces

The `ExtractedSkillMetadata` literal that `extractLocalSkill` returns. Two fields are computed, not
read from metadata, and both matter downstream:

- `path` = `` `${LOCAL_SKILLS_PATH}/${skillDirName}/` `` — i.e. `.claude/skills/<dir>/`,
  **not** a `skills/...` source-relative path.
- `localPath` = the absolute directory **plus `path.sep`**. The trailing separator is deliberate;
  `copySkillsToLocalFlattened` compares it with `path.resolve` on both sides in its `alreadyInPlace`
  check, which normalises it away.
- `id` comes from `SKILL.md` frontmatter `name`, never from `metadata.yaml` or the directory name.
  `description` prefers `metadata.cliDescription` over the frontmatter description, and `author` is
  forced to `LOCAL_DEFAULTS.AUTHOR` regardless of what the file says.

---

## `skill-plugin-compiler.ts` — one skill, one Claude plugin

**File:** `src/cli/lib/skills/skill-plugin-compiler.ts` (217 lines)

| Export                                         | Contract                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `SkillPluginOptions`                           | `{ skillPath: string; outputDir: string; skillName?: string }`                               |
| `CompiledSkillPlugin`                          | `{ pluginPath; manifest: PluginManifest; skillName }`                                        |
| `SkillCompilationRun`                          | `{ compiled: CompiledSkillPlugin[]; failed: string[] }` — `failed` holds directory basenames |
| `compileSkillPlugin(options)`                  | Compiles one skill. **Throws** on missing/invalid `SKILL.md`                                 |
| `compileAllSkillPlugins(skillsDir, outputDir)` | Globs `**/SKILL.md`, compiles each, **never throws**                                         |
| `printCompilationSummary(results)`             | Logs `name (vversion)` per entry                                                             |

`SkillPluginOptions` exists so `compileSkillPlugin` takes one object rather than three positionals;
`skillName` overrides the name derived from frontmatter. It is barrel-exported (`skills/index.ts`)
and used nowhere but `compileSkillPlugin`'s own signature — an object-shaped API worth keeping, but
do not expect to find a caller that names the type.

### Contracts

1. **Error posture inverts between the two entry points.** `compileSkillPlugin` throws with a
   remediation message for a missing `SKILL.md` and for null frontmatter, naming the required fields.
   `compileAllSkillPlugins` wraps each call in try/catch,
   pushes the directory basename onto `failed`, warns, and continues. **A batch run reports partial
   success; check `failed`, not just `compiled`.**
2. **`+` is stripped from skill names.** `sanitizeSkillName` replaces `/\+/g` with `-`, applied only
   when `options.skillName` is absent — `overrideName ?? sanitizeSkillName(frontmatter.name)`. The
   plugin directory and the inner `skills/<name>/` directory both use the sanitized form (the
   `pluginDir` and `skillsDir` bindings).
3. **Version comes from content, not from a field.** `computeSkillFolderHash(skillPath)` feeds
   `determinePluginVersion`, which bumps the semver **major** when the stored
   `.content-hash` differs. See `skills-and-matrix.md:545-552` for that contract. This is the hasher
   whose input is the whole folder — the correct one here, and the wrong one for `forkedFrom`.
4. **`metadata.yaml` is optional at this layer.** `readSkillMetadata` returns `null` for a missing
   file, a Zod failure (warns) or a read error (warns), and the only thing the result is used for is
   `metadata?.author` in the `generateSkillPluginManifest` call. A skill with no metadata still
   compiles.
5. **Content selection is by allow-list, not by copying the directory.** `SKILL.md` is written from
   the already-read string, then each name in `SKILL_CONTENT_FILES` (skipping `SKILL.md`) and each
   dir in `SKILL_CONTENT_DIRS`, both from `lib/metadata-keys.ts`. A
   file outside those lists is **not** copied into the plugin — and, because
   `computeSkillFolderHash` reads the same two lists, is also invisible to versioning.
6. **A `README.md` is generated, never copied** (`generateReadme`, written into `pluginDir`). It
   embeds `DEFAULT_BRANDING.NAME`, so a product rename changes emitted content.

---

## Barrel surface (`src/cli/lib/skills/index.ts`)

35 lines, six re-export blocks. Everything below is importable as `from "../skills"`:

| Block (re-export from)  | Re-exports                                                                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill-fetcher`         | `FetchSkillsOptions`, `fetchSkills`                                                                                                                                                                                                    |
| `skill-metadata`        | `ForkedFromMetadata`, `LocalSkillMetadata`, `SkillComparisonResult`, `readForkedFromMetadata`, `readLocalSkillMetadata`, `getLocalSkillsWithMetadata`, `computeSourceHash`, `compareLocalSkillsWithSource`, `injectForkedFromMetadata` |
| `skill-copier`          | `CopiedSkill`, `CopyProgressCallback`, `copySkill`, `copySkillFromSource`, `copySkillsToPluginFromSource`, `copySkillsToLocalFlattened`                                                                                                |
| `skill-plugin-compiler` | `SkillPluginOptions`, `CompiledSkillPlugin`, `SkillCompilationRun`, `compileSkillPlugin`, `compileAllSkillPlugins`, `printCompilationSummary`                                                                                          |
| `local-skill-loader`    | `LocalSkillDiscoveryResult`, `discoverLocalSkills`                                                                                                                                                                                     |
| `source-switcher`       | `deleteLocalSkill`, `migrateLocalSkillScope`                                                                                                                                                                                           |

**Some exports are NOT in the barrel** and must be imported from their module directly:
`validateSkillPath` (`skill-copier.ts`), `writeMetadataYaml` (`skill-metadata.ts`),
`LocalRawMetadata` (`local-skill-loader.ts`), and every function in `generators.ts`. Two callers
already do this and are the pattern to copy: `commands/import/skill.ts` imports `writeMetadataYaml`
from `lib/skills/skill-metadata.js`, and `schemas.ts` imports the two declared-shape types by module
path — the latter deliberately, since routing through the barrel
would pull the copier and the plugin compiler into `schemas.ts`'s import graph.

## Test surface

`npx vitest run src/cli/lib/skills/` — **6 files, 118 tests, all passing** (run 2026-08-02).

| File                            | Tests | Top-level describes                                                                                                                                               |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill-metadata.test.ts`        | 29    | `readForkedFromMetadata`, `getLocalSkillsWithMetadata`, `computeSourceHash`, `compareLocalSkillsWithSource`, `injectForkedFromMetadata`, `readLocalSkillMetadata` |
| `skill-copier.test.ts`          | 26    | `validateSkillPath` (own top-level block), then `copySkillsToPluginFromSource`, `copySkillsToLocalFlattened`                                                      |
| `skill-plugin-compiler.test.ts` | 22    | `compileSkillPlugin`, `compileAllSkillPlugins`, `printCompilationSummary`                                                                                         |
| `local-skill-loader.test.ts`    | 20    | `discoverLocalSkills`                                                                                                                                             |
| `skill-fetcher.test.ts`         | 13    | `fetchSkills`                                                                                                                                                     |
| `source-switcher.test.ts`       | 8     | (documented in `skills-and-matrix.md:523-530`)                                                                                                                    |

Two mocking styles coexist here, and copying the wrong one wastes a session:

- **Mocked-fs style** — `skill-fetcher.test.ts` and `skill-metadata.test.ts` use
  `vi.mock("../../utils/fs")` / `vi.mock("../../utils/logger")` with the manual `__mocks__`
  directories, declared **before** the module under test is imported.
- **Real-disk style** — `skill-copier.test.ts` writes real temp directories (`createTempDir` /
  `cleanupTempDir` from `lib/__tests__/test-fs-utils`), seeds the matrix singleton with
  `initializeMatrix` (imported from `matrix/matrix-provider`), and builds fixtures with the shared
  factories
  (`createMockMatrix`, `buildSourceResult`, `initMatrixAndSource`, `writeTestSkill`, `renderSkillMd`).
  The copier reaches `getSkillById`, so **a copier test that does not seed the matrix fails with
  "not found in matrix store"** — `writeLocalSkillOnDisk` (`skill-copier.test.ts`) throws that message
  deliberately.

Never inline skill/matrix/config test data; use the factories under `lib/__tests__/factories/`. See
`reference/testing/factories.md`.

## Traps

1. **Editing `copySkill` changes nothing.** It has zero callers, tests included. The reachable copy
   entry point is `copySkillsToLocalFlattened`; `copySkillsToPluginFromSource` is test-only.
2. **`agents-inc update` does not use this module's copier.** `updateLocalSkills`
   (`commands/update.tsx`) calls `copy()` and `injectForkedFromMetadata()` inline. A change to
   `copySkillTo` — including a change to which bytes get hashed — does **not** reach the update path, and the two will drift apart
   silently. This is also where `forkedFrom.source` is dropped (see the write path above).
3. **A local skill routed to the remote branch resolves a path that cannot exist.**
   `mergeLocalSkillsIntoMatrix` (`loading/source-loader.ts`) sets `path: metadata.path` when merging
   a discovered local skill
   into the matrix, so the skill's `path` becomes `.claude/skills/<dir>/` even if a marketplace skill
   of the same ID was there first. `getSkillSourcePath` (`skill-copier.ts`) resolves `skill.path`
   under `<sourceRoot>/src`, giving `<sourceRoot>/src/.claude/skills/<dir>/`. The three-part
   localness guard in `copySkillsToPluginFromSource` and `copySkillsToLocalFlattened` is what normally
   keeps local skills out of
   that branch — an explicit non-eject `sourceSelections` entry removes it.
4. **`readLocalSkillMetadata`'s JSDoc is wrong about its caller.** Its JSDoc in
   `skill-metadata.ts` says it is "Used by the uninstall command to determine whether a skill was
   installed by the CLI". Uninstall imports and calls `readForkedFromMetadata` instead, from
   `classifySkillDirs` (`commands/uninstall.tsx`); `readLocalSkillMetadata` has no
   caller outside this module and its own test. Believe the grep, not the comment.
5. **`FetchSkillsOptions.forceRefresh` does nothing** (`fetchSkills`' parameter is named
   `_options`).
6. **The top-level `contentHash` in a scaffolded `metadata.yaml` is not the fork hash** and is read
   by nothing. See "The two hashers".
7. **`LocalRawMetadata` and `LocalSkillMetadata` are hand-maintained casts over Zod schemas** in
   `schemas.ts` (`localRawMetadataSchema`, `localSkillMetadataSchema`). Change one, change the
   other, or the declared shape lies.
8. **Batch copies fan out with `Promise.all` and batch compiles do not.**
   `copySkillsToPluginFromSource` / `copySkillsToLocalFlattened` reject as a unit;
   `compileAllSkillPlugins` and `fetchSkills` iterate sequentially, the former swallowing per-skill
   errors into `failed` and the latter throwing mid-loop. Three different partial-failure shapes in
   one directory.
