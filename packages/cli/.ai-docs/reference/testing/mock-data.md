---
scope: reference
area: testing
keywords:
  [
    SKILLS,
    AGENT_DEFS,
    mock-matrices,
    mock-skills,
    mock-agents,
    mock-stacks,
    test-fixtures,
    TEST_CATEGORIES,
  ]
related:
  - reference/testing/factories.md
  - reference/testing/infrastructure.md
last_validated: 2026-08-23
---

# Mock Data Constants

> **Split from:** `reference/test-infrastructure.md`. See also: [infrastructure.md](./infrastructure.md), [factories.md](./factories.md), [e2e-infrastructure.md](./e2e-infrastructure.md).

## Canonical Test Fixtures (`src/cli/lib/__tests__/test-fixtures.ts`)

### SKILLS Registry

Single source of truth for all test ResolvedSkills. Use `SKILLS.react`, `SKILLS.hono` etc. directly.
The declaration is keyed `Record<string, ResolvedSkill>`, so nothing about it is exhaustive and this table is the only statement of what it holds. Every key, bound to `SKILLS` in `src/cli/lib/__tests__/test-fixtures.ts` by `scripts/check-enumeration-drift.ts`:

| Key            | Skill ID                            | Domain |
| -------------- | ----------------------------------- | ------ |
| `react`        | `web-framework-react`               | web    |
| `vue`          | `web-framework-vue-composition-api` | web    |
| `zustand`      | `web-state-zustand`                 | web    |
| `pinia`        | `web-state-pinia`                   | web    |
| `scss`         | `web-styling-scss-modules`          | web    |
| `tailwind`     | `web-styling-tailwind`              | web    |
| `vitest`       | `web-testing-vitest`                | web    |
| `hono`         | `api-framework-hono`                | api    |
| `drizzle`      | `api-database-drizzle`              | api    |
| `authSecurity` | `shared-security-auth-security`     | shared |
| `antiOverEng`  | `meta-reviewing-reviewing`          | meta   |

### TEST_CATEGORIES

Base category fixtures for spread-based customization.

**Deliberately not bound by `check-enumeration-drift.ts`, and this is the record of why.** Every
value here is a `createMockCategory(...)` call, and the checker's value reader resolves string
literals only — it refuses the table with _"names a symbol holding a member whose value no reader
can name"_. Teaching it to resolve a call's first argument is the "guessed at rather than looked
up" its own docblock refuses, so that is not the way in. The table IS bindable keys-only as
`table-rows`, and that form was rejected: a sibling comment in this same file argues against it for
two-column tables, because it holds the keys while letting every value drift, and this table's
value column is the half a reader comes here for. The repository's precedent decides the tie —
two greps were built, tested and deliberately not shipped under the Phase C rules pass, on the
grounds that a rule ships without a check rather than with a bad one. Four neighbouring tables were
bound the same day; this one is the exception on purpose rather than by omission.

| Key               | Category ID         | Display Name      |
| ----------------- | ------------------- | ----------------- |
| `framework`       | `web-framework`     | Framework         |
| `clientState`     | `web-client-state`  | Client State      |
| `styling`         | `web-styling`       | Styling           |
| `testing`         | `web-testing`       | Testing           |
| `serverState`     | `web-server-state`  | Server State      |
| `animation`       | `web-animation`     | Animation         |
| `accessibility`   | `web-accessibility` | Accessibility     |
| `api`             | `api-api`           | Backend Framework |
| `database`        | `api-orm`           | Database          |
| `observability`   | `api-observability` | Observability     |
| `methodology`     | `meta-reviewing`    | Meta              |
| `tooling`         | `shared-tooling`    | Tooling           |
| `security`        | `shared-security`   | Security          |
| `cliFramework`    | `cli-framework`     | CLI Framework     |
| `mobileFramework` | `mobile-framework`  | Mobile Framework  |

## Mock Data Module (`src/cli/lib/__tests__/mock-data/`)

Pre-built test data constants extracted from individual test files. Use these instead of inline `createMock*()` calls.

**An unbound list here goes wrong in every direction without a gate noticing**: a name that no
longer exists anywhere in the tree, a family named only by its `HEALTH_*` prefix, a live export
mentioned nowhere. The short-list failure is the expensive one — a reader who greps for a constant
they cannot find here concludes it does not exist and writes a duplicate. So a module below is
either enumerated exhaustively and bound to its exports by `scripts/check-enumeration-drift.ts`, or
not enumerated at all.

`mock-matrices.ts`, `mock-skills.ts` and `mock-stacks.ts` are therefore deliberately left
unenumerated, and completing any of them here would be a mistake. Each exports scores of
self-describing constants — `REACT_SCSS_HONO_MATRIX` tells a reader what it holds and a line beside
it would not — so an inventory of that size buys nothing a `grep` does not, and drifts within a
fortnight. Re-derive per module instead of reading a list:

```
grep -hoP '^export (?:const|function|type) \K\w+' src/cli/lib/__tests__/mock-data/<module>.ts
```

The four modules that are still named exhaustively are named because each row states something its
export name does not — which schema validates a fixture, what a constant is for. Each of those lists
is bound to its module's `const` exports by `scripts/check-enumeration-drift.ts`, so a constant added
to one of them cannot land without a line here naming it — and the same command settles any doubt.

### mock-agents.ts

- `AGENT_DEFS` - Canonical agent metadata (webDev, apiDev, webTester, reviewer)
- `RESOLVE_AGENTS_DEFINITIONS` - Agent definitions for resolver tests
- `DEFAULT_TEST_AGENTS` - TestAgent array for `createTestSource()`

### mock-categories.ts

- `WEB_FRAMEWORK_CATEGORY`, `WEB_STYLING_CATEGORY`, `WEB_STATE_CATEGORY`, `API_FRAMEWORK_CATEGORY`, `API_DATABASE_CATEGORY`, `CLI_FRAMEWORK_CATEGORY` - Category defs with domain overrides
- `FRAMEWORK_CATEGORY` - Basic framework category
- `MULTI_SOURCE_CATEGORIES` - Categories for multi-source integration tests

### mock-matrices.ts

`MatrixConfig` and compile-config fixtures. Not enumerated — see above.

`CATEGORY_EXCLUSIVITY_MATRIX` is the one that needs a sentence: it is the only fixture whose
categories carry REAL `exclusive` / `required` flags. `createMockMatrix`'s default categories map is
empty, so every category reads as "undefined flags" and exclusivity rules can never fire — use this
whenever the flags must be live. Shape: two frameworks in an exclusive **and required** category
(`web-framework`: react, vue), two client-state skills in an exclusive but **optional** one
(`web-client-state`: zustand, pinia), two styling skills in a non-exclusive one (`web-styling`:
scss, tailwind), plus a non-exclusive `web-testing` (vitest). The exclusive+optional category is the
one shape that separates "exclusive" from "exclusive AND required" rules.

### mock-skills.ts

`TestSkill` and `ResolvedSkill` fixtures — relationship variants, install-mode variants, local-skill
variants, and the arrays `createTestSource()` consumes. Not enumerated — see above.

### mock-sources.ts

- `PUBLIC_SOURCE`, `ACME_SOURCE`, `INTERNAL_SOURCE` - SkillSource objects

### mock-stacks.ts

`Stack` objects, and `TestStack` arrays for `createTestSource()`. Not enumerated — see above.

### mock-source-files.ts

On-disk file shape fixtures for published-source validation tests (spread for negative-case variations):

- `VALID_STACK_CONFIG_FILE` - stack config.yaml (validated by `stackConfigValidationSchema`)
- `VALID_EMBEDDED_SKILL_METADATA_FILE` - embedded skill metadata (validated by `metadataValidationSchema`)
- `VALID_SKILL_CATEGORIES_FILE` - config/skill-categories.ts default export (validated by `skillCategoriesFileSchema`)
- `VALID_SKILL_RULES_FILE` - config/skill-rules.ts default export (validated by `skillRulesFileSchema`)
- `VALID_STACKS_CONFIG_FILE` - config/stacks.ts default export (validated by `stacksConfigSchema`)
- `VALID_PACKAGE_JSON_FILE` - minimal package.json for `build marketplace` tests

**Each bound row reads `const` exports only.** Every export of the bound modules is a `const` today,
so the reading is total; a function or a type added to one of them would be a member no row can see,
and needs a row of its own rather than a line in the list above.
