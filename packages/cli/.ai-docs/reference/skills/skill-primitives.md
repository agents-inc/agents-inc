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
    readLocalSkillMetadata,
    readForkedFromMetadata,
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

# Skill Primitives (`src/cli/lib/skills/`)

> **Extracted from:** `reference/features/skills-and-matrix.md`, which gives `src/cli/lib/skills/`
> a file table and prose for only `local-skill-mover.ts` and `versioning.ts`. This file adds the
> per-function inventory those two already have, for the modules that had none.
>
> **Why the filename is not `features/skills-and-matrix.md`.** This is a split-detail doc, and the
> map's convention for one is an **area subdirectory named after the source directory**, with the
> file named after the module(s) it covers — the `config/config-writer.md` precedent (split out of
> `features/configuration.md`). `reference/skills/` is new; it is the right home for the remaining
> `lib/skills` splits (`local-skill-mover.ts`) when they follow.

## Scope

**This doc owns:** the functions and exported types of `skill-copier.ts`, `skill-metadata.ts`,
`skill-fetcher.ts`, `local-skill-loader.ts`, `skill-plugin-compiler.ts` and
`unresolved-skill-entries.ts` — their contracts, reachability, and the invariants that hold across
them.

**There is no `generators.ts`.** The skill/agent/marketplace scaffolding module was deleted with the
`new` commands; nothing under `src/cli/lib/skills/` generates content any more.

**This doc deliberately does NOT own:**

| Topic                                            | Owner                                                      |
| ------------------------------------------------ | ---------------------------------------------------------- |
| The `metadata.yaml` **field list** and schema    | `reference/features/skills-and-matrix.md` § Skill Metadata |
| The Zod schema inventory (`.passthrough()` etc.) | `reference/types/zod-schemas.md`                           |
| Path-traversal **security framing**              | `reference/boundary-map.md` § 5.3 and § 3.3                |
| `local-skill-mover.ts`                           | `reference/features/skills-and-matrix.md`                  |
| The removal-reason sentences and their classes   | `reference/config/config-merger.md`                        |
| Plugin manifest / marketplace shape              | `reference/features/plugin-system.md`                      |

Do not restate a field list or a count from those docs here.

## Reachability

**Read this table before changing anything in this directory.** Three of the exported symbols below
have **no production caller at all** — `copySkill`, `copySkillsToPluginFromSource`, `fetchSkills` —
and one of those three (`copySkill`) has no caller even in tests. `copySkillFromSource` is reachable
only through one internal caller inside its own module. The barrel (`skills/index.ts`) re-exports
several of them regardless, so a barrel line is no evidence of use.

**`src/cli/lib/seed/external-skills.ts` is the second consumer of this directory**, after the
copier/installer paths. It reaches past the barrel for `validateSkillPath`, `readLocalSkillMetadata`
and `writeMetadataYaml` — three symbols that used to be internal-only — because a shared
configuration can CARRY a skill's bytes, and writing those bytes into a skill directory needs the
same traversal guard, the same metadata read and the same serializer the copier uses. Do not
re-privatise any of the three.

| Export                             | File                          | Production callers                                                                                                                                            |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copySkillsToLocalFlattened()`     | `skill-copier.ts`             | `executeMigration` (`installation/mode-migrator.ts`), `copyScopedLocalSkills` (`operations/skills/copy-local-skills.ts`), `ejectSkills` (`commands/eject.ts`) |
| `copySkillsToPluginFromSource()`   | `skill-copier.ts`             | **none** — barrel + `skill-copier.test.ts` only                                                                                                               |
| `copySkillFromSource()`            | `skill-copier.ts`             | one, internal: `copySkillsToPluginFromSource`                                                                                                                 |
| `copySkill()`                      | `skill-copier.ts`             | **none, not even a test.** Its only other appearance in the repo is its `skills/index.ts` barrel line                                                         |
| `validateSkillPath()`              | `skill-copier.ts`             | internal (`resolveSkillPath`), and `writeExternalSkills` (`seed/external-skills.ts`) on every carried file                                                    |
| `fetchSkills()`                    | `skill-fetcher.ts`            | **none** — barrel `skills/index.ts` + `skill-fetcher.test.ts`                                                                                                 |
| `readForkedFromMetadata()`         | `skill-metadata.ts`           | `classifySkillDirs` (`commands/uninstall.tsx`)                                                                                                                |
| `readLocalSkillMetadata()`         | `skill-metadata.ts`           | internal (`readForkedFromMetadata`), and `readCarriedSkills` (`seed/external-skills.ts`). Its JSDoc names only the uninstall command — see Traps              |
| `injectForkedFromMetadata()`       | `skill-metadata.ts`           | `copySkillTo` (`skill-copier.ts`)                                                                                                                             |
| `writeMetadataYaml()`              | `skill-metadata.ts`           | `injectForkedFromMetadata`, in its own file, and `readCarriedSkills` (`seed/external-skills.ts`) when it stamps a carried skill's provenance                  |
| `discoverLocalSkills()`            | `local-skill-loader.ts`       | `mergeDiscoveredLocalSkills` (`loading/source-loader.ts`), `checkSkillsResolved` (`commands/doctor.ts`, twice)                                                |
| `findUnusableSavedSkillMetadata()` | `unresolved-skill-entries.ts` | `ensureSavedSkillsReadable` (`base-command.ts`), reached from `commands/edit.tsx`                                                                             |
| `unresolvedSkillRemovalReasons()`  | `unresolved-skill-entries.ts` | `Edit.run` (`commands/edit.tsx`), for the `Changes:` block's removal rows                                                                                     |
| `compileSkillPlugin()`             | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |
| `compileAllSkillPlugins()`         | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |
| `printCompilationSummary()`        | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |

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

**File:** `src/cli/lib/skills/skill-copier.ts`

### Layering

The two functions the rest of the corpus knows (`boundary-map.md` § 3.3) sit on top of a private core.
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
   This is deliberate — a local skill has no upstream to be forked from, so nothing downstream can
   claim it came from one.
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
passes a `CopyProgressCallback`. The wizard does not drive it. `copySkillsToLocalFlattened`, the entry point that _is_ reachable, accepts no
progress callback at all: adding progress reporting to eject/migrate means adding the parameter, not
wiring an existing one.

---

## `skill-metadata.ts` — reading and writing `forkedFrom`

**File:** `src/cli/lib/skills/skill-metadata.ts`

### Types

| Type                 | Shape                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `ForkedFromMetadata` | `{ skillId: SkillId; contentHash: string; date: string; source?: string; path?: string }` |
| `LocalSkillMetadata` | `{ forkedFrom?: ForkedFromMetadata; [key: string]: unknown }`                             |

`LocalSkillMetadata` is the **declared** shape that `localSkillMetadataSchema` is cast to —
`schemas.ts` imports the type and `localSkillMetadataSchema` applies
`as z.ZodType<LocalSkillMetadata>` after `.passthrough()`. The index signature exists because
passthrough widens the parse output; the hand-written type is what consumers actually read. **The type and the schema are kept in sync by
hand.** Adding a field to one and not the other type-checks and silently misleads every reader. The
import is type-only, so the `schemas.ts ↔ skills/` cycle it forms is erased at runtime.

### The read path

| Function                           | Contract                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readLocalSkillMetadata(skillDir)` | Reads `<skillDir>/metadata.yaml`, `parseYaml`, `localSkillMetadataSchema.safeParse`. Returns `null` if absent **or** invalid; a Zod failure additionally `warn`s with `formatZodIssues` |
| `readForkedFromMetadata(skillDir)` | `readLocalSkillMetadata(...)?.forkedFrom ?? null`. Two lines; adds no I/O of its own                                                                                                    |

**Four distinct failure states collapse to one `null`.** No metadata.yaml, unreadable metadata.yaml,
Zod-invalid metadata.yaml, and valid metadata.yaml with no `forkedFrom` key are indistinguishable to
every caller of `readForkedFromMetadata`. `shouldRemoveSkill` in `commands/uninstall.tsx` is the
consequential consumer — it is exactly `forkedFrom !== null`, so a skill whose metadata.yaml is merely
**malformed** is classified user-authored and **preserved**. That is the safe direction of the
asymmetry (uninstall deletes directories), and it is why nobody has tightened it — but a caller that
wants "was this installed by the CLI" cannot get a true answer from this API today.

### The write path

`injectForkedFromMetadata(destPath, skillId, contentHash, origin)` reads the existing
`metadata.yaml`, strips the yaml-language-server comment (`stripYamlSchemaComment`), `safeParse`s it,
then writes `{ ...parsed, forkedFrom: { skillId, contentHash, date: getCurrentDate(), ...origin } }`
back through `writeMetadataYaml` with a fresh schema comment. Each member of `origin` is spread
conditionally, so an absent one materialises no key.

**`origin` is a bag, not two positional strings** — its type is
`Pick<ForkedFromMetadata, "source" | "path">` and it defaults to `{}`. The source's own comment says
why: `source` (the repository ref) and `path` (the skill's directory inside it) mean entirely
different things and two adjacent optional strings can be swapped silently.

**`path` is recorded only where it is the whole address.** A marketplace resolves every id it serves,
so an ejected marketplace skill is installable again from its id alone and where it lived inside the
repository is nobody's business. A skill a shared configuration CARRIED answers to no catalogue, and
the `(source, path)` pair is its only address — without it a producer re-sharing that installation
can name the id and not the bytes behind it. That is why `writeExternalSkills`
(`seed/external-skills.ts`) is the producer that fills it.

Three properties a caller must know:

1. **The file must already exist.** The `readFile(metadataPath)` is unguarded — this runs after
   the directory copy, never before it.
2. **A parse failure loses every other field.** A failed `localSkillMetadataSchema.safeParse` warns
   `"Malformed metadata.yaml at '<path>' — existing fields may be lost"` and then spreads `{}`, so the
   rewritten file contains `forkedFrom` and nothing else.
3. **`forkedFrom` is replaced wholesale, not merged.** Omitting a member of `origin` does not
   preserve a previously recorded one — it drops it. A caller that rewrites provenance must restate
   every field it means to keep.

`writeMetadataYaml(filePath, metadata, schemaComment = "")` is the single serializer:
`stringifyYaml` with `lineWidth: YAML_FORMATTING.LINE_WIDTH_NONE`, prefixed by the comment. Use it
rather than calling `stringifyYaml` inline — the line-width policy is what keeps a long
`usageGuidance` on one line instead of being folded by the YAML writer.

---

## The two hashers — and which one `forkedFrom.contentHash` really uses

There are two skill hashers in `src/cli/lib/versioning.ts`, and **they hash different things**:

| Hasher                              | Input                                                                                                   | Feeds                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `computeFileHash(filePath)`         | One file's bytes                                                                                        | `forkedFrom.contentHash` — stamped at install, compared by nothing yet |
| `computeSkillFolderHash(skillPath)` | `SKILL_CONTENT_FILES` + every file under `SKILL_CONTENT_DIRS`, joined `<name>:<content>` with `\n---\n` | plugin `.content-hash` / version bumping, and a write-only field       |

Both truncate to `HASH_PREFIX_LENGTH = 7` (`consts.ts`) via `computeStringHash`
(`versioning.ts`).

**`computeSkillFolderHash` does not feed `forkedFrom.contentHash`.** Everything that stamps or
verifies that field hashes the **`SKILL.md` file** and nothing else:

- **Write side:** `generateSkillHash` (private in `skill-copier.ts`) joins `STANDARD_FILES.SKILL_MD`
  onto the source dir and returns `computeFileHash(...)`. Its result is passed to
  `injectForkedFromMetadata` by `copySkillTo`.
- **No read side.** `skill-metadata.ts` used to carry a `computeSourceHash(sourcePath, skillPath)`
  that re-derived the same hash for comparison. It was deleted: nothing in production ever compared
  the stamped hash against anything, so it was a second hasher answering a question no caller asked.
  `skill-copier.test.ts` now calls `computeFileHash` on the source `SKILL.md` directly as the oracle
  that the write side stamped the hash of those same bytes.

One hasher over one file is the point: **a stamped hash only means anything if whatever eventually
checks it hashes the same bytes**, and the installed copy's hash was taken over `SKILL.md` alone at
install time. A verifier added later must call `computeFileHash` on that file — not
`computeSkillFolderHash`, which would hash a superset and never match.

**The top-level `contentHash` field is written and never read.** Two test helpers write it
(`writeTestSkill` in `lib/__tests__/helpers/disk-writers.ts`, `createTestSource` in
`lib/__tests__/fixtures/create-test-source.ts`). Grepping the whole of `src/` for readers of
`.contentHash` finds exactly one: `determinePluginVersion` (`versioning.ts`, the plugin
`.content-hash` file). The top-level key survives only because `localRawMetadataSchema` is
`.passthrough()`. Do not add a reader for it expecting it to mean "is this skill modified" — it is a
scaffold-time snapshot of a different hash function.

---

## `skill-fetcher.ts` — glob-based skill copy

**File:** `src/cli/lib/skills/skill-fetcher.ts`. **No production callers** (see
Reachability). Both exports are barrel API (`skills/index.ts`).

| Export                                                      | Contract                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `fetchSkills(skillIds, marketplace, outputDir, sourcePath)` | Copies each skill dir into `<outputDir>/skills/<relative path>`; returns the input IDs |

**It takes no options.** The inert `FetchSkillsOptions` (`{ forceRefresh? }`) and the `_options`
parameter that never read it went with the `--refresh` flag; cache behaviour lives one layer down in
`loading/source-fetcher.ts`, which now decides freshness for itself.

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

**File:** `src/cli/lib/skills/local-skill-loader.ts`

| Export                            | Shape / contract                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `LocalRawMetadata`                | `{ displayName; slug; cliDescription?; category; usageGuidance?; tags?; domain; custom? }`           |
| `LocalSkillDiscoveryResult`       | `{ skills: ExtractedSkillMetadata[]; localSkillsPath: string }`                                      |
| `discoverLocalSkills(projectDir)` | `null` when `<projectDir>/.claude/skills` does not exist; otherwise a result (possibly `skills: []`) |

**`LocalRawMetadata` is the declared shape of `localRawMetadataSchema`, not an independent type.**
`schemas.ts` imports it and `localRawMetadataSchema` casts itself to `z.ZodType<LocalRawMetadata>`
after `.passthrough().superRefine(validateCategoryField)`. The schema itself — including which fields the
`superRefine` relaxes for `custom: true` records — is documented at
`reference/types/zod-schemas.md`; do not re-describe it here. What belongs here is the
consequence: **`tags?: string[]` appears in this type and in no schema field**, so it is only ever
populated through passthrough, and `reference/features/skills-and-matrix.md` records that `tags`
is not part of the metadata schema at all. Treat the type as a superset that must be edited in
lockstep with `schemas.ts`.

### `null` vs `{ skills: [] }`

The distinction is load-bearing for both callers. `null` means "this project has no
`.claude/skills` directory"; an empty `skills` array means "the directory exists and every entry was
skipped". `mergeDiscoveredLocalSkills` (`loading/source-loader.ts`) and `checkSkillsResolved`
(`commands/doctor.ts`) are the two callers that branch on it, and the only two.

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
**The matrix loader now matches on this axis.** `extractAllSkills` (`matrix/matrix-loader.ts`)
wraps its `parseYaml` in a try and warns naming the path before skipping that skill alone, exactly
as this loader does — the two agree that one corrupt directory must not abort a catalogue load. They
still differ on level below that: a Zod failure is a `warn` in `extractAllSkills` and a `verbose`
here. Keep both per-skill; the shared invariant is that neither takes the scan down.

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

**File:** `src/cli/lib/skills/skill-plugin-compiler.ts`

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
   `.content-hash` differs. See `skills-and-matrix.md` § Versioning for that contract. This is the hasher
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

## `unresolved-skill-entries.ts` — why a saved entry the catalogue cannot resolve went

**File:** `src/cli/lib/skills/unresolved-skill-entries.ts`

The wizard resolves an installed roster against the loaded catalogue, and an id it cannot find is an
id it cannot put on any screen — so the merge drops the entry and `edit` reports a removal the user
never asked for. **These are the only removals nobody watched themselves make**, which is why they
alone carry a reason; every other removal is a deselection.

Both exports classify the same way and differ only in what they do with the verdict:

| Export                                                                     | Returns                        | Read by                                                                   |
| -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `findUnusableSavedSkillMetadata(unresolvedIds, savedSkills, projectDir)`   | `UnusableSkillMetadata[]`      | `ensureSavedSkillsReadable` (`base-command.ts`), which REFUSES the run    |
| `unresolvedSkillRemovalReasons(ids, savedSkills, projectDir, sourceLabel)` | `ReadonlyMap<SkillId, string>` | `Edit.run` (`commands/edit.tsx`), for the `Changes:` block's removal rows |

### The five fates (`SavedSkillFate`, module-private)

Classification is decided at the entry's own install path — `<skillsDir>/<id>`, resolved through
`resolveInstallPaths(projectDir, saved.scope)`, which is the single address
`copySkillsToLocalFlattened`, `deleteLocalSkill` and `migrateLocalSkillScope` all write to.

| Fate                   | Reached when                                                                                           | Sentence in `Changes:`                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `dropped-by-source`    | the entry's `origin` is not `EJECT_SOURCE` (or there is no saved entry at all) — no local copy claimed | `not present in <sourceLabel>`                                            |
| `files-gone`           | the skill directory does not exist                                                                     | `skill files no longer exist at <dir>`                                    |
| `not-installed-there`  | no `metadata.yaml`, or a `SKILL.md` whose `name` is some other skill                                   | `no skill named '<id>' is installed at <dir>`                             |
| `unplaceable-category` | everything is intact — the declared category is one no domain in this source claims                    | `installed at <dir>, but its category '<c>' is not one this source knows` |
| `unusable-metadata`    | `readSkillMetadata` says the `metadata.yaml` describes no skill                                        | **none** — `removalReason` returns `null`                                 |

**`unusable-metadata` has no sentence because that run never prints one.** It is repairable, and
`compile` already refuses the whole run over the same verdict about the same file, so
`ensureSavedSkillsReadable` stops before the Changes block is reached. A sentence written for it
could only ever be a wrong one. Spending a config record on a YAML typo — and blaming the
marketplace for it — is the outcome this split exists to prevent.

**The verdict is borrowed, not invented.** `readSkillMetadata` (`loading/loader.ts`) is the same
judgment local-skill discovery, `compile` and `doctor` share about that file, and `parseFrontmatter`'s
`name` is the same identity discovery registers a local skill under. The `switch` in `removalReason`
carries a `never` exhaustiveness default, so a sixth fate fails to compile until it has a sentence
or an explicit `null`.

---

## Barrel surface (`src/cli/lib/skills/index.ts`)

One `export { … } from` block per module, in this order. Everything below is importable as
`from "../skills"`:

| Block (re-export from)     | Re-exports                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `skill-fetcher`            | `fetchSkills`                                                                                                                                 |
| `skill-metadata`           | `ForkedFromMetadata`, `LocalSkillMetadata`, `readForkedFromMetadata`, `readLocalSkillMetadata`, `injectForkedFromMetadata`                    |
| `skill-copier`             | `CopiedSkill`, `CopyProgressCallback`, `copySkill`, `copySkillFromSource`, `copySkillsToPluginFromSource`, `copySkillsToLocalFlattened`       |
| `skill-plugin-compiler`    | `SkillPluginOptions`, `CompiledSkillPlugin`, `SkillCompilationRun`, `compileSkillPlugin`, `compileAllSkillPlugins`, `printCompilationSummary` |
| `local-skill-loader`       | `LocalSkillDiscoveryResult`, `discoverLocalSkills`                                                                                            |
| `unresolved-skill-entries` | `findUnusableSavedSkillMetadata`, `unresolvedSkillRemovalReasons`                                                                             |
| `local-skill-mover`        | `deleteLocalSkill`, `migrateLocalSkillScope`                                                                                                  |

**The checker cannot bind this table to source.** `check-enumeration-drift.ts` reads a module's own
`export const` / `export function` declarations; a re-export (`export { … } from`) is an
`ExportDeclaration` and is invisible to it. Verify this table by reading `index.ts`, not by a green
`npx vitest run scripts/`.

**Three exports are NOT in the barrel** and must be imported from their module directly:
`validateSkillPath` (`skill-copier.ts`), `writeMetadataYaml` (`skill-metadata.ts`) and
`LocalRawMetadata` (`local-skill-loader.ts`). Two of the three have a production consumer outside
this directory today — `seed/external-skills.ts` imports both `validateSkillPath` and
`writeMetadataYaml` by module path — so "not barrelled" does not mean "not used". `schemas.ts` is
the pattern to copy for the types: it imports the two declared-shape types by module path
deliberately, since routing through the barrel would pull the copier and the plugin compiler into
`schemas.ts`'s import graph.

## Test surface

`npx vitest run src/cli/lib/skills/`. Run it rather than reading a total off this page — a per-file
count is wrong within a fortnight, and `npm test` builds `dist/` first, which a bare `vitest run`
refuses to do.

| File                                    | Top-level describes                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `skill-metadata.test.ts`                | `readForkedFromMetadata`, `injectForkedFromMetadata`, `readLocalSkillMetadata`                               |
| `skill-copier.test.ts`                  | `validateSkillPath` (own top-level block), then `copySkillsToPluginFromSource`, `copySkillsToLocalFlattened` |
| `skill-plugin-compiler.test.ts`         | `compileSkillPlugin`, `compileAllSkillPlugins`, `printCompilationSummary`                                    |
| `local-skill-loader.test.ts`            | `discoverLocalSkills`                                                                                        |
| `skill-fetcher.test.ts`                 | `fetchSkills`                                                                                                |
| `local-skill-mover.test.ts`             | (documented in `skills-and-matrix.md` § Local Skill Mover)                                                   |
| `local-skill-mover-dir-cleanup.test.ts` | `deleteLocalSkill directory collapse`                                                                        |
| `unresolved-skill-entries.test.ts`      | `findUnusableSavedSkillMetadata`, `unresolvedSkillRemovalReasons`                                            |

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
2. **`agents-inc update` does not copy anything at all.** It wraps
   `claude plugin marketplace update` and leaves ejected skills — the copies this module writes —
   untouched, because eject means the user owns them. A change here reaches installs (`init`, `edit`,
   `eject`) and nothing else.
3. **A local skill routed to the remote branch resolves a path that cannot exist.**
   `mergeLocalSkillsIntoMatrix` (`loading/source-loader.ts`) sets `path: metadata.path` when merging
   a discovered local skill
   into the matrix, so the skill's `path` becomes `.claude/skills/<dir>/` even if a marketplace skill
   of the same ID was there first. `getSkillSourcePath` (`skill-copier.ts`) resolves `skill.path`
   under `<sourceRoot>/src`, giving `<sourceRoot>/src/.claude/skills/<dir>/`. The three-part
   localness guard in `copySkillsToPluginFromSource` and `copySkillsToLocalFlattened` is what normally
   keeps local skills out of
   that branch — an explicit non-eject `sourceSelections` entry removes it.
4. **`readLocalSkillMetadata`'s JSDoc names one caller and understates the surface.** It says
   "Used by the uninstall command to determine whether a skill was installed by the CLI". Uninstall
   reaches it only transitively — `classifySkillDirs` (`commands/uninstall.tsx`) calls
   `readForkedFromMetadata`, which calls this. The direct caller the comment does not mention is
   `readCarriedSkills` (`seed/external-skills.ts`), which reads the WHOLE metadata rather than just
   `forkedFrom`. Grep for the symbol before assuming the comment bounds it.
5. **The top-level `contentHash` in a scaffolded `metadata.yaml` is not the fork hash** and is read
   by nothing. See "The two hashers".
6. **`LocalRawMetadata` and `LocalSkillMetadata` are hand-maintained casts over Zod schemas** in
   `schemas.ts` (`localRawMetadataSchema`, `localSkillMetadataSchema`). Change one, change the
   other, or the declared shape lies.
7. **Batch copies fan out with `Promise.all` and batch compiles do not.**
   `copySkillsToPluginFromSource` / `copySkillsToLocalFlattened` reject as a unit;
   `compileAllSkillPlugins` and `fetchSkills` iterate sequentially, the former swallowing per-skill
   errors into `failed` and the latter throwing mid-loop. Three different partial-failure shapes in
   one directory.
