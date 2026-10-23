---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/config-gate/classify.ts
  - packages/cli/src/cli/lib/hosts/host-compile-notices.ts
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
  - packages/cli/src/cli/lib/loading/loader.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  classify.ts and host-compile-notices.ts are fixed. announceRefetch in source-fetcher.ts and the
  loop in loadSkillsFromDir in loader.ts are left alone, each union being read in one file. The
  Proposed Standard is not written.
---

## What Was Wrong

These dispatches over a closed union named only some of its members, so a new member compiled
everywhere and was handled by whichever branch happened to be the fall-through:

- `tierNeedsDeps`, `tierRegeneratesTypes` and `tierPropagates` in `config-gate/classify.ts` were
  `tier === "T1" || tier === "T2"` and `tier === "T1"` over the four-member `ConsequenceTier`. A
  fifth tier would neither load deps, regenerate types nor propagate, with no error anywhere.
- `hostCompileNotices` in `hosts/host-compile-notices.ts` concatenated every host's notices, each
  host returning `[]` unless `provider` was its own (`if (provider !== "codex") return []`). A third
  provider would print no notices, with no error anywhere.
- `announceRefetch` in `loading/source-fetcher.ts` handles `superseded` with an `if` over the three
  verdicts `Exclude<CacheVerdict, "current" | "unreachable">` leaves; a new verdict is silent.
- The `requireMetadata` loop in `loadSkillsFromDir` in `loading/loader.ts` reports `unusable` and
  skips all but `admitted` of the three-member `SkillMetadataVerdict`; a new verdict is skipped
  unreported.

Measured with type-level mutations: before the change, adding `"T5"` to `ConsequenceTier` and
deleting the Codex line from `hostCompileNotices` both left `tsc --noEmit` at exit 0.

Census of provider literal comparisons in CLI source, run 2026-10-22, returning only the two
per-host guards `hostCompileNotices` now dispatches to:

```
grep -rn --include='*.ts' --include='*.tsx' -E '(!==|===) "(claude|codex)"' packages/cli/src | grep -v __tests__ | grep -v '\.test\.'
```

## Fix Applied

`classify.ts` reads the three predicates off one `TIER_CONSEQUENCES` table, declared
`satisfies Record<ConsequenceTier, TierConsequences>`. It does not use `as const`: nothing reads the
table's literal types, and Stryker mutates nothing under an `as`
(`2026-10-22-the-expressive-typescript-skill-recommends-as-const-satisfies-which-stryker-never-mutates`).
`hostCompileNotices` is an exhaustive
`switch` with a `never` default, as `hostFor` in the same directory already was. Each host keeps its
own `provider` guard, which its specs call directly. After the change, the same two mutations fail
`tsc`: TS1360 "Property 'T5' is missing" at the table, and TS2322 "`codex` is not assignable to
`never`" at the switch.

`announceRefetch` and the `loadSkillsFromDir` loop are left alone. `CacheVerdict` and
`SkillMetadataVerdict` are each read in one file, which the expressive-typescript skill exempts
("The type only appears in one place"); `ConsequenceTier` and `Provider` are read across files.

```
for t in CacheVerdict SkillMetadataVerdict ConsequenceTier Provider; do echo "== $t"; grep -rlw "$t" packages/cli/src; done
```

A sample of the class over the four directories this pass owned, run 2026-10-22. Besides the
instances above and the two per-host guards, it returns `codexListPlugins`, `labelWithoutManifest`
and `fallbackNameFor`, each over a union read in one file. The rest of `packages/cli/src` was not
swept.

```
grep -rnE '\b[a-zA-Z.]*(kind|status|verdict|tier|provider|state|outcome|result)[a-zA-Z.]* (===|!==) "[a-zA-Z-]+"' packages/cli/src/cli/lib/loading packages/cli/src/cli/lib/seed packages/cli/src/cli/lib/config-gate packages/cli/src/cli/lib/hosts | grep -v __tests__ | grep -v '\.test\.'
```

## Proposed Standard

This is the same class as
`2026-10-22-an-if-chain-over-a-union-compiles-a-new-variant-into-its-last-branch-unless-that-branch-reads-a-field-it-lacks`,
in two more shapes, neither of them an if-chain: a boolean predicate testing a subset of the
members, and a fan-out whose callees each filter themselves out. That finding proposes a
`typescript-types-bible.md` rule, and it should name all three shapes. The rule: dispatch over a
closed union with an exhaustive `switch` or a `satisfies Record<Union, …>` table. No gate holds any
of the three; a review scanning for `switch (` finds nothing to flag.

The rule has to say whether a union read in one file is exempt. This pass left two alone under the
skill's exemption; the sibling finding converted `descriptionFor` over `TargetState`, which only
`marketplace-switch-dialog.tsx` reads.
