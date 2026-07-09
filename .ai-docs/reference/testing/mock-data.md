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
last_validated: 2026-04-21
---

# Mock Data Constants

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Split from:** `reference/test-infrastructure.md`. See also: [infrastructure.md](./infrastructure.md), [factories.md](./factories.md), [e2e-infrastructure.md](./e2e-infrastructure.md).

## Canonical Test Fixtures (`src/cli/lib/__tests__/test-fixtures.ts`)

### SKILLS Registry

Single source of truth for all test ResolvedSkills. Use `SKILLS.react`, `SKILLS.hono` etc. directly.

| Key           | Skill ID                            | Domain |
| ------------- | ----------------------------------- | ------ |
| `react`       | `web-framework-react`               | web    |
| `vue`         | `web-framework-vue-composition-api` | web    |
| `zustand`     | `web-state-zustand`                 | web    |
| `pinia`       | `web-state-pinia`                   | web    |
| `scss`        | `web-styling-scss-modules`          | web    |
| `tailwind`    | `web-styling-tailwind`              | web    |
| `vitest`      | `web-testing-vitest`                | web    |
| `hono`        | `api-framework-hono`                | api    |
| `drizzle`     | `api-database-drizzle`              | api    |
| `antiOverEng` | `meta-reviewing-reviewing`          | meta   |

### TEST_CATEGORIES

Base category fixtures for spread-based customization:

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
| `database`        | `api-database`      | Database          |
| `observability`   | `api-observability` | Observability     |
| `methodology`     | `meta-reviewing`    | Meta              |
| `tooling`         | `shared-tooling`    | Tooling           |
| `security`        | `shared-security`   | Security          |
| `cliFramework`    | `cli-framework`     | CLI Framework     |
| `mobileFramework` | `mobile-framework`  | Mobile Framework  |

## Mock Data Module (`src/cli/lib/__tests__/mock-data/`)

Pre-built test data constants extracted from individual test files. Use these instead of inline `createMock*()` calls.

### mock-agents.ts

- `AGENT_DEFS` - Canonical agent metadata (webDev, apiDev, webTester, webReviewer)
- `RESOLVE_AGENTS_DEFINITIONS` - Agent definitions for resolver tests
- `WEB_DEV_NO_SKILLS`, `API_DEV_NO_SKILLS`, `WEB_DEV_WITH_REACT`, `WEB_DEV_WITH_PRELOADED_REACT`, `WEB_DEV_WITH_VITEST`, `TWO_AGENTS_SHARED_SKILL` - Pre-built agent config maps
- `DEFAULT_TEST_AGENTS` - TestAgent array for `createTestSource()`

### mock-categories.ts

- `WEB_FRAMEWORK_CATEGORY`, `WEB_STYLING_CATEGORY`, `WEB_STATE_CATEGORY`, `API_FRAMEWORK_CATEGORY`, `API_DATABASE_CATEGORY`, `CLI_FRAMEWORK_CATEGORY` - Category defs with domain overrides
- `FRAMEWORK_CATEGORY` - Basic framework category
- `MULTI_SOURCE_CATEGORIES` - Categories for multi-source integration tests

### mock-matrices.ts

- `EMPTY_MATRIX`, `SINGLE_REACT_MATRIX`, `WEB_PAIR_MATRIX`, `FULLSTACK_PAIR_MATRIX`, `WEB_TRIO_MATRIX`, `FULLSTACK_TRIO_MATRIX`, `VITEST_REACT_HONO_MATRIX`, `REACT_SCSS_MATRIX`, `REACT_SCSS_HONO_MATRIX`, `SCSS_HONO_REACT_MATRIX`, `HONO_REACT_MATRIX`, `REACT_ZUSTAND_HONO_MATRIX` - Pre-built matrix constants
- `ALL_SKILLS_*_MATRIX` - Full skills with various category configurations (TEST_CATEGORIES, WEB_FRAMEWORK, WEB_PAIR_CATEGORIES, FULLSTACK_CATEGORIES, WEB_AND_API, METHODOLOGY, METHODOLOGY_BARE, MULTI_DOMAIN)
- `HEALTH_*_MATRIX` - Matrix fixtures for health-check tests (HEALTHY, SINGLE_SKILL, MISSING_DOMAIN, MULTIPLE_MISSING_DOMAINS, UNKNOWN_CATEGORY, ORPHAN_SKILL_WITH_MISSING_DOMAIN, UNRESOLVED_COMPATIBLE_WITH, UNRESOLVED_CONFLICTS_WITH, UNRESOLVED_REQUIRES, MULTIPLE_UNRESOLVED_REFS, ALL_REFS_RESOLVED, PARTIAL_UNRESOLVED_REQUIRES)
- `buildMultiSourceMatrix()` - Factory for multi-source matrices
- `MERGE_BASIC_MATRIX`, `CONFLICT_MATRIX`, `ALTERNATIVES_MATRIX`, `REQUIRES_MATRIX` - MatrixConfig fixtures
- `LOCAL_SKILL_MATRIX`, `MIXED_LOCAL_REMOTE_MATRIX` - Local skill matrix fixtures
- `METHODOLOGY_MATRIX`, `VITEST_MATRIX`, `MULTI_STYLING_MATRIX` - Single-domain matrix fixtures
- `CATEGORY_GRID_MATRIX`, `REACT_HONO_FRAMEWORK_API_MATRIX` - Specialized matrix fixtures
- `BUILD_STEP_*_MATRIX` - Build step logic test matrices (17 constants: WEB, REQUIRES, EMPTY_FRAMEWORK, FRAMEWORK_NON_EXCLUSIVE, FRAMEWORK_NO_FLAGS, FRAMEWORK_API, FRAMEWORK_ONLY, API_DB, UNIVERSAL_COMPAT, LOCAL_SKILL, NON_LOCAL, DISPLAY_NAME, SORTING, UNDEFINED_ORDER, CONFLICTS_EXCLUSIVE, CONFLICTS_NON_EXCLUSIVE, ADVISORY_STATES)
- `WEB_AND_API_COMPILE_CONFIG`, `WEB_ONLY_COMPILE_CONFIG` - CompileConfig fixtures
- `TOOLING_AND_FRAMEWORK_CONFIG`, `CI_CD_CONFIG`, `FRAMEWORK_AND_STYLING_CONFIG`, `OBSERVABILITY_CONFIG`, `FRAMEWORK_AND_TESTING_CONFIG`, `EMPTY_MATRIX_CONFIG`, `UNRESOLVED_CONFLICT_MATRIX` - MatrixConfig fixtures

### mock-skills.ts

- `REACT_SKILL`, `REACT_SKILL_PRELOADED`, `VITEST_SKILL`, `VITEST_SINGLE_FILE_SKILL` - Skill entry constants
- `DEFAULT_TEST_SKILLS`, `PIPELINE_TEST_SKILLS`, `EXTRA_DOMAIN_TEST_SKILLS`, `ALL_TEST_SKILLS` - TestSkill arrays
- `INIT_SKILL_IDS`, `INIT_TEST_SKILLS` - Filtered skills for init tests
- `SWITCHABLE_SKILLS`, `LOCAL_SKILL_VARIANTS` - Source-switching test skills
- `HEALTH_*_SKILL` - Health-check skill variants (8 constants: ZUSTAND_RECOMMENDED, ORPHAN_SKILL, UNRESOLVED_COMPATIBLE_WITH_SKILL, UNRESOLVED_CONFLICTS_WITH_SKILL, UNRESOLVED_REQUIRES_SKILL, MULTIPLE_UNRESOLVED_REFS_SKILL, ALL_REFS_RESOLVED_SKILL, PARTIAL_UNRESOLVED_REQUIRES_SKILL)
- `CATEGORY_GRID_SKILLS` - 30-entry array for category grid tests
- `IMPORT_*_SKILL` - Import source skill constants (REACT_PATTERNS, TESTING_UTILS, API_SECURITY) + `ImportSourceSkill` type
- `MULTI_SOURCE_*_SKILLS` - Multi-source skill entries (PUBLIC, ACME, INTERNAL) + `MultiSourceSkillEntry` type
- `COMPILE_LOCAL_SKILL`, `DOCKER_TOOLING_SKILL`, `DATADOG_OBSERVABILITY_SKILL` - Individual TestSkill constants
- `CI_CD_SKILLS`, `DISCOURAGES_RELATIONSHIP_SKILLS`, `REQUIRES_RELATIONSHIP_SKILLS`, `RESOLUTION_PIPELINE_SKILLS` - TestSkill arrays for relationship tests
- `VALID_LOCAL_SKILL`, `SKILL_WITHOUT_METADATA`, `SKILL_WITHOUT_METADATA_CUSTOM` - Edge case test skills
- `LOCAL_SKILL_BASIC`, `LOCAL_SKILL_FORKED`, `LOCAL_SKILL_FORKED_MINIMAL` - Local skill test variants
- `REACT_CONFLICTS_VUE`, `VUE_CONFLICTS_REACT`, `ZUSTAND_CONFLICTS_PINIA`, `PINIA_CONFLICTS_ZUSTAND` - Conflict relationship skills
- `REACT_REQUIRES_ZUSTAND`, `REACT_RECOMMENDED`, `VUE_DISCOURAGES_SCSS`, `ZUSTAND_UNIVERSAL`, `REACT_LOCAL` - Relationship and scope variant skills

### mock-sources.ts

- `PUBLIC_SOURCE`, `ACME_SOURCE`, `INTERNAL_SOURCE` - SkillSource objects

### mock-stacks.ts

- `FULLSTACK_STACK`, `WEB_REACT_AND_SCSS_STACK`, `WEB_REACT_ONLY_STACK`, `WEB_SCSS_ONLY_STACK`, `API_HONO_ONLY_STACK`, `WEB_EMPTY_AGENT_STACK`, `EMPTY_AGENTS_STACK`, `SHARED_CATEGORY_STACK`, `STACK_WITH_EMPTY_AGENTS`, `MULTI_METHODOLOGY_STACK`, `STACK_WITH_EMPTY_CATEGORY`, `MANY_CATEGORIES_STACK`, `LOCAL_SKILL_STACK`, `COMPILATION_TEST_STACK` - Stack objects
- `CUSTOM_TEST_STACKS`, `PHILOSOPHY_TEST_STACKS`, `OVERRIDING_TEST_STACKS`, `MARKETPLACE_TEST_STACKS`, `MARKETPLACE_FULLSTACK_TEST_STACKS`, `PIPELINE_TEST_STACKS`, `MULTI_TEST_STACKS` - TestStack arrays for `createTestSource()`

### mock-source-files.ts

On-disk file shape fixtures for published-source validation tests (spread for negative-case variations):

- `VALID_STACK_CONFIG_FILE` - stack config.yaml (validated by `stackConfigValidationSchema`)
- `VALID_EMBEDDED_SKILL_METADATA_FILE` - embedded skill metadata (validated by `metadataValidationSchema`)
- `VALID_SKILL_CATEGORIES_FILE` - config/skill-categories.ts default export (validated by `skillCategoriesFileSchema`)
- `VALID_SKILL_RULES_FILE` - config/skill-rules.ts default export (validated by `skillRulesFileSchema`)
- `VALID_STACKS_CONFIG_FILE` - config/stacks.ts default export (validated by `stacksConfigSchema`)
- `VALID_PACKAGE_JSON_FILE` - minimal package.json for `build marketplace` tests
