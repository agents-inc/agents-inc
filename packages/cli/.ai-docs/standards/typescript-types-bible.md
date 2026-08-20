---
last_validated: 2026-04-21
---

# TypeScript Types Bible

> Principles and patterns extracted from a real-world type-narrowing effort across 37+ files.

---

## 1. Fix Types at the Source

**The #1 rule: never cast downstream to fix an upstream `string`.**

Type from the deserialization boundary (YAML parse, JSON parse, CLI args), then let types flow naturally through the pipeline. If you're casting in the middle of a function chain, the source type is wrong.

```typescript
// BAD — casting downstream
const id = rawData.id as SkillId; // workaround for untyped source

// GOOD — type the source, casts disappear downstream
type RawMetadata = {
  id: SkillId; // typed at source
  category: CategoryPath;
};
// no casts needed anywhere downstream
```

**Implementation order matters:** fix cross-cutting types first (shared interfaces in `types.ts`), because changes cascade to all consumers. Work outward from the center.

---

## 2. Union Types for Finite Sets

Use union types when a value comes from a known, closed set:

```typescript
type AgentName = "web-developer" | "api-developer" | "cli-developer";
type Domain = "web" | "api" | "cli" | "meta";
type ModelName = "sonnet" | "opus" | "haiku" | "inherit";
type PermissionMode =
  "default" | "acceptEdits" | "dontAsk" | "bypassPermissions" | "plan" | "delegate";
```

**Generated unions are the source of truth.** `SkillId`, `SkillSlug`, `Category`, `Domain`, and `AgentName` are auto-generated in `src/cli/types/generated/source-types.ts` from the skills source and agent metadata (run `bun run generate:types`). Never redeclare them, never hand-maintain a parallel list, and never cast a literal string member to them — the literal string IS the type. Casts like `"web-framework-react" as SkillId` or `"web" as Domain` are anti-patterns; only cast at data-entry boundaries (YAML, JSON, CLI args) or in error-path tests that deliberately use an invalid value (in which case prefer `string` over `as SkillId`).

**Keep `string` when the set is open-ended:**

- Display names, descriptions, titles, reasons, messages
- Filesystem paths
- Semver strings
- URLs, emails
- Free-form tags, keywords
- User-extensible identifiers (custom agent names, plugin names)
- Tool names (extensible via MCP)

**Decision rule:** If you can't enumerate every valid value, keep it `string`.

---

## 3. Template Literal Types for Structured IDs

When IDs follow a pattern but the full set is too large to enumerate:

```typescript
type SkillIdPrefix = "web" | "api" | "cli" | "meta" | "mobile";
type SkillId = `${SkillIdPrefix}-${string}`;
// Matches: "web-framework-react", "api-database-drizzle"
// Rejects: "unknown-something", plain "react"
```

This gives partial validation — the prefix is constrained, the suffix is open. Better than `string`, practical unlike full enumeration.

---

## 4. `Partial<Record<UnionType, V>>` for Runtime Records

**Never use `Record<UnionType, V>` when runtime won't have all keys.**

```typescript
// BAD — implies every Category key exists at runtime
categories: Record<Category, CategoryDefinition>;

// GOOD — correctly models sparse runtime data
categories: Partial<Record<Category, CategoryDefinition>>;
```

This applies universally:

- `Partial<Record<SkillId, ResolvedSkill>>` — not all skills present
- `Partial<Record<SkillAlias, SkillId>>` — not all aliases mapped
- `Partial<Record<Domain, SubcategorySelections>>` — not all domains selected

**TypeScript forces you to handle `undefined` access, which is correct.**

**Initializing an empty record: annotate, don't cast.**

```typescript
// BAD — cast implies the empty literal is already the target shape
const byCategory = {} as Record<Category, Skill[]>;
const byCategory = {} as Partial<Record<Category, Skill[]>>;

// GOOD — type annotation on the binding, literal stays literal
const byCategory: Partial<Record<Category, Skill[]>> = {};
```

The annotation form is preferred because the literal `{}` never masquerades as a complete record — the compiler tracks population as assignments land.

**Asserting lookups instead of non-null assertions.** When a skill must exist in the matrix, never write `matrix.skills[id]!` — use `getSkillById(id)` / `getSkillBySlug(slug)` from `src/cli/lib/matrix/matrix-provider.ts`, which throw with a diagnostic message. Reserve `matrix.skills[id]` (no `!`) for genuinely optional lookups, where the `undefined` branch is handled.

---

## 4a. Absent vs Explicitly `undefined`

§4 is the rule for a missing map ENTRY. This is the same question one level down — a missing PROPERTY — and `exactOptionalPropertyTypes` (on repo-wide in `@workspace/typescript-config/base.json`) makes the codebase answer it on every optional field. There are exactly two shapes:

```typescript
// (a) keep absence real — the default
...(stack.group !== undefined && { group: stack.group }),

// (b) say the property honestly holds undefined — the exception
slug?: string | undefined;
```

**Decision rule, in order:**

1. **You build the object and the field is genuinely sometimes absent → spread-conditional (a).** `CatalogStack.group`, `SubAgent.model`, `SkillCellView.incompatibleReason`. Absence stays absence, so `?` keeps meaning what it says.
2. **You hand a maybe-value to a type you do not own → spread-conditional (a), always.** Widening is not on offer, and `?? null` / `?? {}` invents a value their API never asked for. `RequestInit.signal`, Sentry's `extra`, Playwright's `workers`.
3. **It is a React prop whose body already treats absent and `undefined` identically → `?: T | undefined` (b).** JSX has always read an undefined prop as an absent one, which is why `@types/react` writes every prop it owns that way, and why `title={view.incompatibleReason}` never errored while a hand-written sibling prop did. A conditional spread in JSX buys nothing and costs a reader.
4. **It is a zod schema at a parse boundary → `.exactOptional()`, never `.optional()`.** The first three branches describe objects you build by hand and say nothing about objects a parser builds for you. `.optional()` does two things people conflate: it makes the key optional, AND it accepts a present-but-`undefined` value and preserves the key. So `s.parse({ a: "x", b: undefined })` returns an object where `"b" in result` is `true`, the parsed value is `{ k?: V | undefined }`, and every `z.ZodType<T>` annotation over it is false under `exactOptionalPropertyTypes`. `.exactOptional()` keeps the key optional and rejects the undefined value — the schema-level statement of this section's default, applied at the boundary instead of in the type.

Widening `T`'s optional properties to satisfy the annotation is the reflex this section already warns about: it moves the lie into the domain type, where every consumer inherits it. Fifteen annotated schemas in `src/cli/lib/schemas.ts` were false, and the honest-looking fix would have touched roughly fifty properties across `types/matrix.ts` and `types/config.ts`. Two things to check before adopting it on an existing schema: the emitted JSON Schema should be unchanged (JSON Schema cannot express "present and undefined"), and no caller should `.parse()` an object literal built from a maybe-value — the compiler catches the second for you, because `.exactOptional()` narrows the INPUT type too. It is a tightening, not a weakening: it rejects an input the old schema accepted and accepts nothing new. The one reachable behavioural edge is a hand-written `.claude-src/config.ts` carrying `description: undefined`, which now fails to load; the CLI's own generator never emits such a key, and JSON and YAML cannot represent `undefined` at all.

`schemas.ts` is fully migrated — 137 `.exactOptional()` calls and no `.optional()`. The remainder is the check, over both trees this section governs:

```
grep -rn '\.optional()' src/cli/ ../matrix/src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

**The hit count is deliberately not written beside it.** This is a worklist rather than a total: its correct end state is zero, so a number stored here is wrong the moment anyone acts on the rule, and wrong in the direction that reads as work still owed. The passage that stood here carried two counts and a scope claim, and re-deriving them found all three false — one had gone to zero, one had never been right on the day it was written, and the scope claim had been overruled. Naming the file did the sharper damage: a reader who trusts "all in `plugin-settings.ts`" stops looking anywhere else, which is the scoping failure this branch exists to prevent. `agent-findings/INDEX.md` declines to write its own count for the same reason. `DOCUMENTATION_MAP.md`'s "Coverage" keeps both a number and its invocation, and the difference is that Coverage claims sole ownership of its totals — an ownership claim needs a value for a competing copy to collide against. Nothing owns this census, so the invocation is the whole of it.

**`packages/matrix` is governed by this document** — owner ruling, 2026-08-19 — and the reason is the vendoring rather than the workspace boundary, so check the reason before relying on the conclusion. `scripts/generate-matrix-package.ts` writes `packages/matrix/src/vendor/` by reading the files named in its own `VENDORED_TYPE_FILES` out of `src/cli/types/` and copying them verbatim; its `check` entry point compares every committed copy against a fresh read for byte equality and reports any difference as drift, which `generate:matrix:check` fails on, so the copy cannot diverge quietly. `packages/matrix/src/built-in-matrix.ts` then types itself from that copy, importing `./vendor/generated/source-types` and `./vendor/matrix`, and the traffic runs the other way as well — the CLI's own generator imports `matrixSchema` from `@workspace/matrix/matrix-schema` to validate what it is about to emit. A rule about the CLI's types is therefore a rule about a package assembled out of them. **What would retire this: `generate-matrix-package.ts` ceasing to vendor `src/cli/types/`.** Nothing else about the workspace boundary is load-bearing, and "it is a different workspace" was never the question the ruling turned on.

**Never `?? fallback` to dodge the flag.** Inventing `null`, `""` or `{}` where the caller had nothing is the silent-fallback failure `packages/cli/CLAUDE.md` already bans under Data Integrity, and this flag makes it newly tempting.

**Never delete the `?`.** Making a property required to satisfy the compiler moves the lie rather than fixing it.

Applying (b) by reflex is the failure mode to watch for: a type that admits `undefined` everywhere is an optional property that no longer means anything, which is the exact thing the flag exists to prevent.

---

## 4b. Validate Ids Against the Generated Tuple

§4 narrows a record's KEYS. This narrows the ids inside the parsed VALUES, which is a different question and the one that goes unasked. A schema at a parse boundary is the only place a renamed or dropped id can be caught; `z.string()` there does not merely skip the check, it forces every consumer downstream to cast the union back — and those casts are §6's "mid-pipeline workaround" row, which this same document says to fix at the source.

`SKILL_IDS`, `SKILL_SLUGS`, `CATEGORIES`, `AGENT_NAMES` and `MODEL_NAMES` are emitted as `as const satisfies readonly …[]` precisely so `z.enum` can take them — `z.enum` requires a readonly tuple. `packages/matrix/src/built-in-matrix.ts` (then `schema.ts`) opened with the claim that a regenerated catalog dropping something we depend on "fails here, loudly, instead of rendering a blank table", and for ids that claim was false: every id was `z.string()`, so a renamed skill parsed cleanly and surfaced later as a lookup returning nothing. Thirteen casts existed downstream for no other reason, none of them commented.

**Corollary for review: a cast to a generated union in a read model is evidence its schema is loose.** Look upstream before accepting one.

```
grep -rnE '\bas (SkillId|SkillSlug|Category|Domain|AgentName|ModelName)\b' ../matrix/src/read-model/ ../matrix/src/built-in-matrix.ts ../matrix/src/built-in-agents.ts --include='*.ts' | grep -v '\.test\.'
```

Two boundaries the rule does not cross, and both matter more than the rule:

**Where the vocabulary is authored downstream of the schema, validating at the boundary is an import cycle.** Narrow at the module that owns the list, with an asserting lookup, and say so in a comment at the boundary. `SubAgent.flavor` is the live case: `ROLE_FLAVORS` lives in `read-model/preload-defaults.ts`, which reads `schema.ts`, so importing it back throws at import time rather than at review time.

**Where the vocabulary is genuinely open, keep `z.string()` and an open field type — but never `z.string() as z.ZodType<SkillId>`.** That form is worse than either honest option: it asserts a membership nothing checked, and it hands every consumer a union the data may not belong to. This is a live shape in `src/cli/lib/schemas.ts`, which reads third-party marketplaces and so legitimately meets ids outside the built-in tuple (a custom marketplace namespaces its skill ids; users define custom agents):

```
grep -nE '^\s+[a-zA-Z]*[Ii][dD]s?: z\.(string|array\(z\.string)' src/cli/lib/schemas.ts
```

The same file already writes `z.enum(SKILL_SLUGS)` and `z.enum(CATEGORIES)`, so the pattern is not unknown to it; the open positions are `skillAssignmentSchema.id`, `agentYamlConfigSchema.id` and `categoryDefinitionSchema.id` / `.domain`, and `loadAgentsFromDir` in `src/cli/lib/loading/loader.ts` carries a boundary cast whose stated justification is the annotation on the second of those. Whether each id is open or closed is a product judgement, not a mechanical one — but the annotation must state the answer honestly either way. §12a is the read side of the open case: a `Partial<Record<Union, V>>` plus a lookup taking `string`, never eleven casts at the call sites.

---

## 4c. An Asserting Lookup on Another Module's Data Is a Claim About That Module

§4b's two boundaries both END in an asserting lookup, and both say "say so in a comment". This states what the comment has to contain, because a comment naming the fact and not its guarantor is unfalsifiable: **name the function that enforces the invariant and what it does to the bad case.** A reader of the asserting module alone cannot discover either, and a test author building the data by hand has nothing enforcing it at all (see `clean-code-standards.md` 6.23 for that half).

`validateRequirements` in `src/cli/lib/matrix/matrix-resolver.ts` renders every unmet requirement through `getLabel(getSkillById(id))`, and `getSkillById` throws `Skill not found`. It is safe two modules away: `resolveEveryNeed` in `src/cli/lib/matrix/skill-resolution.ts` takes a requirement's needs **whole or not at all** — `null` unless every slug resolves, because keeping the survivors would apply a requirement nobody wrote — so no loaded catalog can carry a requirement naming a skill it does not have. Neither file says this. `labelOf` in the same resolver does carry a boundary-cast comment ("every id inside a cause was read out of the matrix's own relationship tables"), which is the right instinct and still stops one step short: it states where the ids came from, not which function would have dropped a bad one.

The failure mode is not a crash — the invariant holds — it is that a later change to the loader has no way to know what depends on it, and the assertion is where the cost lands.

---

## 5. Pre-Resolution vs Post-Resolution Types

Data that passes through a resolution/normalization step should have different types before and after:

```typescript
// Pre-resolution: user input can be alias OR canonical ID
type ExtractedSkillMetadata = {
  requires: (SkillAlias | SkillId)[]; // "react" or "web-framework-react"
  conflictsWith: (SkillAlias | SkillId)[];
};

// Post-resolution: always canonical IDs
type ResolvedSkill = {
  requires: SkillId[]; // always "web-framework-react"
  conflictsWith: SkillId[];
};
```

This encodes pipeline semantics in the type system — the compiler catches resolution bugs.

---

## 6. Classify Your Casts

Not all casts are bad. Classify them:

| Cast Type                        | Legitimate?       | Example                                                                                                                                                            |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Object.keys/entries boundary** | Yes               | `Object.keys(record) as Category[]` — TS always returns `string[]`                                                                                                 |
| **CLI arg boundary**             | Yes               | `flags.category as CategoryPath` — user input enters as `string`                                                                                                   |
| **YAML/JSON parse boundary**     | Yes               | `parseYaml(content) as Record<string, unknown>`                                                                                                                    |
| **Test data construction**       | Yes               | `{ id: "test" } as SkillId` — intentionally invalid test values                                                                                                    |
| **Store initialization**         | Prefer annotation | `const x: Partial<Record<...>> = {}` beats `{} as Partial<Record<...>>`. Cast only when assignment context makes annotation awkward (e.g. inline callback return). |
| **vi.mock factory literals**     | Yes               | `"agents-inc"` inside `vi.mock()` — Vitest hoists factories above imports, so constants are unavailable                                                            |
| **Branded record construction**  | Yes               | `{...} as unknown as Record<BrandedA, BrandedB>` — object literal keys can't satisfy branded types directly                                                        |
| **Mid-pipeline workaround**      | **No**            | Fix the source type instead                                                                                                                                        |

**Every legitimate boundary cast should have a comment explaining why.**

For the full boundary cast taxonomy with real codebase examples (6 categories, acceptable vs
unacceptable patterns, post-safeParse conventions), see
[`clean-code-standards.md` Section 7.2](clean-code-standards.md).

**Double cast through `unknown` for branded Record keys.** When constructing a Record whose keys and values are both branded template literal types (e.g., `SkillDisplayName`, `SkillId`), a single `as` cast fails because object literal string keys are not assignable to branded types. Use `as unknown as Record<BrandedKey, BrandedValue>` with a comment:

```typescript
// Double cast needed: object literal's string keys are not assignable to branded
// SkillDisplayName/SkillId types without going through `unknown` first (boundary cast)
const displayNameToId = {
  react: "web-framework-react",
  zustand: "web-state-zustand",
} as unknown as Record<SkillDisplayName, SkillId>;
```

Prefer typed helper functions over raw casts for recurring patterns. These live in `src/cli/utils/typed-object.ts` — import from there, do not re-implement:

```typescript
// src/cli/utils/typed-object.ts
export function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

export function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[] {
  return Object.keys(obj) as K[];
}
```

**Runtime narrowing uses type guards, not casts.** For string-to-union narrowing at runtime, use the guards in `src/cli/utils/type-guards.ts` — `isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`. They check membership against the generated `CATEGORIES` / `DOMAINS` / `AGENT_NAMES` arrays from `src/cli/types/generated/source-types.ts`, so adding a new value to the source automatically widens the guard.

```typescript
// BAD — cast asserts membership without checking
const domain = flags.domain as Domain;

// GOOD — guard narrows, fall-through handles invalid input
if (!isDomain(flags.domain)) {
  throw new Error(`Invalid domain: ${flags.domain}`);
}
// flags.domain is now Domain
```

---

## 6a. Searching an Array of Discriminated Results

The `{ ok: true, … } | { ok: false, … }` result type is everywhere here, and "did any of these fail?" over an array of them is where narrowing quietly stops working. TypeScript infers a type predicate for a `.find` / `.filter` callback under conditions that are narrow and invisible at the call site, so the same-looking line narrows in one file and not in the next. Measured against this repo's compiler:

| Callback shape              | Narrows? |
| --------------------------- | -------- |
| `(f) => !f.ok`              | yes      |
| `(f) => { … return bad; }`  | yes      |
| `({ ok }) => !ok`           | **no**   |
| `(f, i) => !f.ok && i >= 0` | **no**   |

Destructuring the discriminant away, or reading the index parameter, drops the inference and `.find` reverts to its declared `T | undefined`. The site then needs a second `ok` guard that is dead at runtime — and a dead guard is indistinguishable from a real one to the next reader, in a codebase whose "no silent fallbacks" rule teaches them to distrust exactly that shape. The next person either deletes it and breaks the build, or leaves it and wonders what case it covers.

**The lint signal points the wrong way, which is the part worth remembering.** `@typescript-eslint/no-unnecessary-condition` fires on the second guard precisely when the inference DID land and the guard is therefore redundant — the good shape. Where the inference did not land the guard is load-bearing, so lint stays quiet. A green lint on `x && !x.ok` is evidence of the bad shape, not the absence of it.

**Prefer the walk in either case.** It is shorter than the `.find` + `flatMap` pair it replaces, does one pass instead of two, and states the all-or-nothing rule in the shape of the code rather than in a comment beside it:

```ts
const files: Record<string, string> = {};
for (const file of fetched) {
  if (!file.ok) return file.failure;
  files[file.relative] = file.text;
}
```

`if (!x.ok) return` narrows `x` for the rest of the block, so the accumulator is built in the same pass with no guard to explain. Where the results come from a `Promise.all`, the sequential-looking loop is over results that have already settled — the fetches still ran in parallel.

Two notes. The rule is about arrays: a single result reads fine as `if (!result.ok) return result.error` and needs nothing. And **an explicit type predicate is worse than either**, not better: `(f): f is Extract<R, { ok: false }> => !f.ok` restates the discriminant in a second place, so a third variant added to the union type-checks and is silently skipped.

```
grep -rnE '\.(find|filter)\((\(\{ *(ok|success|valid)\b|\([a-zA-Z]+, *[a-zA-Z]+\) *=> *!?[a-zA-Z]+\.(ok|success|valid)\b)' src/ e2e/ scripts/ --include='*.ts' --include='*.tsx'
```

Currently clean. The grep finds the two non-narrowing shapes and cannot find a third: a callback whose body is complex enough to defeat inference while still reading `x.ok` directly. Treat it as a floor.

---

## 6b. A `let` Assigned Inside `beforeAll` Is Not Definitely Assigned

The second case where a type-aware lint verdict is not evidence, and by far the higher-volume one. §6a's is an inference that silently fails to land; this one is a declaration that is simply optimistic, and the rule reads the declaration.

```ts
let fixture: E2ESource; // no `| undefined`
beforeAll(async () => {
  fixture = await createE2ESource();
});
afterAll(async () => {
  if (fixture) await cleanupTempDir(fixture.tempDir); // reported always-truthy
});
```

TypeScript has no flow analysis across hook callbacks, so it types `fixture` as definitely assigned and `@typescript-eslint/no-unnecessary-condition` calls the guard redundant — 49 sites across 40 files when the rule was first stood up here, its largest single cluster. The guard is not dead. When `beforeAll` throws before the assignment lands, `fixture` is `undefined` and `afterAll` masks the real setup failure with a `TypeError`. **The declaration is the lie; the guard is the only thing describing reality.** Never delete a teardown guard because a type-aware rule calls it redundant.

**The rule sees only the declarations whose type has no falsy member, which is the half of the class worth knowing.** `let fixture: E2ESource;` is reported because an object is always truthy; `let sourceTempDir: string;` under the identical `if (sourceTempDir)` teardown is **not**, because `""` is falsy and the condition is therefore not provably vacuous. Measured directly — one probe file declaring both shapes returns exactly one report, on the object. So the string-typed temp-dir guards, which are the dominant shape in this suite, carry the same optimistic declaration with no signal at all attached to them. Silence from the rule is not evidence that a declaration is honest, and a sweep that "cleared" the class by acting on its reports has cleared only the object-typed subset.

Two of the three available fixes were rejected on measurement, and the numbers are the argument:

| Fix                                                        | Cost                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Delete the guards                                          | 49 runtime protections removed on the word of a wrong type; reads as progress in a diff |
| Honest declaration (`let fixture: E2ESource \| undefined`) | 251 `possibly undefined` errors across the same 40 files — right, and a task of its own |
| Move the guard where the type can be honest                | 49 call sites become one call; nothing deleted, no `eslint-disable`                     |

**Put the guard in a helper whose PARAMETER type admits `undefined`** — `cleanupFixture(fixture: { tempDir: string } | undefined)` in `e2e/helpers/test-utils.ts`, and `cleanupTestSource(dirs: TestDirs | undefined)` in `src/cli/lib/__tests__/fixtures/create-test-source.ts`. Both no-op on `undefined` and both carry a comment saying why the parameter admits it. Passing a `T` to a `T | undefined` parameter is a shape no rule flags, so one honest signature retires the whole class. Where a single file's cascade is zero, the honest declaration is the better local answer; `unified-config-view.e2e.test.ts` took it, because its teardown derives a path from the handle rather than reading `.tempDir`.

---

## 6c. Four More Verdicts That Are Not Evidence

§6a and §6b are the first two cases. These four complete the list, and they share one cause:
`@typescript-eslint/no-unnecessary-condition` and `no-unnecessary-type-assertion` compute their
answer from a **type graph**, so they are exactly as honest as the graph is. Where the graph
under-reports, acting on their reports deletes the guards standing in for what it does not say —
and the deletions read as progress in a diff.

**1. A workspace that opts out of `noUncheckedIndexedAccess` MUST disable both rules, with a comment
naming the opt-out.** With the flag off, `arr[i]` and `record[k]` are typed `T` rather than
`T | undefined`, so every guard on a lookup reads as dead — `const option = options[col]; if (option)`
is precisely the guard the flag exists to require, reported as always-truthy. Enabling one rule
without the other turns the linter into a tool for deleting the guards the opt-out is temporarily
standing in for. The numbers are the argument and they are the same measurement taken twice: under
the dishonest graph `no-unnecessary-condition` produced **178** reports and
`no-unnecessary-type-assertion` **74**; the moment the flag came back on the same two produced **0**
and **50**. Not one index-access guard was deleted, and the 50 surviving assertions were genuinely
redundant. **Neither flag is overridden in `packages/cli/tsconfig.json` today** — both are inherited
from `@workspace/typescript-config/base.json` — so this rule is standing rather than live, and it is
written down because the opt-out looked reasonable at the time.

**2. A helper that narrows `Partial<Record<K, V>>` to `[K, V][]` or `V[]` is a LAUNDERING helper,
and a guard downstream of one is documentation rather than dead code.** `typedEntries` is declared
`<K, V>(obj: Partial<Record<K, V>>) => [K, V][]`, so the `| undefined` the `Partial` admits is gone
by the time a caller iterates; `Object.entries` does the same. `if (!skill) continue` after one of
them therefore reads as dead while still covering the explicitly-`undefined` slot. **The
`exactOptionalPropertyTypes` escape does not apply here, and that is the part worth knowing** — the
flag makes `{ "some-id": undefined }` unwritable in a literal, so the identical guards in
`packages/matrix` were correctly deleted, but the laundering lives in the HELPER's return type, which
no compiler flag touches. The flag is on everywhere now and the rule still reports every one of them.
The inventory is the disables, each carrying the same reason:

```
grep -rn 'no-unnecessary-condition -- typedEntries/Object.entries launders' src e2e scripts \
  --include='*.ts' --include='*.tsx' | wc -l
```

Thirty-two, across thirteen files. Deleting them is a separate and arguable call; the disables are
the inventory for whoever makes it.

**3. A `??` or `?.` on a Node or DOM global is exempt from an "unnecessary" verdict by default.**
DefinitelyTyped is not a contract. `process.stdout.columns` is declared `number` and is `undefined`
whenever stdout is not a TTY, so `process.stdout.columns ?? MIN_TERMINAL_SIZE.COLS` in
`base-command.ts` is load-bearing and the type is a lie. Prefer a targeted disable naming the lie
over deletion — four sites carry it today, the `columns` and `rows` pair in `base-command.ts` and
the same pair in `use-terminal-dimensions.test.ts`.

**4. A report on a `??` or `?.` over a field the type declares REQUIRED is evidence about the
DECLARATION, not about the guard.** The first three verdicts are about a graph that under-reports;
this one is about a graph that reports faithfully what a `as T` told it. `ProjectConfig` declares
`skills` and `agents` required, `projectConfigLoaderSchema` makes both optional, and the loader ended
with `as ProjectConfig` — so every caller paying for the gap with `config.agents ?? []` held a guard
the compiler called dead and the data required. About twenty of them, across ten modules
(`doctor.ts`, `installation.ts`, `edit.tsx`, `init.tsx`, `uninstall.tsx`, `compile-agents.ts`,
`config-types-writer.ts`, `plugin-info.ts`, `propagate.ts`, `config-merger.ts`), and the rule
recommended deleting all of them. **Check what the producing boundary actually supplies before
deleting anything** — the pass that found this cluster found three of them and only one was a
genuinely dead guard. §6d is what to do about it once the declaration is the thing at fault.

Where a red test appears to settle the disagreement in the guard's favour, it settles nothing until
its input is shown to be producible: three defaults on `CategoryDefinition` were kept behind
disables on the strength of two specs whose fixtures destructured a required field off a category
constant to reach a branch no producer can reach. `clean-code-standards.md` 6.23 is that rule, and
this is the direction it arrives from here — a fixture that can construct a value the type forbids
can make any dead branch look reachable, and reaching for a disable at that moment records the
disagreement instead of settling it.

The four read together as one instruction: **before acting on a type-aware report, ask what the
graph would have to be telling the truth about for the verdict to hold.** Where the answer is a flag
this workspace turned off, a return type a helper widened away, a third party's declaration, or a
required field the producing boundary never supplied, the report is about the graph and not about
the code.

---

## 6d. A Cast Is a Promise the Caller Has to Keep

§6c's fourth verdict is the symptom. This is the discipline that stops producing it: **`as T` is not
a request for a check, it is a statement to every future reader that `T` is true of this value**, and
the two ways of breaking that statement are both invisible at the site that breaks them.

**1. A function returning `T` via `as T` from a leniently-parsed value supplies every field `T`
declares required, in the SAME expression that performs the cast.** Repairing fields by mutation
afterwards is how two of three get repaired and the third does not — the compiler is satisfied at the
cast, so nothing marks the omission, and the omission then travels as a type. `loadProjectConfigFromDir`
in `lib/configuration/project-config.ts` is the shape, and its comment states the ordering as the
point: `name`, `skills` and `agents` are all defaulted in the object literal, the cast is the last
thing that happens, and only the string unions remain for `validateProjectConfig` to enforce. The
version it replaced repaired `name` and `skills` by mutation after the cast and never repaired
`agents`, which reads as complete precisely because two thirds of it was.

There is one such cast in production, so this is read rather than swept:

```
grep -rn 'as ProjectConfig\b' src/cli --include='*.ts' --include='*.tsx' | grep -v '__tests__'
```

**2. Where a `??` or `?.` guards a value a cast has already widened, the coalesce goes FIRST.**
`(x ?? []) as T[]` and `(x as T[]) ?? []` differ only in whether the guard still runs, and the second
reads as the more natural of the two while being dead: the checker sees a non-nullish value and
`no-unnecessary-condition` agrees with it. `extractConfigArrays` in
`lib/configuration/config-writer.ts` carries the correct order with a comment saying the order is
deliberate, and its reason is a property of the boundary rather than a style preference —
`JSON.parse(JSON.stringify(x))` drops every key whose value was `undefined`, so the `Record<string,
unknown>` it produces really can be missing `skills`, whatever a cast asserts about it.

```
grep -rnE 'as [A-Za-z_][A-Za-z0-9_]*(\[\]|<[^>]*>)? \?\?' src/cli --include='*.ts' --include='*.tsx'
```

Currently empty, and it is a floor rather than a census: it finds the cast written immediately before
the coalesce and cannot find one that happened two statements earlier. What it does catch is the
shape this class is written in, because the two are usually one expression.

Both rules are one instruction stated at two moments. **The cast is the last thing that happens, and
anything that must be true of `T` happens before it** — a default, a coalesce, a normalisation. Where
that is not achievable in one expression, the honest declaration is `T | undefined` and the cost is
§6b's third row: real, and a task of its own.

---

## 7. Extract Shared Type Aliases

When the same union appears on multiple types, extract it:

```typescript
// BAD — duplicated inline on 6 types
model: "sonnet" | "opus" | "haiku" | "inherit";

// GOOD — single source of truth
type ModelName = "sonnet" | "opus" | "haiku" | "inherit";

// Used consistently:
type AgentDefinition = {
  model: ModelName;
};
type AgentConfig = {
  model: ModelName;
};
type CustomAgentConfig = {
  model: ModelName;
};
```

---

## 8. Named Type Aliases for Complex Shapes

Give names to recurring composite types:

```typescript
// Instead of repeating this everywhere:
Record<Domain, Record<Category, SkillAlias[]>>;

// Extract a named alias:
type SubcategorySelections = Record<Category, (SkillAlias | SkillId)[]>;
type DomainSelections = Partial<Record<Domain, Partial<SubcategorySelections>>>;
```

Benefits: easier to read, single point of change, self-documenting.

---

## 9. Nested Record Typing

For nested key-value structures, type each level:

```typescript
// BAD — loses all semantic meaning
stack: Record<string, Record<string, string>>;

// GOOD — every level documented
stack: Record<AgentName, Partial<Record<Category, SkillId>>>;
//       ^ outer key      ^ not all subcats   ^ inner value
```

---

## 10. `as const` for Constant Arrays

Use `as const` for constant data to get literal types automatically:

```typescript
const DEFAULT_SKILLS = [
  "meta-methodology-anti-over-engineering",
  "meta-methodology-investigation-requirements",
] as const;
// Type: readonly ["meta-methodology-...", "meta-methodology-..."]
// Each element is a literal type, not just string
```

Add an explicit type annotation when consumers need to widen:

```typescript
const DEFAULT_SKILLS: readonly SkillId[] = [...] as const;
// Consumers get SkillId[], literals still type-checked at definition
```

**A `satisfies` clause must never change the type of the thing it annotates.** If adding one changes any member's inferred type, the constraint is in the wrong place. `satisfies` supplies a CONTEXTUAL type for every member, so a member whose type is inferred rather than written stops being inferred from its body and widens to the constraint — the clause adds validation while removing precision, which is the opposite of why it was added. Accessors are the common case; methods and any inferred member behave the same.

```typescript
// BAD — the getter's return widens from ("web-developer" | "api-developer")[] to AgentName[]
export const E2E_AGENTS = {
  WEB: ["web-developer"],
  API: ["api-developer"],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const satisfies Record<string, readonly AgentName[]>;

// GOOD — clauses on the data members; the getter keeps its body-inferred type
export const E2E_AGENTS = {
  WEB: ["web-developer"] as const satisfies readonly AgentName[],
  API: ["api-developer"] as const satisfies readonly AgentName[],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const;
```

Nothing fails to compile either way — the widened type is still assignable everywhere the constant is used — so the loss surfaces much later, as a missed type error in some future spec that assigns the member to a narrower parameter. This has bitten twice on the same shape (`E2E_AGENTS` in `e2e/fixtures/expected-values.ts`, `EXPECTED_AGENTS` in `src/cli/lib/__tests__/expected-values.ts`), so both carry an on-site comment saying why the clauses sit where they do; do not "tidy" them back onto the object. When a constant mixes data and accessors, verify the accessor's type is unchanged with a two-line type-probe assignment before and after adding any clause. An object with no accessor takes the clause on the object — `E2E_AGENT` and `EXPECTED_SKILLS` both do, and `E2E_AGENT` says so in a comment beside its neighbour.

```
grep -rn -B12 'as const satisfies' src/ e2e/ scripts/ --include='*.ts' --include='*.tsx' | grep -E '^[^ ]+[-:][0-9]+[-:] *get [a-zA-Z_]+\(\)'
```

---

## 11. Index Signatures vs Record Types

Prefer `Record` or `Partial<Record>` over index signatures:

```typescript
// AVOID — index signature allows any string key
type StackAgentConfig = {
  [subcategoryId: string]: string;
};

// PREFER — explicit key type
type StackAgentConfig = Partial<Record<Category, SkillAlias>>;
```

Index signatures always widen to `string` keys. `Record` with union keys preserves type information.

---

## 12. Mixed Built-in + User-Extensible Keys

When a Record has both known keys (from a union) and user-defined keys, keep `string`:

```typescript
// Can't narrow — includes custom agent IDs that users define
agents: string[];
custom_agents: Record<string, CustomAgentConfig>;
agent_skills: Record<string, AgentSkillConfig>;

// CAN narrow — only built-in agents in this context
agents: Partial<Record<AgentName, StackAgentConfig>>; // stacks only reference built-ins
```

**Decision rule:** If users can add arbitrary keys, keep `string`. If the keys come from your codebase only, use the union.

Note the `Partial` in the narrowed example: this section is about narrowing the KEY TYPE, and it must not be read as licensing a total map. No stack fills every `AgentName` — the real `Stack.agents` in `src/cli/types/stacks.ts` is `Partial<Record<AgentName, StackAgentConfig>>` — so §4 applies to the value side exactly as it always does. The two questions are independent: §12 decides `AgentName` vs `string`, §4 decides `Record` vs `Partial<Record>`.

---

## 12a. Closed Keys, Open Questions

§12 decides who may ADD a key. This section decides who may ASK about one, and the answers differ.

A map whose keys come from a generated union but which is _asked about_ ids from outside it — ids a user minted this session, ids a saved configuration recorded before a later catalogue dropped them — keeps `Partial<Record<Union, V>>` and gains a lookup function taking `string`:

```typescript
const CATALOGUED_IDS = new Set<string>(SKILL_IDS);
const isSkillId = (skillId: string): skillId is SkillId => CATALOGUED_IDS.has(skillId);

export const skillById = (skillId: string): CatalogSkill | undefined =>
  isSkillId(skillId) ? CATALOG.skillsById[skillId] : undefined;
```

**Do not widen the declared key back to `string`** — §12's "keep `string`" answer is about who can add keys, and reading it as an answer here throws away the union the narrowing existed to recover. **Do not cast at the call sites** either: `skillsById[id as SkillId]` repeated eleven times is one wrong type laundered eleven ways.

The lookup is one narrowing in one place. Call sites change by a single token (`CATALOG.skillsById[id]?.displayName` → `skillById(id)?.displayName`), they keep the `?.` guards they already had, and those guards start doing real work — the old total type is what made them look redundant.

**Build the guard's membership set from the generated tuple**, never from `Object.keys` of the map and never as a bare `key in map`. An object index inherits `Object.prototype`, so `"toString" in map` is `true` and a lookup built on it hands back `Function.prototype.toString` typed as your value type.

**A factual note that belongs with §4, because assuming otherwise is what makes this migration look expensive:** `Object.values` and `Object.entries` over a `Partial<Record<K, V>>` infer `V[]` and `[string, V][]` — the optional `undefined` is dropped from the implicit index signature. Only _indexed_ reads become `V | undefined`. Verified with `tsc` against this repo's config; five iteration sites across three workspaces needed no change at all when `Catalog.skillsById` was narrowed.

---

## 12b. Zod Schema Exports Are camelCase, Suffixed `Schema`

`seedPayloadSchema`, `skillIndexSchema`, `matrixSchema`, and every schema in
`src/cli/lib/schemas.ts` — camelCase name, `Schema` suffix. A schema is a value, and this repository
capitalises types rather than values.

The older PascalCase form survives in one shape, an exception rather than a second convention: the
three `scripts/check-shared-*.ts` checkers declare module-private ones (`ManifestSchema`,
`TsconfigSchema`) that no importer can see, so they name nothing a caller has to guess about. No
**exported** PascalCase schema is left — `packages/matrix/src/schema.ts` held the last of them and
was renamed `built-in-matrix.ts` on 2026-08-19, camelCasing every schema in it.

**The cost of guessing is a case-only twin, which is a collision a reader cannot see**, and this
rule exists because the repository ran one for months. `matrixSchema` and a PascalCase twin of the
same word were two live, differently-behaved schemas differing in one character's case — the first
describes a catalogue's shape and accepts any marketplace, the second narrows every id to the
vendored vocabulary and therefore rejects all but the shipped one. Giving `matrixSchema` its own
file (`packages/matrix/src/matrix-schema.ts`) is what made the pair survivable at all, and it did
not make it legible: **file specificity ran opposite to schema specificity**, the precisely-named
file holding the general schema. Both halves are fixed — the vendored one is `builtInMatrixSchema`
in `built-in-matrix.ts`, named for `BUILT_IN_MATRIX`, the one constant it validates, and the general
name stays with the general shape. Do not mint a second twin.

```
grep -rnE '^\s*(export )?const [A-Z][A-Za-z0-9]*Schema\b' packages apps --include='*.ts' | grep -v node_modules
```

Every hit is now module-private, which is the whole of the surviving exception.

---

## 13. Audit Methodology

**A passing `@ts-expect-error` is evidence about the type system, so check a brief's type claim
before "fixing" it.** An unused directive is itself an error — TS2578, _"Unused '@ts-expect-error'
directive"_ — so a green typecheck proves every one of them really did suppress a failure, which
proves the type it guards is doing its job. A brief once asked for a fix to a "known type hole"
where `RoleFlavor` was said to widen to `string`; two directives on `["lazy"]` and `["architect"]`
were passing `tsc --noEmit` in that same package at the time, which was proof it did not. Reading
them cost one command.

The two moves, in order:

1. **Before believing a claim that a type is broken**, run the package's typecheck and read its
   directives. Green plus a directive on the exact shape the claim names refutes the claim.
2. **When you change a type a directive guards**, delete the directive once, read the real error,
   then put it back. `error TS2322: Type '"architect"' is not assignable to type '"meta" |
"developer" | …'` names the surviving union; the directive alone names nothing.

```
grep -rn '@ts-expect-error' packages/ apps/ --include='*.ts' --include='*.tsx'
```

Four sites today, three of them in `packages/matrix/src/read-model/preload-defaults.test.ts`. Each
is an assertion about the type system that no other mechanism in the repository makes.

When narrowing types across a codebase:

1. **Audit every `string` field** — decide: union type, template literal, or keep `string`
2. **Classify each as:**
   - Keep `string` (free-form) — no action
   - Narrow to union — change the type
   - Already done — verify
3. **Fix in priority order:**
   - Cross-cutting shared types first (they cascade)
   - Core library types second
   - Component/command types last (localized)
4. **Track boundary casts separately** — these are legitimate and should stay
5. **Target: zero unnecessary casts** — every remaining cast has a comment

**A sweep that replaces an inline union with a named type is TYPE-position only, and the canonical
false positive is a template string that EMITS generated code.** `PROJECT_CONFIG_TYPES_BEFORE` in
`lib/configuration/config-types-writer.ts` holds `scope: "project" | "global";` inside the text
written to disk as the generated `config-types.ts`. It is value-position source, not an annotation:
substituting `SkillScope` there emits a reference to a type the generated file does not declare, and
nothing in the sweeping package goes red — the failure lands in a consumer's generated file. Any
grep-driven type substitution states this exclusion before it starts, because "only replace
TYPE-position spellings" is correct phrasing that is easy to under-apply against exactly this shape.

Two adjacent traps, and both have changed since they were first written down — which is why they are
worth re-measuring rather than copying:

- **A same-valued field of a different domain.** `RegisteredInstallation.scope` in
  `lib/plugins/plugin-settings.ts` carried Claude-CLI's `"project" | "user"` values as a bare
  `string` and matched neither `SkillScope` nor the shared `ScopedEntry` shape. It is a
  `z.discriminatedUnion("scope", …)` over `"project" | "user" | "local"` now, so the trap is closed
  by the schema rather than by the sweeper's care. The rule survives its instance: identical VALUES
  are not an identical TYPE, and the discriminator is the domain, not the spelling.
- **A ternary of string literals.** Under TypeScript 6, `const x = cond ? "global" : "project"` does
  **not** widen — it infers the union and assigns to `SkillScope` cleanly. `let x = …` under the same
  ternary widens to `string` and does not. Measured on a two-line probe against this repository's own
  compiler; the per-branch `as const` form in `stores/wizard-store.ts` is on `const` bindings, so what
  it buys today is not what it bought when it was written. **Re-run the probe before either adding or
  removing an `as const` on this shape** — the answer is a compiler-version fact, and the two-line
  probe is cheaper than either edit.

---

## Quick Decision Flowchart

```
Is the value from a known, finite set?
├─ YES → Can you enumerate all values?
│   ├─ YES (< ~30 values) → Union type
│   └─ NO but has a pattern → Template literal type
└─ NO → Keep string

Is it a Record key?
├─ Will runtime have ALL keys? → Record<Union, V>
└─ Sparse at runtime? → Partial<Record<Union, V>>

Does the same union appear 2+ times?
├─ YES → Extract a named type alias
└─ NO → Inline is fine

Is there a resolution/normalization step?
├─ YES → Different types pre vs post resolution
└─ NO → Single type throughout

Do you need to cast?
├─ At a boundary (parse/CLI/Object.keys)? → OK, add comment
└─ Mid-pipeline? → Fix the source type instead
```
