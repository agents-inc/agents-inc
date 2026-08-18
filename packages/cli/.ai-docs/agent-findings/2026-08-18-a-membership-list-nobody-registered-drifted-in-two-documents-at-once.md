---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/utilities.md
  - .ai-docs/reference/type-system.md
  - .ai-docs/reference/boundary-map.md
  - .ai-docs/reference/monorepo-layout.md
  - .ai-docs/reference/types/core-types.md
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  The eight false claims are corrected and fifteen new registry rows are bound and
  mutation-proved, so the enumerations that drifted can no longer drift silently. What is
  pending is code-side: the drift checker cannot read a declaration wrapped in `satisfies`
  and cannot read an enumeration split across more than one contiguous table, and both
  limits leave real exhaustive claims unbindable. Neither is a documentation fix.
---

## What Was Wrong

A re-derivation of the architecture, type-system and utility pages from source found **eight**
claims that source contradicts. Seven were membership or count claims; the eighth was a claim about
what is tested. None of the seven sat in a registered enumeration, and the two most damaging had the
same shape as the defect `scripts/check-enumeration-drift.ts` was written for two days earlier.

### The claims source contradicts

| Document                    | Claim                                                               | What source holds                                                                                                    |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `reference/utilities.md`    | `SHARED_CONFIG_APPLY` has 5 keys                                    | 7 — `GLOBAL_SKILLS_HEADING` and `GLOBAL_AGENTS_HEADING` were never named                                             |
| `reference/utilities.md`    | `STANDARD_FILES` table, 20 rows                                     | 21 keys — `PACKAGE_JSON` missing                                                                                     |
| `reference/utilities.md`    | `utils/fs.ts` exports the 12 functions tabled                       | 14 — `isDirectoryEmpty()` and `removeDirIfEmpty()` missing, both with production callers                             |
| `reference/utilities.md`    | `utils/exec.ts` exports 2 types                                     | 3 — `ClaudeConfigOptions` missing                                                                                    |
| `reference/utilities.md`    | Remeda: "imported by 30 files … 28 production, 1 test-data, 1 spec" | 34 files, of which **three** are not production                                                                      |
| `reference/utilities.md`    | 14 Remeda functions in use                                          | 15 — `omit()` missing                                                                                                |
| `reference/type-system.md`  | `SkillId` / `SkillSlug` = 237 members                               | 238, in `SKILL_MAP`, `SKILL_IDS` and `SKILL_SLUGS` alike                                                             |
| `reference/boundary-map.md` | "layer (2) is the only one of the four with no test behind it"      | `src/cli/lib/__tests__/spec-gates.test.ts` lints three real zones against the real config, including the config gate |

### Why the first one is the finding and the rest are its symptoms

`SHARED_CONFIG_APPLY` named five members against seven **in two documents at once** —
`reference/utilities.md` and `reference/commands/index.md`. A third document,
`reference/commands/edit.md`, had been naming `GLOBAL_SKILLS_HEADING` and `GLOBAL_AGENTS_HEADING`
correctly the whole time. So the codebase contained both the right answer and two copies of the
wrong one, and nothing connected them.

This is the condition documentation-bible.md's "A Count Lives in Exactly One Document" describes,
and it had already been widened from count to membership. The rule was in place; the enforcement was
not. `reference/commands/index.md` introduced its table as "enumerated exhaustively" with exactly
**one** of its six objects (`STATUS_MESSAGES`) bound to the registry — and the object that had
drifted was two rows below it. A table where one row is checked and five are not reads, to every
subsequent pass, exactly like a table where all six are.

### Three exported surfaces no `reference/` document names at all

Distinct from the false claims above — these are not wrong, they are absent.

- **`isDirectoryEmpty()`** (`src/cli/utils/fs.ts`) appears nowhere in `.ai-docs/`. Its sibling
  `removeDirIfEmpty()` is described behaviourally in `boundary-map.md` and `commands/index.md` but
  was missing from the file table that claims to inventory the module.
- **`CATALOG_JSON`** and **`GENERATED_AT_BUILD`** (`src/cli/consts.ts`) appear in no reference
  document. `GENERATED_AT_BUILD` is load-bearing and non-obvious: it is why a regenerated matrix is
  not a diff of pure noise, and why `catalog.json` can answer a conditional request at all.
- **Twelve exported types under `src/cli/types/`** appear in none of `type-system.md`,
  `types/core-types.md` or `types/operations-types.md`: `AgentHookAction`, `AgentFrontmatter`,
  `RelationshipDefinitions`, `SkillRulesConfig`, `SkillRelation`, `SkillRequirement`,
  `SkillAlternative`, `PluginAuthor`, `MarketplaceRemoteSource`, `MarketplaceOwner`,
  `MarketplaceMetadata`, `MarketplaceFetchResult`. Not corrected in this pass — the three type
  documents want one owner deciding where each belongs, rather than twelve rows appended to whichever
  table is nearest.

## Fix Applied

**Corrections.** All eight claims above are corrected against source. `reference/utilities.md` was
re-derived end to end — every exported symbol of all twelve `utils/` modules, all 61 exports of
`consts.ts`, `EXIT_CODES`, and the Remeda import surface — and its `last_validated` is bumped
accordingly. `reference/type-system.md` had all five union counts and the `AGENT_NAMES` membership
re-derived and is likewise bumped. `boundary-map.md`, `monorepo-layout.md` and `types/core-types.md`
had one section each re-derived and are deliberately **not** bumped.

**Fifteen new registry rows**, all in `scripts/check-enumeration-drift.ts`:

| Rows                                                                                                                                          | Reader       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `ERROR_MESSAGES`, `SUCCESS_MESSAGES`, `STATUS_MESSAGES`, `INFO_MESSAGES`, `SHARED_CONFIG_APPLY`, `UNINSTALL_PLAN` in `reference/utilities.md` | `code-spans` |
| `UI_SYMBOLS`, `CLI_COLORS`, `SCROLL_VIEWPORT` in `reference/utilities.md`                                                                     | `code-spans` |
| `EXIT_CODES`, `STANDARD_FILES`, `STANDARD_DIRS`, `DIRS`, `SCHEMA_PATHS` in `reference/utilities.md`                                           | `table-rows` |
| `AGENT_NAMES` in `reference/type-system.md`                                                                                                   | `table-rows` |

Two document-side changes were needed to make rows possible, and both improved the documents on
their own terms. `STANDARD_FILES`/`STANDARD_DIRS` tables were keyed `STANDARD_FILES.SKILL_MD`;
`table-rows` reads the whole first cell and `code-spans` matches a backticked name to its closing
backtick, so a qualified cell is invisible to both — the prefix is what hid `PACKAGE_JSON`. And
`type-system.md`'s `AGENT_NAMES` was a comma-separated prose sentence, which no reader can parse;
it is now a table, which is what "Tables over prose" asks for anyway.

Counts that a bound membership makes redundant were **deleted** rather than restated: the `Count`
column on the message-object table, and the "exactly 19 / exactly 16 / **4** keys" prefixes on
`UI_SYMBOLS`, `CLI_COLORS` and `SCROLL_VIEWPORT`. The Remeda **file total** was deleted outright
rather than corrected — it moves on any import added anywhere under `src/cli/`, it cannot be bound
to a symbol, and it had already drifted once; the derivation command stands in its place.

**Mutation proof.** Renaming `UI_SYMBOLS.SCROLL_UP` to `SCROLL_UPWARD` and `AGENT_NAMES`'
`codex-keeper` to `codex-scribe` in the working tree, then reverting in the same process:

```
clean=false
DRIFT UI_SYMBOLS in reference/utilities.md
        document names, source lost: ["SCROLL_UP"]
        source holds, document silent: ["SCROLL_UPWARD"]
OK    CLI_COLORS in reference/utilities.md
DRIFT AGENT_NAMES in reference/type-system.md
        document names, source lost: ["codex-keeper"]
        source holds, document silent: ["codex-scribe"]

reverted; both files byte-identical: true
```

The `OK` line is the subject guard: an unrelated row in the same document stayed green, so the
failure is scoped to the member that moved rather than a blanket refusal.

**Also documented**, three behaviours that had landed in source with nothing describing them:

- `no-self-compare` moved from `packages/cli/eslint.config.js` into
  `packages/eslint-config/base.js` and now reaches every extending workspace.
  `monorepo-layout.md` gained a table of what the shared base actually states, and — more
  usefully — **why its selector half could not follow**: `no-restricted-syntax` takes options, and a
  rule's options are not merged across flat-config blocks, so the last block naming it owns all of
  them. `no-self-compare` takes none and therefore merges. That asymmetry is the thing to know
  before anyone tries to move another rule up.
- `spec-gates.test.ts` lints three zones against the real `eslint.config.js` and asserts each in
  both directions. `boundary-map.md` now splits layer (2) into the family that has this proof and
  the two families that still need a hand check, and states that the config-gate zone inherits no
  `no-restricted-syntax` at all because every block above it excludes the directory.
- The federated skill index (`skill-index:v2`, the required `bytes` field) is named in
  `monorepo-layout.md` **as something `packages/cli` does not consume**, with the one point the two
  halves touch (`MAX_EXTERNAL_SKILL_BYTES` in the seed contract). A future pass finding it
  undocumented should now leave it that way rather than importing a subject out of scope.

## Proposed Standard

**1. A table introduced as exhaustive is registered as a whole, or not described as exhaustive.**
For `standards/documentation-bible.md` → "A Count Lives in Exactly One Document". The rule already
says a new exhaustive claim "adds a row to it rather than a promise in prose". What it does not yet
say is that a table of N enumerations needs N rows: one bound row among six is worse than none,
because the introductory sentence covers all six and the check covers one. Partial binding should
be written down as a defect with a name.

**2. Two checker limits, both of which make a real claim unbindable.** For whoever owns
`scripts/check-enumeration-drift.ts`:

- **`satisfies` is not unwrapped.** `unwrap()` reads through `as` and parenthesised expressions
  only, so `export const SKILL_IDS = [...] as const satisfies readonly SkillSlug[]` enumerates
  nothing and any row naming it is a hard failure. That is correct behaviour under the "a row that
  judges nothing is a hard failure" principle, but it means the two largest generated unions cannot
  be bound. One line — `ts.isSatisfiesExpression` beside the other two — would fix it.
- **`table-rows` reads one contiguous table.** `tableRowKeysIn` stops at the first non-table line,
  so an export list a document partitions across several tables cannot be bound at all.
  `reference/types/zod-schemas.md` is exactly this shape: its 34 exported schemas are split into
  four tables under four headings, the partition is currently **correct** in both directions, and
  there is no way to register it. Re-derived by hand this pass; it will rot the same way the others
  did.

**3. `reference/architecture/`'s three pointers each carry a stale `related:` chain.** All three
correctly redirect to their root-level bodies and only the body is writable, so the pair discipline
holds. But the real `architecture-overview.md` lists `reference/architecture/dependency-graph.md`
and `reference/architecture/boundary-map.md` in its own `related:` — a reader following those lands
on a stub, not on the body. `boundary-map.md`'s `related:` points at `reference/type-system.md`,
itself a pointer. And `architecture/overview.md` carries two cross-reference bullets, where
`DOCUMENTATION_MAP.md` states a pointer holds "a redirect table and no content". Small, and a link
that lands on a stub is exactly the kind of thing that reads as a broken document.
