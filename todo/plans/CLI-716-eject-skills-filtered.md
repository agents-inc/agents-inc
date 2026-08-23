# CLI-716: Eject Skills by Domain/Category

**Status:** Refinement
**Date:** 2026-02-26
**Size:** S (small)
**Related:** D-12 (eject full agents), CLI-721 (eject compile function)

---

## 1. Open Questions (All Resolved)

### Q1: Flag naming -- `--domain` and `--category`, or something else?

| Option                             | Description                                       | Pros                                                                    | Cons                                                                                                        |
| ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A: `--domain` and `--category`** | Two separate flags matching internal terminology  | Mirrors the wizard's Domain/Category model; clear mental model          | "category" actually maps to `Category` internally (e.g., `web-framework`), which could confuse contributors |
| **B: `--domain` and `--category`** | Use internal naming directly                      | Matches type names exactly (`Domain`, `Category`)                       | "category" is less intuitive for end users who have never seen the internal types                           |
| **C: `--domain` only**             | Single filter, derive category from domain prefix | Simpler CLI surface; covers the primary use case (eject all web skills) | Cannot eject a specific category across domains (e.g., all "testing" skills)                                |

**Recommendation:** Option A (`--domain` and `--category`). Users think in terms of "domain" (web, api, cli) and "category" (framework, testing, styling). The fact that `--category` maps to `Category` internally is an implementation detail. Document the available values in `--help`.

**RESOLVED: Option A accepted.** Use `--domain` and `--category` as flag names.

### Q2: Should `--category` accept the Category ID or the displayName?

The YAML defines both:

- ID: `web-framework` (kebab-case, used internally)
- displayName: `Framework` (human-readable, shown in wizard)

| Option                                               | Description                            | Pros                                        | Cons                                                                                               |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **A: Category ID only** (`--category web-framework`) | Match the internal ID                  | Unambiguous; tab-completable; no collisions | Verbose; user must know the ID                                                                     |
| **B: displayName only** (`--category framework`)     | Match the human-readable name          | Short; matches what users see in the wizard | Ambiguous across domains (e.g., "Testing" exists in web and CLI); case-insensitive matching needed |
| **C: Accept both**                                   | Try ID first, fall back to displayName | Flexible; discoverable                      | More code; potential for confusing matches                                                         |

**Recommendation:** Option A (Category ID only). The IDs are already kebab-case and predictable (e.g., `web-framework`, `api-database`). Since `--domain` and `--category` can be combined, there is no need for displayName matching. The `--help` output should list valid values.

**RESOLVED: Option A accepted.** Accept Category ID only (e.g., `--category web-framework`).

### Q3: What happens when a skill's category spans domains?

Skills have a single `category` field (e.g., `web-framework`) that implicitly encodes the domain via its prefix. The `CategoryDefinition` also has an explicit `domain` field. These should always agree, but custom skills from third-party sources might declare a category prefix that differs from their `domain` field.

**Resolution:** Use the `CategoryDefinition.domain` field as the authoritative domain for filtering, since that is what the wizard uses. If a category definition is missing (custom skill with unknown category), fall back to extracting the domain prefix from the category path (e.g., `web-framework` -> `web`).

**RESOLVED: Current resolution accepted.** If a category spans domains, ejecting by category alone ejects more skills. Passing both `--domain` and `--category` narrows the result. No additional handling needed.

### Q4: Should `--domain` and `--category` be mutually exclusive or composable?

| Option                    | Description             | Example                                                                              |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| **A: Composable (AND)**   | Both must match         | `--domain web --category web-testing` ejects only web testing skills                 |
| **B: Mutually exclusive** | Only one flag at a time | `--domain web` OR `--category web-testing`, not both                                 |
| **C: Composable (OR)**    | Either can match        | `--domain api --category web-testing` ejects all API skills + all web testing skills |

**Recommendation:** Option A (composable AND). This matches intuition: `--domain web --category web-testing` narrows the filter. Using `--category web-testing` alone already implies `--domain web` (from the prefix), so the combination serves as validation. If the category does not belong to the specified domain, warn and exit.

**RESOLVED: Option A accepted.** Composable AND -- both flags must match when used together.

### Q5: How should cross-domain skill dependencies be handled?

When ejecting only `--domain web`, a web skill might `require` a shared skill (e.g., `shared-tooling-turborepo`). Should the eject command:

- **A: Only eject the filtered set** -- warn about unresolved dependencies
- **B: Auto-include required skills** from other domains
- **C: Ask the user** whether to include dependencies

**Recommendation:** Option A (eject filtered set only, warn about dependencies). The eject command is a copy operation, not an install operation. Dependencies are informational at eject time -- the user can run a second eject with `--domain shared` if needed. Print a summary of missing dependencies at the end.

**RESOLVED: Option A accepted.** Only eject the filtered set. Warn about unresolved cross-domain dependencies.

### Q6: Should `--domain`/`--category` accept multiple values?

Example: `--domain web,api` or `--domain web --domain api`

**Recommendation:** Accept comma-separated values for a single flag occurrence: `--domain web,api`. This is consistent with oclif's `Flags.string({ multiple: true, delimiter: "," })` pattern. No need for repeated flags.

**RESOLVED: Recommendation accepted.** Use comma-separated values (e.g., `--domain web,api`).

---

## 2. Current State Analysis

### Eject skills flow (eject.ts:333-374)

The current `ejectSkills()` method:

1. Determines the destination directory (`LOCAL_SKILLS_PATH` or `--output` path)
2. Checks if destination exists (warns without `--force`)
3. Gets ALL non-local skill IDs from `sourceResult.matrix.skills` (line 350-352):
   ```typescript
   const skillIds = typedKeys<SkillId>(sourceResult.matrix.skills).filter(
     (skillId) => !sourceResult.matrix.skills[skillId]?.local
   )
   ```
4. Calls `copySkillsToLocalFlattened()` with the full list
5. Logs the count and source label

The filtering in step 3 only excludes locally-installed skills. There is no domain or category filtering.

### How skills map to domains and categories

Each `ResolvedSkill` has a `category` field of type `CategoryPath` (e.g., `"web-framework"`, `"api-database"`).

Each `CategoryDefinition` in the matrix has a `domain` field of type `Domain` (e.g., `"web"`, `"api"`, `"shared"`).

The relationship is:

```
Domain (5 values) -> Category (38 values) -> SkillId (many)
     web          ->  web-framework           ->  web-framework-react
                  ->  web-styling             ->  web-styling-scss-modules
                  ->  web-testing             ->  web-testing-vitest
     api          ->  api-api                 ->  api-framework-hono
                  ->  api-database            ->  api-database-drizzle
```

To filter skills by domain:

1. Get all `CategoryDefinition` entries where `domain === targetDomain`
2. Collect their category IDs
3. Filter skills whose `category` matches one of those category IDs

To filter skills by category:

1. Filter skills whose `category === targetSubcategory`

### Existing utilities

- `getSkillsByCategory(categoryId, matrix)` in `matrix-resolver.ts:591` -- returns all `ResolvedSkill[]` for a given category. Could be reused for `--category` filtering.
- `typedKeys<SkillId>(matrix.skills)` -- already used in `ejectSkills()` for the full list.
- `typedEntries(matrix.categories)` -- iterates category definitions with typed keys.
- `DOMAIN_VALUES` from `schemas.ts` -- array of all valid Domain strings.
- `SUBCATEGORY_VALUES` from `schemas.ts` -- array of all valid Category strings.

---

## 3. Design

### Flag definitions

Add two new flags to the existing `Eject` command's `static flags`:

```typescript
static flags = {
  ...BaseCommand.baseFlags,
  force: Flags.boolean({ ... }),     // existing
  output: Flags.string({ ... }),     // existing
  refresh: Flags.boolean({ ... }),   // existing
  domain: Flags.string({
    char: "d",
    description: "Filter skills by domain (e.g., web, api, cli, mobile, shared). Comma-separated for multiple.",
  }),
  category: Flags.string({
    char: "c",
    description: "Filter skills by category (e.g., web-framework, api-database). Comma-separated for multiple.",
  }),
};
```

### Filtering logic

The filtering is inserted between step 3 (get all non-local skill IDs) and step 4 (copy) in `ejectSkills()`:

```
1. Get all non-local skill IDs (existing logic)
2. If --domain is set:
   a. Parse comma-separated values
   b. Validate each against DOMAIN_VALUES
   c. Collect all category IDs whose CategoryDefinition.domain matches
   d. Filter skill IDs to those whose category matches collected categories
3. If --category is set:
   a. Parse comma-separated values
   b. Validate each against SUBCATEGORY_VALUES
   c. Filter skill IDs to those whose category matches
4. If both --domain and --category are set:
   a. Validate that each category belongs to one of the specified domains
   b. Filter is the intersection (AND)
5. Copy the filtered skill IDs
6. Log the filter criteria in the summary message
```

### Dependency warning

After filtering, scan the ejected skills for `requires` and `requiresSetup` references. For any dependency that points to a skill NOT in the ejected set, print a warning:

```
Warning: 3 ejected skills have dependencies outside the ejected set:
  web-testing-vitest requires web-framework-react (not ejected)
  ...
Run with --domain shared to include shared dependencies.
```

This is informational only -- no blocking.

### Help/discovery

When `--domain` or `--category` is passed with an invalid value, the error message should list all valid values:

```
Error: Invalid domain "frontend". Valid domains: web, api, cli, mobile, shared
```

```
Error: Invalid category "framework". Valid categories: web-framework, web-styling, ...
```

### Flag applicability

The `--domain` and `--category` flags only apply when `type` is `skills` or `all`. If used with `agent-partials` or `templates`, they are silently ignored (since those operations copy from the CLI source, not the skills matrix).

---

## 4. Step-by-Step Implementation Plan

### Step 1: Add flags to the Eject command

**File:** `src/cli/commands/eject.ts`

- Add `domain` and `category` to `static flags`
- Add examples showing filtered eject

### Step 2: Add validation helpers

**File:** `src/cli/commands/eject.ts` (private methods on the class)

- `parseDomainFilter(raw: string): Domain[]` -- split by comma, validate each against `DOMAIN_VALUES`
- `parseCategoryFilter(raw: string): Category[]` -- split by comma, validate each against `SUBCATEGORY_VALUES`
- `validateDomainCategoryCompatibility(domains: Domain[], categories: Category[], matrix: MergedSkillsMatrix)` -- warn if a category does not belong to any specified domain

These are small private methods, not new utility modules.

### Step 3: Add filtering to ejectSkills()

**File:** `src/cli/commands/eject.ts`, `ejectSkills()` method

- After the existing `typedKeys(...).filter(...)` line, add domain/category filtering
- Build a `Set<Category>` of allowed categories:
  - From `--domain`: collect all categories where `matrix.categories[subcat]?.domain` is in the domain list
  - From `--category`: directly use the provided category IDs
  - Intersection if both are specified
- Filter `skillIds` to those whose `matrix.skills[skillId]?.category` is in the allowed set
- Log the effective filter in the summary

### Step 4: Add dependency warnings

**File:** `src/cli/commands/eject.ts`, at end of `ejectSkills()`

- After copying, scan ejected skills for `requires` and `requiresSetup` fields
- Collect any referenced skill IDs not in the ejected set
- Print a warning summary if any are found

### Step 5: Thread flags from run() to ejectSkills()

**File:** `src/cli/commands/eject.ts`, `run()` method

- Pass `flags.domain` and `flags.category` to `ejectSkills()` (add parameters)
- Also pass through in the `eject all` code path

---

## 5. Edge Cases

### No skills match the filter

If `--domain mobile` is specified but no mobile skills exist in the source:

```
No skills found matching domain "mobile" in source.
```

Exit with `EXIT_CODES.INVALID_ARGS`.

### Custom skills from third-party sources

Custom skills may have categories not in `SUBCATEGORY_VALUES`. If a custom skill's category does not match any filter, it is excluded. If the user passes a custom category via `--category custom-category`, validation should accept it if it exists in the loaded matrix's categories.

**Adjustment:** Validate `--category` values against `typedKeys(sourceResult.matrix.categories)` (the loaded matrix), not just `SUBCATEGORY_VALUES` (the static builtin list). This handles custom categories from third-party sources.

### Domain prefix mismatch

A skill with `category: "shared-tooling"` but from a source that declares `domain: "web"` in the category definition. The `domain` field on the `CategoryDefinition` takes precedence. Filtering by `--domain web` would include this skill.

### Local skills excluded before domain filter

The existing `!local` filter runs first. Domain/category filtering runs second. This means local skills are never ejected regardless of domain/category flags, which is correct -- ejecting local skills makes no sense (they are already local).

### Empty filter intersection

`--domain api --category web-framework` produces an empty intersection because `web-framework` belongs to domain `web`, not `api`. The compatibility validation (Step 2) warns and exits:

```
Error: Category "web-framework" belongs to domain "web", not "api".
```

---

## 6. Test Plan

### Unit tests for filtering logic

**File:** `src/cli/lib/__tests__/commands/eject.test.ts`

| Test                                      | What it verifies                     |
| ----------------------------------------- | ------------------------------------ |
| `should accept --domain flag`             | Flag is parsed without error         |
| `should accept --category flag`           | Flag is parsed without error         |
| `should accept -d shorthand for domain`   | Short flag works                     |
| `should accept -c shorthand for category` | Short flag works                     |
| `should reject invalid domain value`      | Error message lists valid domains    |
| `should reject invalid category value`    | Error message lists valid categories |

### Integration tests for filtered eject

**File:** `src/cli/lib/__tests__/commands/eject.test.ts` (extend existing `eject skills from initialized project` suite)

| Test                                                            | What it verifies                                   |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `should eject only skills matching --domain web`                | Output contains only web-\* skills                 |
| `should eject only skills matching --category api-database`     | Output contains only api-database-\* skills        |
| `should eject skills matching combined --domain and --category` | Intersection filter works                          |
| `should eject no skills when domain has no matches`             | Exits with appropriate message                     |
| `should warn about cross-domain dependencies`                   | Warning printed for unresolved `requires`          |
| `should accept comma-separated --domain values`                 | `--domain web,api` ejects both                     |
| `should accept comma-separated --category values`               | `--category web-framework,web-testing` ejects both |
| `should ignore --domain and --category for agent-partials`      | Flags are silently ignored                         |
| `should validate category belongs to specified domain`          | Error for incompatible combo                       |

### Existing tests must continue passing

All existing eject tests (argument validation, flag validation, eject agent-partials, eject templates, eject skills, eject all, error handling, eject from initialized project, eject in plugin mode) must continue to pass unchanged. The new flags are optional -- omitting them preserves the current "eject everything" behavior.

---

## 7. Files Changed Summary

### Modified files

| File                                           | Change                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/commands/eject.ts`                    | Add `domain` and `category` flags, filtering logic in `ejectSkills()`, dependency warning, validation helpers, updated examples |
| `src/cli/lib/__tests__/commands/eject.test.ts` | Add test cases for filtered eject                                                                                               |

### No new files

All changes fit within the existing command file. No new utility modules, no new abstractions.

### Estimated scope

- **Modified code:** ~60-80 lines in `eject.ts` (flags, validation, filtering, warning)
- **Test code:** ~80-120 lines added to existing test file
- **Complexity:** Low -- straightforward filter on an existing list, using already-available data from the loaded matrix
