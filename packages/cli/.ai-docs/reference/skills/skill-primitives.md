---
scope: reference
area: skills
keywords:
  [
    skill-copier,
    skill-metadata,
    local-skill-loader,
    skill-plugin-compiler,
    copySkill,
    copySkillFromSource,
    copySkillTo,
    CopiedSkill,
    validateSkillPath,
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
`local-skill-loader.ts`, `skill-plugin-compiler.ts` and `unresolved-skill-entries.ts` — their
contracts, reachability, and the invariants that hold across them.

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

**Read this table before changing anything in this directory.** Two of the exported symbols below
have **no caller at all, tests included** — `copySkill` and `copySkillFromSource`. The barrel
(`skills/index.ts`) re-exports both regardless, so a barrel line is no evidence of use.

**`src/cli/lib/seed/external-skills.ts` is the second consumer of this directory**, after the
copier/installer paths. It reaches past the barrel for `validateSkillPath`, `readLocalSkillMetadata`
and `writeMetadataYaml` — three symbols that used to be internal-only — because a shared
configuration can CARRY a skill's bytes, and writing those bytes into a skill directory needs the
same traversal guard, the same metadata read and the same serializer the copier uses. Do not
re-privatise any of the three.

| Export                             | File                          | Production callers                                                                                                                                            |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copySkillsToLocalFlattened()`     | `skill-copier.ts`             | `executeMigration` (`installation/mode-migrator.ts`), `copyScopedLocalSkills` (`operations/skills/copy-local-skills.ts`), `ejectSkills` (`commands/eject.ts`) |
| `copySkillFromSource()`            | `skill-copier.ts`             | **none, not even a test.** Its only other appearance in the repo is its `skills/index.ts` barrel line                                                         |
| `copySkill()`                      | `skill-copier.ts`             | **none, not even a test.** Its only other appearance in the repo is its `skills/index.ts` barrel line                                                         |
| `validateSkillPath()`              | `skill-copier.ts`             | internal (`resolveSkillPath`), and `writeExternalSkills` (`seed/external-skills.ts`) on every carried file                                                    |
| `readForkedFromMetadata()`         | `skill-metadata.ts`           | `classifySkillDirs` (`commands/uninstall.tsx`)                                                                                                                |
| `readLocalSkillMetadata()`         | `skill-metadata.ts`           | internal (`readForkedFromMetadata`), and `registerSkillOnDisk` (`seed/external-skills.ts`). Its JSDoc names only the uninstall command — see Traps            |
| `injectForkedFromMetadata()`       | `skill-metadata.ts`           | `copySkillTo` (`skill-copier.ts`), `registerSkillOnDisk` (`seed/external-skills.ts`)                                                                          |
| `writeMetadataYaml()`              | `skill-metadata.ts`           | `injectForkedFromMetadata`, in its own file, and `registerSkillOnDisk` (`seed/external-skills.ts`) when it stamps an installed skill's provenance             |
| `discoverLocalSkills()`            | `local-skill-loader.ts`       | `mergeDiscoveredLocalSkills` (`loading/source-loader.ts`), `checkSkillsResolved` (`commands/doctor.ts`, twice)                                                |
| `findUnusableSavedSkillMetadata()` | `unresolved-skill-entries.ts` | `ensureSavedSkillsReadable` (`base-command.ts`), reached from `commands/edit.tsx`                                                                             |
| `unresolvedSkillRemovalReasons()`  | `unresolved-skill-entries.ts` | `Edit.run` (`commands/edit.tsx`), for the `Changes:` block's removal rows                                                                                     |
| `compileSkillPlugin()`             | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |
| `compileAllSkillPlugins()`         | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |
| `printCompilationSummary()`        | `skill-plugin-compiler.ts`    | `compileSkills` (`commands/build/plugins.ts`)                                                                                                                 |

**Do not delete the unreachable two on the strength of this table alone.** They are public barrel
API — their `skills/index.ts` re-export lines — so an external consumer of the package can hold them.
The point of the table is the opposite one: **an agent asked to "change how a skill lands on disk"
must edit `copySkillsToLocalFlattened`, not `copySkill`** — `copySkill` looks like the primitive and
changing it accomplishes nothing.

---

## `skill-copier.ts` — copying a skill onto disk

**File:** `src/cli/lib/skills/skill-copier.ts`

### Layering

The function the rest of the corpus knows (`boundary-map.md` § 3.3) sits on top of a private core.
Everything eventually reaches `copySkillTo`:

```
copySkillsToLocalFlattened()                      [the entry point, takes SkillId[]]
        |
        |  local? -> in-place OR raw copy() (see below)
        v
copySkillToLocalFlattened()                       [private]
        |
        v
   copySkillTo()                                  [private core]
        |
generateSkillHash() + ensureDir() + copy() + injectForkedFromMetadata()

copySkill()  ------------> copySkillTo()          [exported, zero callers]
copySkillFromSource()  --> copySkillTo()          [exported, zero callers]
```

### Exported surface

| Export                                                                             | Signature / shape                                                 |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `CopiedSkill`                                                                      | `{ skillId; contentHash; sourcePath; destPath; local?: boolean }` |
| `validateSkillPath()`                                                              | `(resolvedPath, expectedParent, skillPath) => void` — throws      |
| `copySkill(skill, stackDir, registryRoot, source?)`                                | Source root supplied as a plain path                              |
| `copySkillFromSource(skill, stackDir, sourceResult)`                               | Source root and `source` label taken from `SourceLoadResult`      |
| `copySkillsToLocalFlattened(ids, localSkillsDir, sourceResult, sourceSelections?)` | Flat `<dir>/<skill-id>/` layout                                   |

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
which is why `getSkillDestPath` strips exactly one leading `skills/` before re-prefixing it. It is
reached only by the two zero-caller exports above; the reachable entry point resolves through
`getFlattenedSkillDestPath`, which collapses the tree to one directory per skill ID under
`.claude/skills/` (`LOCAL_SKILLS_PATH = ".claude/skills"` in `consts.ts`).

`validateSkillPath` rejects null bytes (`NULL_BYTE_PATTERN`) and any path escaping
`expectedParent` via `isPathWithin`. It is the traversal guard for **every** path this module builds.
The security framing is owned by `boundary-map.md` § 5.3 — read it there, do not restate it.

### Invariants

1. **Two production functions stamp provenance: `copySkillTo` here, and `registerSkillOnDisk` in
   `src/cli/lib/seed/external-skills.ts`.** `copySkillTo` hashes the source `SKILL.md`, copies the
   directory, then calls `injectForkedFromMetadata`. Any code path in this file that reaches disk
   without going through it produces a skill with **no `forkedFrom` block**. Re-derive with
   `grep -rn 'injectForkedFromMetadata(' src --include='*.ts' | grep -v '\.test\.'`.
2. **Two such paths exist in this file, both in `copySkillsToLocalFlattened`.** The in-place branch
   (via `resolveLocalCopiedSkill`) and the relocate-a-local-skill branch (which calls `ensureDir` +
   `copy` directly) both return a `CopiedSkill` without stamping metadata.
   This is deliberate — a local skill has no upstream to be forked from, so nothing downstream can
   claim it came from one.
3. **`CopiedSkill.local === true` marks in-place only.** It is set in `resolveLocalCopiedSkill` and nowhere
   else. The relocate branch returns no `local` key even though the skill is local; read the flag as
   "was not copied", not as "is a local skill".
4. **`sourceSelections` overrides localness.** `userSelectedRemote` is
   `selectedSource && selectedSource !== EJECT_SOURCE`, computed in `copySkillsToLocalFlattened`
   (`EJECT_SOURCE = "eject"` in `consts.ts`). A `local: true` skill with an explicit non-eject
   source selection is routed to the remote branch — see Traps for why that branch cannot resolve.
5. **`getSkillById` throws for an unknown ID.** `copySkillsToLocalFlattened` calls it per skill from
   `matrix/matrix-provider.ts`, so an ID absent from the current matrix fails that skill. Pinned by
   `skill-copier.test.ts`'s "throws for unknown skills" spec.
6. **One skill failing fails the whole call, and the error names every skill that failed.**
   `copyEachSkill` wraps each copy in `attemptCopy`, which catches and returns
   `{ skillId, problem }` rather than rejecting, so the `Promise.all` always settles and no
   sibling's error is discarded. If any outcome is a failure the call throws a single `Error` built
   by `copyFailureMessage` — `Could not copy <n> of <attempted> skills:` followed by one indented
   `<skillId>: <message>` line per failure — and returns no `CopiedSkill[]` at all, because a
   partial copy would leave the config recording skills that are not on disk. The id is the
   actionable half: the copy walks the matrix and reads from the fetched source directory, so the
   ordinary cause is a disagreement between those two, which a bare `ENOENT` names only by a path
   inside the source cache. Pinned by `skill-copier.test.ts`'s "names every skill that failed, not
   only the first to reject" and "names the skill whose files the source does not carry, and writes
   none of the rest".

**`copySkillsToLocalFlattened` accepts no progress callback**, so adding progress reporting to
eject/migrate means adding the parameter, not wiring an existing one.

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

- **Write side — two production sites, both hashing `SKILL.md` alone.** `generateSkillHash` (private
  in `skill-copier.ts`) joins `STANDARD_FILES.SKILL_MD` onto the source dir and returns
  `computeFileHash(...)`; its result reaches `injectForkedFromMetadata` from `copySkillTo`. The
  second is `src/cli/lib/seed/external-skills.ts`, which calls `computeFileHash` on the installed
  skill's own `SKILL.md` inline at its `injectForkedFromMetadata` call.

  ```
  grep -rn 'injectForkedFromMetadata(' src --include='*.ts' | grep -v '\.test\.'
  ```

- **No read side.** No production code re-derives the stamped hash to compare against — the field's
  only reader is `readForkedFromMetadata` in `uninstall.tsx`, and `shouldRemoveSkill` there tests
  the object for `!== null` without opening `contentHash` at all. `skill-copier.test.ts` calls
  `computeFileHash` on the source `SKILL.md` directly as the oracle that the write side stamped the
  hash of those same bytes.

  ```
  grep -rn 'contentHash' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
  ```

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

## `local-skill-loader.ts` — discovering `.claude/skills/`

**File:** `src/cli/lib/skills/local-skill-loader.ts`

| Export                            | Shape / contract                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `LocalRawMetadata`                | `{ displayName; slug; cliDescription?; category; usageGuidance?; tags?; domain; custom? }`           |
| `LocalSkillDiscoveryResult`       | `{ skills: ExtractedSkillMetadata[]; localSkillsPath: string }`                                      |
| `discoverLocalSkills(projectDir)` | `null` when `<projectDir>/.claude/skills` does not exist; otherwise a result (possibly `skills: []`) |

**`LocalRawMetadata` is the declared shape of `localRawMetadataSchema`, not an independent type.**
`schemas.ts` imports it and `localRawMetadataSchema` casts itself to `z.ZodType<LocalRawMetadata>`
after `.passthrough()` — there is no refinement on it, and `category` is validated by
`categoryPathSchema` directly, with no branch on `custom: true`. The schema itself is documented at
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
every command.

| Condition (in guard order)                                 | Log level | Result |
| ---------------------------------------------------------- | --------- | ------ |
| No `metadata.yaml`                                         | verbose   | skip   |
| No `SKILL.md`                                              | verbose   | skip   |
| `readSkillMetadata` (`loading/loader.ts`) refuses the file | **warn**  | skip   |
| `namesPlaceholderCategory` — `category` is the placeholder | **warn**  | skip   |
| `parseFrontmatter` returns `null`                          | verbose   | skip   |

`readSkillMetadata` (`loading/loader.ts`) folds both ways of describing nothing into one verdict — a
file nothing parses out of, and a file that parses without the fields `localRawMetadataSchema`
requires — so this pass warns once carrying the reason it returns rather than branching per cause.
`extractAllSkills` (`matrix/matrix-loader.ts`) reaches the same levels by its own route: `warn`
naming the path for an unparseable file and for a schema failure alike, `verbose` for invalid
`SKILL.md` frontmatter. Keep every one of them per-skill; the shared invariant is that neither
loader takes the scan down.

### The placeholder category, and the two readers that share the verdict

`local` (`LOCAL_PSEUDO_CATEGORY`, `consts.ts`) is a trapdoor rather than a category: it belongs to no
domain, so a skill wearing it joins no grid tab and is dropped from every sub-agent's stack.
`namesPlaceholderCategory` (`lib/loading/loader.ts`) is the single verdict on it, and **both** passes
that read an installed skill's `metadata.yaml` call it:

| Reader                                           | Function                                                           | On a placeholder                                         |
| ------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------- |
| local-skill discovery behind the wizard's matrix | `extractLocalSkill` (`skills/local-skill-loader.ts`)               | **warn** naming the field and the file to fix, then skip |
| the skill discovery behind `compile`'s count     | `loadSkillsFromDir` (`loading/loader.ts`), under `requireMetadata` | `verbose`, then skip                                     |

**The levels differ deliberately; the verdict does not.** `extractLocalSkill` owns the user-facing
sentence because it is the pass every command reaches, so stating it there states it once per run
rather than once per reader. `loadSkillsFromDir` skips silently because the file is intact — there is
nothing to repair and nothing to refuse a run over. Sharing the predicate is what keeps a discovery
count and a refusal about the same skill out of one run: neither pass can load what the other
refuses, and that is the property to preserve when either is edited.

The verdict is separate from `readSkillMetadata`'s (`loading/loader.ts`), one question over — that
one asks whether the file describes a skill at all, this one whether the skill it describes can be
reached. A file can
pass the first and fail this with nothing in it malformed, which is why the placeholder is not
repairable the way an unusable file is. `loadPluginSkills` passes `requireMetadata: false`, so a
plugin skill is never put to either question.

### The record it produces

The `ExtractedSkillMetadata` literal that `extractLocalSkill` returns. Two fields are computed, not
read from metadata, and both matter downstream:

- `path` = `` `${LOCAL_SKILLS_PATH}/${skillDirName}/` `` — i.e. `.claude/skills/<dir>/`,
  **not** a `skills/...` source-relative path.
- `localPath` = the absolute directory **plus `path.sep`**. The trailing separator is deliberate;
  `copySkillsToLocalFlattened` compares it with `path.resolve` on both sides, which normalises it
  away.
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
4. **`metadata.yaml` is optional at this layer, and the reader here is not the exported one.** This
   module declares its own module-private `readPluginSkillMetadata(skillPath)` — a different
   function from the exported `readSkillMetadata(metadataPath)` in `loading/loader.ts`, which
   answers a `SkillMetadataRead` verdict and never warns. This one takes a skill DIRECTORY, returns
   `null` for a missing file, a Zod failure (warns) or a read error (warns), and its result is read
   only for `metadata?.author` and `metadata?.category` in the `generateSkillPluginManifest` call. A
   skill with no metadata still compiles.
5. **Content selection is by allow-list, not by copying the directory.** `SKILL.md` is written from
   the already-read string, then each name in `SKILL_CONTENT_FILES` (skipping `SKILL.md`) and each
   dir in `SKILL_CONTENT_DIRS`, both from `lib/metadata-keys.ts`. A
   file outside those lists is **not** copied into the plugin — and, because
   `computeSkillFolderHash` reads the same two lists, is also invisible to versioning.
6. **A `README.md` is generated, never copied** (`generateReadme`, written into `pluginDir`). It
   embeds `DEFAULT_BRANDING.NAME`, so a product rename changes emitted content. That stays the
   SHIPPED name deliberately, and is not a site `branding.name` was missed at: a compiled plugin is
   a published artefact, and the provenance line on one names the compiler that produced it rather
   than the label the operator runs under. Every surface that white-labels is something the run
   prints about itself — headers, sign-offs, the dashboard title — and none of them is written into
   a file another party receives.

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
| `unusable-metadata`    | `readSkillMetadata` (`loading/loader.ts`) says the `metadata.yaml` describes no skill                  | **none** — `removalReason` returns `null`                                 |

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
| `skill-metadata`           | `ForkedFromMetadata`, `LocalSkillMetadata`, `readForkedFromMetadata`, `readLocalSkillMetadata`, `injectForkedFromMetadata`                    |
| `skill-copier`             | `CopiedSkill`, `copySkill`, `copySkillFromSource`, `copySkillsToLocalFlattened`                                                               |
| `skill-plugin-compiler`    | `SkillPluginOptions`, `CompiledSkillPlugin`, `SkillCompilationRun`, `compileSkillPlugin`, `compileAllSkillPlugins`, `printCompilationSummary` |
| `local-skill-loader`       | `LocalSkillDiscoveryResult`, `discoverLocalSkills`                                                                                            |
| `unresolved-skill-entries` | `findUnusableSavedSkillMetadata`, `unresolvedSkillRemovalReasons`                                                                             |
| `local-skill-mover`        | `deleteLocalSkill`, `migrateLocalSkillScope`                                                                                                  |

**The checker does not bind this table to source, and the reason is the TABLE's shape, not the
checker's.** `check-enumeration-drift.ts` gained a `reexports: "every-name"` source shape that reads
exactly this barrel — every export clause's own spelling, type-only clauses included. What no reader
answers is a table keyed by MODULE with several names in one cell: `table-rows` reads the first cell
as one member, and a cell holding more than one backticked name is refused outright. Restructured one
export per row it would bind; as it stands, verify it by reading `index.ts`, not by a green
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

One `*.test.ts` sits beside each module. Read the `describe` openers off the files rather than off a
table here — `ls src/cli/lib/skills/*.test.ts`, then `grep -nP '^describe' <file>`.

Two mocking styles coexist here, and copying the wrong one wastes a session:

- **Mocked-fs style** — `skill-metadata.test.ts` and `local-skill-mover.test.ts` use
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

1. **Editing `copySkill` or `copySkillFromSource` changes nothing.** Both have zero callers, tests
   included. The reachable copy entry point is `copySkillsToLocalFlattened`.
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
   localness guard in `copySkillsToLocalFlattened` is what normally keeps local skills out of
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
7. **Batch copies fan out and batch compiles do not.** `copySkillsToLocalFlattened` maps over
   `Promise.all` through `copyEachSkill`; `compileAllSkillPlugins` iterates sequentially. Read
   `copyEachSkill` for what a partial failure does before assuming either shape.
