---
type: standard-gap
severity: medium
affected_files:
  - ../../packages/matrix/src/read-model/catalog.ts
  - ../../packages/matrix/src/read-model/sub-agents.ts
  - ../../apps/editor/src/stores/config-store.ts
  - ../../apps/editor/src/stores/persisted-schema.ts
  - ../../apps/editor/src/features/configure/lib/derive.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  CLI-421 (2026-08-07) added `typescript-types-bible.md` §12a "Closed Keys, Open Questions",
  carrying the proposed rule: keep `Partial<Record<Union, V>>` and add a `string`-taking lookup
  guarded by a type predicate; do not widen the key back to `string` (§12 is about who can ADD keys,
  not who can ASK), and do not cast at call sites. It shows the `skillById` / `isSkillId` form
  verbatim and states the membership-set requirement — build it from the generated tuple, never from
  `Object.keys` or a bare `key in map`, since an object index inherits `Object.prototype`. The
  factual note this finding asked for in §4 landed at the end of §12a: `Object.values` /
  `Object.entries` over a `Partial<Record<K, V>>` infer `V[]` / `[string, V][]`; only indexed reads
  become `V | undefined`.
---

## What Was Wrong

Narrowing `Catalog.skillsById` from `Record<string, CatalogSkill>` to
`Partial<Record<SkillId, CatalogSkill>>` (CLI-395) broke eleven call sites that the types bible has no
advice for. The map's **keys** are closed — only ids the catalogue ships ever land in it — but the
**questions** reaching it are open: the editor mints `github:owner/repo` ids for skills added
mid-session, a saved configuration can name an id a later catalogue dropped, and
`createAssignmentResolver` takes `skillId: string` on purpose and documents why. Indexing a
`Partial<Record<Union, V>>` with a `string` is `TS7053`, so every one of those legitimate questions
stopped compiling.

The two rules that look applicable both give the wrong answer:

- **§4 (`Partial<Record<UnionType, V>>` for runtime records)** is right about the storage and silent
  about the query. It never says what a caller holding a `string` should do.
- **§12 (Mixed built-in + user-extensible keys)** says _"If users can add arbitrary keys, keep
  `string`."_ Read literally that means reverting to `Record<string, V>` — throwing away the key type
  the whole task existed to recover. §12's decision rule is about who can add **keys**; this is about
  who can ask **questions**, and the two are not the same axis.

With no rule, the cheap resolutions are the wrong ones, and both are things the codebase's own
CLAUDE.md forbids: cast at each call site (`skillsById[id as SkillId]`, eleven times) or widen the
declared type back to `string` and lose the union. A third — an intersection like
`Partial<Record<SkillId, V>> & Record<string, V | undefined>` — type-checks, but the index signature
swallows the literal keys, so the `Partial` half documents nothing and a typo'd literal resolves
silently.

Worth recording alongside it, because it drove the design and is not written down anywhere:
**`Object.values` and `Object.entries` over a `Partial<Record<K, V>>` yield `V[]` and `[string, V][]`,
not `V | undefined`.** Verified with `tsc` against this repo's config. The expectation that the
sparse type would infect every iteration site is what makes this change look far more expensive than
it is — five iteration sites across three workspaces needed no change at all.

## Fix Applied

Two lookups on the matrix side, one per closed roster, exported from the package index:

```ts
// read-model/catalog.ts
const CATALOGUED_IDS = new Set<string>(SKILL_IDS);
const isSkillId = (skillId: string): skillId is SkillId => CATALOGUED_IDS.has(skillId);

export const skillById = (skillId: string): CatalogSkill | undefined =>
  isSkillId(skillId) ? CATALOG.skillsById[skillId] : undefined;
```

`subAgentById` is the same shape over `AGENT_NAMES`. Call sites changed by exactly one token —
`CATALOG.skillsById[skillId]?.displayName` became `skillById(skillId)?.displayName` — so every existing
`?.` guard survived and became load-bearing, which is the point: those guards were already correct and
the old type was what made them look redundant. No call site casts, and the editor's skill ids stay
`string`, which is the justified looseness added skills require.

The membership Set is built from the **generated tuple**, not from `Object.keys` of the map, and the
guard is a type predicate rather than a bare `.has`. `id in CATALOG.skillsById` — which three editor
sites still use for their boolean checks — is true for `"toString"`, since `Object.fromEntries` gives
the index an ordinary prototype. That hazard is pre-existing and untouched here, but a lookup built on
it would have returned `Function.prototype.toString` typed as a `CatalogSkill`.

## Proposed Standard

Add to `typescript-types-bible.md`, as §12a or a subsection of §4:

> **Closed keys, open questions.** A map whose keys come from a generated union but which is _asked
> about_ ids from outside it — user-minted ids, ids saved by an older release — keeps
> `Partial<Record<Union, V>>` and gains a lookup function taking `string`:
>
> ```ts
> export const skillById = (id: string): CatalogSkill | undefined =>
>   isSkillId(id) ? CATALOG.skillsById[id] : undefined;
> ```
>
> Do **not** widen the declared key back to `string` (§12 is about who can add keys, not who can ask),
> and do not cast at the call sites. The lookup is one narrowing in one place; the call sites keep the
> `?.` guards they already had, and those guards start doing real work.
>
> Build the guard's membership set from the **generated tuple**, never from `Object.keys` of the map or
> a bare `key in map`: an object index inherits `Object.prototype`, so `"toString" in map` is `true`.

And a factual note in §4, because assuming otherwise is what makes this migration look expensive:
`Object.values`/`Object.entries` over a `Partial<Record<K, V>>` infer `V[]` / `[string, V][]` — the
optional `undefined` is dropped from the implicit index signature. Only _indexed_ reads become
`V | undefined`.
