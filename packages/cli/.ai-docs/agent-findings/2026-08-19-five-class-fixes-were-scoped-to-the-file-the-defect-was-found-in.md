---
type: architectural-drift
severity: medium
affected_files:
  - scripts/generate-matrix-package.ts
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/lib/schemas.ts
  - src/cli/lib/loading/loader.ts
  - src/cli/lib/plugins/plugin-settings.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
  - e2e/interactive/edit-wizard-detection.e2e.test.ts
  - e2e/fixtures/project-builder.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: partial
partial_note: >-
  Re-derived against source on 2026-08-19, every class detector re-run. Three of the five classes
  are closed and two are live; both smaller residues are closed.
  Class 1 — closed. `bytewise` moved to `src/cli/utils/string.ts`, both emission sites call it,
  three specs pin the ordering red-first, and `clean-code-standards.md` § 17.3 carries the
  corrected rule. Its grep now returns one hit, and that hit is not a defect — it is the
  determinism spec's own Lithuanian-collation stand-in in `scripts/generate-matrix-package.test.ts`,
  which the grep's trailing filter cannot exclude because that filter names a tests subdirectory and
  the spec sits directly in `scripts/`.
  Class 2 — LIVE. `src/cli/lib/schemas.ts` still writes `z.string() as z.ZodType<T>` in five
  positions, and still needs the owner ruling on which of those five ids are closed vocabularies
  before it can become a task.
  Class 3 — CLOSED. `.exactOptional()` at parse boundaries is complete over both trees the rule
  governs; `typescript-types-bible.md` § 4a's census returns zero across `src/cli/` and
  `packages/matrix/src/`. See the corrected paragraph below for what happened to each of the
  four `plugin-settings.ts` sites, and for the count error the original block carried.
  Class 4 — LIVE. `resolveSkillForPopulation` in `src/cli/stores/wizard-store.ts` still names a
  cause it cannot observe and still offers no remedy.
  Class 5 — CLOSED. Its grep returns nothing, and the fix was the one this finding named — the
  E2E spec reads `slug` and `category` off the `E2E_SKILL` fixture entry rather than splitting
  `skill.id`.
  Both smaller residues are closed. The `eject.test.ts` count pin is now
  `toStrictEqual(EJECTED_TEMPLATE_ENTRIES)` carrying the reason inline, and the
  `omitMarketplaceField` JSDoc names `marketplaceName` and `origin` correctly.
  The proposed standard above all five is still unwritten, which is what holds this finding open
  alongside classes 2 and 4.
---

## What Was Wrong

Writing five standing findings up as rules meant running each rule's grep over the tree for the
first time. **Every one of the five returned a live hit**, and in each case the code-side fix that
produced the finding had been scoped to the module the defect was found in rather than to the class
it belonged to. The rules are now written and each carries its grep; what has no owner is the code.

The `affected_files:` list above is the union of the grep outputs below, pasted rather than read.

**1. Byte-wise ordering for committed generator output — one generator of two.**
`generate-source-types.ts` grew a `bytewise` comparator, a comment explaining why `localeCompare`
is unsafe at an emission site, and a determinism spec that permutes inputs and requires
byte-identical output.

```
grep -r '.localeCompare(' scripts/ src/cli/lib/configuration/ --include='*.ts' | grep -v '__tests__'
    scripts/generate-matrix-package.ts:    .sort((a, b) => a.id.localeCompare(b.id));
    src/cli/lib/configuration/config-types-writer.ts:    .sort(([a], [b]) => a.localeCompare(b))
```

`agentDefinitionsFile` sorts the `AGENT_DEFINITIONS` entries it vendors into `packages/matrix`, and
`generateStackAgentConfig` sorts the category keys it emits into a project's `config-types.ts` —
both files somebody commits. The proof obligation is the same red-first determinism spec, which
`generate-matrix-package.test.ts` did not carry.

**Closed.** Reusing the comparator where it stood was never available: nothing under `src/` may
import from `scripts/`, which is unpublished and would be dragged into the bundle. `bytewise` lives
in `src/cli/utils/string.ts` and has three callers. Both emission sites swapped, and three specs
pin the ordering against a stand-in for a Lithuanian process default, each carrying a witness
assertion that the stand-in was in force.

**2. Ids validated against the generated tuple — `packages/matrix` only.** That package's schema
now uses `z.enum(SKILL_IDS)` and its thirteen downstream casts are gone. The CLI's own
`src/cli/lib/schemas.ts` writes a strictly worse form in five positions:

```
grep -HE '^\s+[a-zA-Z]*[Ii][dD]s?: z\.(string|array\(z\.string)' src/cli/lib/schemas.ts
    src/cli/lib/schemas.ts:  id: z.string() as z.ZodType<SkillId>,
    src/cli/lib/schemas.ts:  id: z.string() as z.ZodType<AgentName>,
    src/cli/lib/schemas.ts:          id: z.string() as z.ZodType<SkillId>,
    src/cli/lib/schemas.ts:  id: z.string() as z.ZodType<Category>,
    src/cli/lib/schemas.ts:        skillId: z.string() as z.ZodType<SkillId>,
    src/cli/lib/schemas.ts:  skillId: z.string(),
```

(Four `z.string().min(1)` rows and one `.regex(KEBAB_CASE_PATTERN)` row are elided above; they are
marketplace, plugin and stack names, which are genuinely open.)

`z.string() as z.ZodType<SkillId>` asserts a membership nothing checked and hands
every consumer a union the data may not belong to — `loadAgentsFromDir` in
`src/cli/lib/loading/loader.ts` carries a boundary cast whose stated justification is the
annotation on `agentYamlConfigSchema.id`. The same file already writes `z.enum(SKILL_SLUGS)` and
`z.enum(CATEGORIES)`, so the pattern is not unknown to it.

**This one needs an owner ruling before it can be a task, and that is the point of recording it.**
The CLI reads third-party marketplaces, so the built-in tuple is not the whole vocabulary the way
it is for `packages/matrix`: a custom marketplace namespaces its skill ids, and users define custom
agents. `z.enum` is therefore probably wrong for `skillAssignmentSchema.id` and
`agentYamlConfigSchema.id`, and the honest fix is the other one — `z.string()` with an open field
type and an asserting lookup, per typescript-types-bible § 12a. Which of the five ids are closed and
which are open is a product judgement. The annotation is dishonest either way.

**3. `.exactOptional()` at parse boundaries — `schemas.ts` only.** 137 calls there and no
`.optional()` left, which is complete for that file:

```
grep -r '.optional()' src/cli/ --include='*.ts' --include='*.tsx' | grep -v '.test.'
    src/cli/lib/plugins/plugin-settings.ts:    enabledPlugins: z.record(z.string(), z.unknown()).optional(),
    src/cli/lib/plugins/plugin-settings.ts:  projectPath: z.string().optional(),
    src/cli/lib/plugins/plugin-settings.ts:  lastUpdated: z.string().optional(),
    src/cli/lib/plugins/plugin-settings.ts:  gitCommitSha: z.string().optional(),
```

`packages/matrix` carries eleven more, in `schema.ts`, `matrix-schema.ts` and `seed.ts` — three,
two and six. None of the fifteen is annotated `z.ZodType<T>`, so no annotation is currently false —
which is exactly why they were not swept, and exactly why the next annotation added over one of
them will be. (Later the same day `schema.ts` was renamed `built-in-matrix.ts` and its sub-agent
boundary split off into `built-in-agents.ts`, so its three now read two and one. The eleven, and
every word above about them, are unchanged.)

**Corrected: this block originally read "twelve more" and "sixteen", and both were wrong on the day
they were written** rather than overtaken since. Re-derived against the tree as it stood, the counts
were eleven and fifteen. `typescript-types-bible.md` § 4a records the same arithmetic independently
("one had never been right on the day it was written").

**Closed** — and closed across the whole class rather than the file named above, which is the
outcome this finding was arguing for. `enabledPlugins` was tightened to `.exactOptional()` and
carries a comment saying it is the one genuine optional in the file; `lastUpdated` and `gitCommitSha`
were decoration — declared, never read, stripped by `z.object` either way — and were deleted; and
`projectPath` was not made exact but made structural, relocated into a
`z.discriminatedUnion("scope", …)` whose `project` arm requires it and whose `user` and `local` arms
cannot express it. That last one is the substantive fix: the optionality was standing in for a
question only one scope can answer. `packages/matrix`'s eleven went with them. § 4a's census now
returns zero over both trees, and the section deliberately declines to write a hit count beside it
for the reason this class demonstrates.

**4. A refusal diagnosing a cause it cannot observe — the seed refusal only.** `fetch-seed.ts` was
reworded to lead with the remedy. The same shape survives one module away:

```
grep -rE '(may|might) have been|was probably|is likely|by a newer|by an older' src/cli/ --include='*.ts' --include='*.tsx' | grep -v '.test.'
    src/cli/stores/wizard-store.ts:      `Installed skill '${skillId}' is not present in the loaded source — it may have been removed or renamed`,
```

`resolveSkillForPopulation` cannot tell removed from renamed from namespaced-by-its-marketplace from
present-in-a-source-this-run-did-not-load. It names no remedy either.

**5. Identity derived from an id — the two factories only.** `skill-factories.ts` was fixed and its
call sites updated. The rule was never run over `e2e/`:

```
grep -rE '\b[a-zA-Z]*[Ii]d\.split\(' src/cli/lib/__tests__/ e2e/ --include='*.ts' --include='*.tsx'
    e2e/interactive/edit-wizard-detection.e2e.test.ts:          const parts = skill.id.split("-");
```

It splits `skill.id` into `category` and `slug` for `renderMetadataYaml`, and the `E2E_SKILL` entry
it reads the id from already carries the slug — so the fix is to read the field, not to add a table.

**Closed**, and by the remedy named above rather than a table: the spec now passes `category` and
`slug` as explicit fields read off the `E2E_SKILL` entry. The detector returns nothing over both
`src/cli/lib/__tests__/` and `e2e/`.

**Two smaller residues found the same way.** A directory listing is still pinned by count —
`grep -rn -A4 'await readdir(' src e2e --include='*.ts' --include='*.tsx' | grep 'toHaveLength('`
returns the templates assertion in `src/cli/lib/__tests__/commands/eject.test.ts`, three lines below
a `toStrictEqual` doing it correctly. And `PluginProjectOptions.omitMarketplaceField` in
`e2e/fixtures/project-builder.ts` documents itself as skipping "the `marketplace` field" while the
code skips `marketplaceName`, and its second sentence still calls a skill's `origin` its `source` —
the option names were corrected in the rename sweep and the JSDoc beside them was not.

**Both closed.** The count pin is now `toStrictEqual(EJECTED_TEMPLATE_ENTRIES)` and carries its own
reason inline — "a count cannot tell a swap from a match" — so the rule is legible at the assertion
rather than only in a standard. The `omitMarketplaceField` JSDoc names `marketplaceName` and calls a
skill's marketplace its `origin`. The `readdir`-plus-`toHaveLength` detector returns nothing.

## Fix Applied

**On the day of writing, class 1 only** — see the paragraph closing it above and
`clean-code-standards.md` § 17.3, which records the trigger as the process's default collation
(`LC_ALL` / `LANG`) rather than a future ICU build, and points at the comparator's real home.

The other four were untouched, and deliberately: every one is a source or test edit, class 2 wants
an owner ruling on which ids are closed vocabularies before it can be a task, and this was a
documentation pass. Recorded rather than patched, per the document-first rule for sweeps.

**Since, by other passes.** Classes 3 and 5 and both smaller residues have landed, each fixed across
its class rather than at the file named here, and each verified by re-running the detector printed
beside it above. Classes 2 and 4 are unchanged and remain the live half of this finding, along with
the Proposed Standard below. `partial_note` carries the current state; the sections above are the
dated record with closures marked in place.

## Proposed Standard

The rules are written — `clean-code-standards.md` § 3.5, § 15.2, § 17.3 and CLAUDE.md's Test
Assertions list; `typescript-types-bible.md` § 4a branch 4 and § 4b — and each carries the grep
above. What is missing is upstream of all of them:

> **A class fix runs its own grep over the whole tree before it is called landed.** Every one of
> these five started as a finding that named a file, and every one was fixed at that file. The
> finding is the specimen; the class is whatever its detector returns. Where the sweep is genuinely
> out of the task's scope, the finding says which trees were searched and which were not — an
> unqualified "fixed" over one module reads as a closed class to the next agent, and five of them in
> a row is what a documentation pass found in an afternoon.

This is the same defect `documentation-bible.md` names for prose ("a sweep scoped to whatever single
site a sentence names fixes that one, re-greps for that one ID, finds it clean and reports the class
closed"), arriving in source. The two halves are worth stating together.

**Corollary, and this finding is its own specimen.** Class 3's block above named its extent as four
sites "all in `plugin-settings.ts`", and a later repair pass read that as the worklist and scoped
itself to that one file — reproducing, against this document, the exact defect this document was
written to name. A finding that describes a class must not let the file it names stand as the
class's extent: **write the detector, not the address.** The count is a sample of what the detector
returned on a date, and the file name is a specimen of where it returned it; neither is the
population, and a reader who trusts either stops looking. `typescript-types-bible.md` § 4a has since
absorbed this half in its own words, declining to write a hit count beside its census on the ground
that "a number stored here is wrong the moment anyone acts on the rule, and wrong in the direction
that reads as work still owed", and adding that naming the file "did the sharper damage". That is
the lesson landed in a standard; what is still unwritten is the general rule quoted above it.
