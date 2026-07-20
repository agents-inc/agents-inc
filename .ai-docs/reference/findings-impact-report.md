---
scope: reference
area: architecture
keywords: [findings, agent-findings, impact, cross-reference]
related:
  - reference/architecture-overview.md
  - reference/test-infrastructure.md
last_validated: 2026-04-21
---

# Agent Findings Impact Report

**Generated:** 2026-03-28 (original); last full regeneration 2026-04-21 (Ralph iter 92); status rollup refresh 2026-04-21 post residual-cleanup sweep (8 findings lacking explicit `status:` classified)
**Total Findings Catalogued:** 109 (excluding `README.md` and `TEMPLATE.md`)
**Date Range:** 2026-04-03 to 2026-04-21 (the original 2026-03-21..2026-03-28 snapshot findings have since been moved or superseded; counts below reflect current directory contents)

> **Regeneration Policy:** Per `documentation-bible.md` rule (iter 40, incorporated iter 49), the report is fully regenerated when "Incremental Updates" exceeds ~10 entries OR when a Ralph sweep iter explicitly regenerates it. Iter 92 (this regeneration) folds iter-40/43/61 and earlier batches into the rollup tables and resets "Incremental Updates" to empty. The original 2026-03-28 snapshot tables are preserved verbatim under "Original Snapshot" for historical reference.

---

## Rollups (iter 92 regeneration, 109 findings on disk; post residual-cleanup sweep 2026-04-21)

### By Status

| Status       | Count | Share |
| ------------ | ----- | ----- |
| `resolved`   | 90    | 82.6% |
| `partial`    | 7     | 6.4%  |
| `open`       | 10    | 9.2%  |
| `superseded` | 2     | 1.8%  |
| **Total**    | 109   | 100%  |

"Open" means frontmatter has `status: open` or was absent (per README default). `partial` is a new enum value introduced in the 2026-04-21 3-batch status classification sweep for findings where the remedy landed for some call sites but coverage is incomplete. `superseded` is set via the `superseded_by:` frontmatter link.

Residual-cleanup sweep 2026-04-21 classified 8 findings that had no explicit `status:` (7 from 2026-04-20 + 1 from 2026-04-18). Outcomes: 4 `resolved` (D-228, D-229 — both shipped in 0.141.0; e2e-fixture-preload-drift — 0.140.0 realism trim; d217-test-prereq-already-satisfied — closed 2026-04-21 by `standards/e2e/test-data.md § Before Extending Fixtures`), 1 `superseded` (new-agent-toggle-defaults-global-scope → newly-toggled-agent sibling), 3 `open` (mergeConfigs-drops-projects-field — still unfixed in `config-merger.ts`; d217-installmode-plumbing-dead-in-wrappers — dead plumbing still on wrappers per 0.140.0 note; newly-toggled-agent — `wizard-store.ts` still hard-codes `scope: "global"`).

### By Date (filing day)

| Date       | Count | Notes                                                                                                                                                |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-03 | 4     | Skill content accuracy sweep                                                                                                                         |
| 2026-04-05 | 1     | ENOENT catch-all                                                                                                                                     |
| 2026-04-06 | 5     | Init/edit semantics, agent cross-contamination                                                                                                       |
| 2026-04-07 | 2     | E2E retry isolation, re-scoped skill duplicate rows                                                                                                  |
| 2026-04-08 | 1     | Toggle technology scope guard                                                                                                                        |
| 2026-04-09 | 13    | Assertion-quality sweep (D-160s)                                                                                                                     |
| 2026-04-13 | 6     | E2E anti-pattern audit D-168                                                                                                                         |
| 2026-04-14 | 5     | HOME isolation, inline error extraction, marketplace flag drift                                                                                      |
| 2026-04-15 | 2     | Stack ownership model, silent scope fallbacks                                                                                                        |
| 2026-04-16 | 1     | Silent plugin install skip on missing marketplace                                                                                                    |
| 2026-04-17 | 7     | D-224 tombstone / init partial state cluster                                                                                                         |
| 2026-04-18 | 1     | `mergeConfigs` drops `projects` field                                                                                                                |
| 2026-04-20 | 7     | D-217 / D-228 / D-229 wave                                                                                                                           |
| 2026-04-21 | 54    | Ralph docs-sweep iters 11..91 + post-sweep filings + 0.42.1 orphan release + eject-success-log-stale-partial-names + pre-impl-design-docs-historical |
| **Total**  | 109   |                                                                                                                                                      |

### By Root Cause

| Root Cause                  | Count | Canonical remedy                                   |
| --------------------------- | ----- | -------------------------------------------------- |
| `convention-undocumented`   | 55    | Add rule to standards doc; cite in CLAUDE.md       |
| `rule-not-specific-enough`  | 18    | Tighten rule wording with enumerated cases         |
| `enforcement-gap`           | 18    | Add lint/check or coverage-as-policy requirement   |
| `rule-not-visible`          | 11    | Cross-link rule from other docs; move to prominent |
| `missing-rule`              | 3     | New rule needs to be authored from scratch         |
| `scope-discipline-deferred` | 1     | Knowingly left; track as TODO                      |

### By Severity

| Severity | Count |
| -------- | ----- |
| high     | 22    |
| medium   | 59    |
| low      | 25    |

### By Category

| Category     | Count |
| ------------ | ----- |
| architecture | 61    |
| testing      | 33    |
| dry          | 11    |
| typescript   | 1     |

---

## Original Snapshot (2026-03-21..2026-03-28, 75 findings)

## Summary Table

| Reference Doc                   | Findings Count | Stale Info | Missing Info | Priority |
| ------------------------------- | -------------- | ---------- | ------------ | -------- |
| test-infrastructure.md          | 9              | 2          | 3            | HIGH     |
| commands.md                     | 2              | 1          | 1            | MED      |
| component-patterns.md           | 1              | 0          | 1            | LOW      |
| store-map.md                    | 1              | 0          | 0            | LOW      |
| configuration.md                | 5              | 1          | 2            | HIGH     |
| skills-and-matrix.md            | 1              | 0          | 1            | LOW      |
| plugin-system.md                | 1              | 0          | 0            | LOW      |
| utilities.md                    | 0              | 0          | 0            | --       |
| type-system.md                  | 0              | 0          | 0            | --       |
| compilation-pipeline.md         | 0              | 0          | 0            | --       |
| wizard-flow.md                  | 0              | 0          | 0            | --       |
| architecture-overview.md        | 1              | 0          | 1            | LOW      |
| operations-layer.md             | 1              | 0          | 1            | LOW      |
| **agent-system.md (MISSING)**   | 14             | --         | 14           | **HIGH** |
| **skills-content.md (MISSING)** | 38             | --         | 38           | **HIGH** |
| Uncategorized                   | 3              | --         | --           | LOW      |

---

## Detailed Impact per Reference Doc

### 1. test-infrastructure.md -- 9 findings (HIGH)

| Finding                                                  | Summary                                                                             | Impact Type                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `2026-03-21-claudemd-violations-in-framework.md`         | E2E framework code had double casts, unnecessary union casts, backward-compat shims | Missing: E2E framework patterns not documented                  |
| `2026-03-21-duplicated-e2e-constants.md`                 | Path/timeout constants duplicated locally in 10+ E2E files instead of centralized   | Missing: `SOURCE_PATHS` and new `TIMEOUTS.*` entries not in doc |
| `2026-03-21-duplicated-e2e-helpers.md`                   | Helper functions duplicated in 8+ E2E files instead of shared                       | Missing: new shared helpers not catalogued                      |
| `2026-03-21-missing-test-cleanup.md`                     | Missing `afterAll` cleanup, unused variables, `as any` casts in E2E tests           | Stale: cleanup patterns section may need reinforcement          |
| `2026-03-21-toequal-vs-tostrictequal.md`                 | `toEqual` used where `toStrictEqual` required for objects                           | Missing: `toStrictEqual` rule not documented in test-infra doc  |
| `2026-03-23-e2e-undefined-assertion-and-raw-readfile.md` | 34 `undefined!` assertions and 6 raw `readFile` calls in E2E                        | Stale: anti-patterns not in documented patterns                 |
| `2026-03-25-inline-test-data-in-build-step-logic.md`     | Inline mock skill construction instead of using `SKILLS.*` constants                | Missing: mock data discipline not cross-referenced              |
| `2026-03-25-unnecessary-internal-mocks.md`               | 12+ test files mock pure functions unnecessarily                                    | Missing: mocking guidelines not documented                      |
| `2026-03-25-unnecessary-matrix-provider-mocks.md`        | `getErrorMessage` and `consts` mocked to identical values                           | Missing: "what to mock" decision tree not documented            |

**Actions needed:**

- Add `SOURCE_PATHS` and new `TIMEOUTS.*` constants to E2E constants section
- Add shared helper catalog (new helpers from `test-utils.ts`, `dual-scope-helpers.ts`)
- Add "Mocking Guidelines" section: what to mock (I/O, env-dependent paths), what NOT to mock (pure functions, identical-value consts)
- Add `toStrictEqual` rule to assertion patterns section
- Document `readTestFile()` as canonical file reading helper
- Remove `undefined!` cleanup pattern from any examples

---

### 2. configuration.md -- 5 findings (HIGH)

| Finding                                                      | Summary                                                                                                      | Impact Type                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `2026-03-24-inlined-global-stack-not-merged.md`              | `generateProjectConfigWithInlinedGlobal` ignored global stack entirely                                       | Stale: config-writer merge behavior not accurately documented                                            |
| `2026-03-24-object-fromEntries-overwrites-duplicate-keys.md` | `Object.fromEntries()` silently dropped skills sharing same category                                         | Missing: config-generator duplicate-key pitfall not documented                                           |
| `2026-03-24-shallow-stack-merge-loses-categories.md`         | Shallow spread lost nested categories in stack merge; config-types imports wrong for self-contained config   | Missing: `mergeConfigs()` deep-merge-at-category-level and `writeStandaloneConfigTypes()` not documented |
| `2026-03-25-dead-code-and-type-cast-cleanup.md`              | Dead functions (`writeProjectConfigTypes`, `compactStackForYaml`), type inconsistency in blank global config | Stale: dead code removal not reflected in doc                                                            |
| `matrix-loading-performance.md`                              | Matrix loading performance characteristics and anti-patterns in source-loader.ts shallow spreads             | Missing: performance characteristics and loading strategy not documented                                 |

**Actions needed:**

- Update config-writer section to document `mergeConfigs()` (in `config-merger.ts`) and its deep-merge-at-category-level pattern for stacks
- Update config-types-writer section to document `writeStandaloneConfigTypes()`
- Remove references to dead functions (`writeProjectConfigTypes`, `compactStackForYaml`, `compactAssignment`)
- Add note about `Object.fromEntries()` duplicate-key risk in config-generator
- Consider adding matrix loading performance characteristics (or create separate doc)

---

### 3. commands.md -- 2 findings (MED)

> **Post-migration note (2026-04-21):** `reference/commands.md` is now a pointer stub. Canonical content lives in [`commands/index.md`](./commands/index.md). Action items below apply to the canonical doc.

| Finding                                                 | Summary                                                                                | Impact Type                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | Init marketplace fallback path was incomplete -- skills not copied locally on fallback | Stale: init command flow missing fallback documentation  |
| `init-missing-global-compile.md`                        | `cc init` does single-pass compilation, missing global agents                          | Missing: init multi-scope compilation gap not documented |

**Actions needed:**

- Update init command flow to document marketplace fallback behavior (copy skills locally when marketplace unavailable)
- Document the multi-scope compilation gap: init only compiles to project dir, not global
- Reference compile.ts `buildCompilePasses()` pattern as the correct multi-scope approach

---

### 4. component-patterns.md -- 1 finding (LOW)

| Finding                                            | Summary                                                                                                              | Impact Type                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `2026-03-26-missing-scroll-indicator-rendering.md` | `UI_SYMBOLS.SCROLL_UP/DOWN` defined but never rendered; scroll hooks compute hidden counts but nothing displays them | Missing: scroll indicator rendering pattern not documented |

**Actions needed:**

- Add "Scroll Indicators" subsection under Virtual Scrolling documenting the gap between defined symbols/hooks and actual rendering
- Document recommended scroll indicator implementation pattern

---

### 5. skills-and-matrix.md -- 1 finding (LOW)

| Finding                         | Summary                                                                                             | Impact Type                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `matrix-loading-performance.md` | Matrix loading flow from build-time to per-command; BUILT_IN_MATRIX optimization for default source | Missing: performance-oriented loading flow not documented |

**Actions needed:**

- Consider adding a "Performance" subsection documenting BUILT_IN_MATRIX optimization, eager vs lazy loading boundary, and per-command loading costs

---

### 6. plugin-system.md -- 1 finding (LOW)

| Finding                                                 | Summary                                                                 | Impact Type                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | Marketplace fallback in init should copy skills locally but was missing | Stale: fallback behavior in installation flow |

**Actions needed:**

- Verify marketplace fallback documentation in plugin installation section

---

### 7. architecture-overview.md -- 1 finding (LOW)

| Finding                          | Summary                                                              | Impact Type                                                                           |
| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `init-missing-global-compile.md` | Init lacks multi-scope compilation pattern that compile command uses | Missing: data flow section may not document init vs compile scope handling difference |

**Actions needed:**

- Note the init/compile asymmetry in data flow or compilation section

---

### 8. operations-layer.md -- 1 finding (LOW)

| Finding                          | Summary                                                                         | Impact Type                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `init-missing-global-compile.md` | `compile-agents.ts` operations module has `scopeFilter` but init doesn't use it | Missing: operations layer doc should reference the multi-scope pattern |

**Actions needed:**

- Verify `compile-agents.ts` `scopeFilter` parameter is documented

---

### 9. store-map.md -- 1 finding (LOW)

| Finding                                                 | Summary                                                                                                      | Impact Type                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `2026-03-26-marketplace-fallback-missing-skill-copy.md` | `createDefaultSkillConfig()` sets `source: primarySource` causing `deriveInstallMode()` to return `"plugin"` | Missing: store behavior context for install mode derivation |

**Actions needed:**

- Verify `createDefaultSkillConfig()` source-setting behavior is documented

---

## Missing Reference Docs

### agent-system.md (NEW DOC NEEDED) -- 14 findings

These findings affect `src/agents/` files -- a directory with no dedicated reference documentation.

| Finding                                                              | Summary                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `2026-03-23-skill-summoner-stale-metadata-format.md`                 | Skill-summoner agent templates used stale metadata.yaml format                        |
| `2026-03-27-ai-developer-deprecated-grep-pattern.md`                 | ai-developer used deprecated OpenAI v3 grep pattern                                   |
| `2026-03-27-ai-developer-missing-config-and-stale-refs.md`           | ai-developer missing from config, stale file references, missing findings instruction |
| `2026-03-27-api-pm-missing-findings-instruction.md`                  | api-pm and web-pm missing findings capture propagation                                |
| `2026-03-27-api-tester-rate-limit-loop-off-by-one.md`                | api-tester had off-by-one in rate limit test example                                  |
| `2026-03-27-api-tester-template-duplication-and-missing-findings.md` | api-tester had template-injected content duplicated in source files                   |
| `2026-03-27-infra-reviewer-core-principles-conflict.md`              | infra-reviewer had custom `<core_principles>` conflicting with template               |
| `2026-03-27-infra-reviewer-github-actions-latest-tag-inaccuracy.md`  | infra-reviewer used `@latest` instead of `@main` for Actions tags                     |
| `2026-03-27-reviewer-agents-missing-findings-capture-instruction.md` | cli-reviewer and infra-reviewer missing findings capture instruction                  |
| `2026-03-27-planning-agents-arrow-inconsistency.md`                  | api-pm used ASCII arrows where Unicode convention applies                             |
| `2026-03-27-self-correction-arrow-convention-drift.md`               | 5 new agents used wrong arrow conventions                                             |
| `2026-03-27-core-md-pattern-numbering-disorder.md`                   | Skill examples had disordered pattern numbering                                       |
| `2026-03-27-deprecated-model-references-in-skills.md`                | AI provider skills referenced deprecated model names                                  |
| `2026-03-27-skill-metadata-missing-version-tags.md`                  | Multiple skills missing version/tags in metadata.yaml                                 |

**What this doc should cover:**

- Agent directory structure (`src/agents/{category}/{agent-name}/`)
- Agent file roles: `identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md`, `output.md`, `metadata.yaml`
- Template injection rules: what the `agent.liquid` template injects vs what source files provide
- Agent compilation: config.ts entry, `agentsinc compile`, scope routing
- Convention rules: arrow types, findings capture, no template duplication, no custom `<core_principles>`
- Relationship to skills repo: agents reference skills, metadata schema alignment

---

### skills-content.md (NEW DOC NEEDED) -- 38 findings

These findings affect skill content files in the `/home/vince/dev/skills/` sibling repo. While this is a separate repository, the CLI compiles and installs these skills. A reference doc would help agents working on skill content.

**Note:** This doc may belong in the skills repo rather than the CLI repo. Listing here for completeness since the findings were filed in the CLI repo's agent-findings pipeline.

| Category                  | Count | Key Findings                                                                                                                                                                                                                                                                                   |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fabricated/Wrong APIs** | 12    | Appwrite `Realtime` class, Pinecone `fetchByMetadata`, Weaviate `.use()`, Clack `p.progress`, oclif `usePaste`, Resend idempotency, OpenAI `Float64Array`, Vercel Postgres wrapper claim, PostHog defaults, Eden Treaty bracket syntax, Wrangler `--secrets-file`, Promptfoo `--fail-on-error` |
| **Cross-domain coupling** | 8     | Firebase React context, Vitest Playwright coupling, mobile Expo/RN overlap, GraphQL `@/` imports, VeeValidate React reference, Hono Server Actions, data-fetching `"use client"`, MSW React imports                                                                                            |
| **Content duplication**   | 8     | Prisma, Sanity, Payload, Drizzle, Turso SKILL.md full implementations duplicating examples; reviewing skill rationale duplication; auth-security red flags duplication; turborepo philosophy duplication                                                                                       |
| **Atomicity violations**  | 6     | UI skills naming competitors, mobile cross-contamination, SCSS module coupling in file-upload, SCSS fences for CSS, CLAUDE.md template contamination, auth library coupling                                                                                                                    |
| **Stale/wrong metadata**  | 4     | Deprecated model names, missing version/tags, NestJS SWC claim, Auth.js env var naming                                                                                                                                                                                                         |

---

## Uncategorized Findings (3)

These findings don't map cleanly to any existing or proposed reference doc:

| Finding                                                    | Summary                                                                    | Why Uncategorized                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `2026-03-27-anthropic-sdk-skill-incorrect-model-specs.md`  | Incorrect model specs in Anthropic SDK skill                               | Affects skills repo content, not CLI codebase         |
| `2026-03-27-forms-skills-magic-numbers-and-console-log.md` | Magic numbers and console.log in VeeValidate/Zod skills                    | Affects skills repo content, not CLI codebase         |
| `2026-03-27-skill-good-example-contradicts-red-flag.md`    | TypeORM good example used pattern the skill's own red flags warned against | Affects skills repo content, internal coherence issue |

---

## Systemic Patterns Detected

### Pattern 1: Agent Template Contamination (7 findings)

Multiple agent findings reveal the same root cause: agent source files duplicate content that the `agent.liquid` template injects automatically.

**Affected findings:**

- `api-tester-template-duplication-and-missing-findings.md` -- `<core_principles>` and `<write_verification_protocol>` duplicated
- `infra-reviewer-core-principles-conflict.md` -- custom `<core_principles>` conflicts with template
- `skill-metadata-and-template-contamination.md` -- CLAUDE.md references in marketplace skills

**Root cause:** No documented list of what the agent template injects, so agents created by agent-summoner include sections that end up double-rendered.

**Recommendation:** Document template-injected sections in agent-system.md. Add a post-creation validation step to agent-summoner.

---

### Pattern 2: Missing Findings Capture Instruction (5 findings)

Five separate findings discovered the same gap: agents lacking the CLAUDE.md-mandated findings capture instruction.

**Affected findings:**

- `ai-developer-missing-config-and-stale-refs.md`
- `api-pm-missing-findings-instruction.md`
- `api-tester-template-duplication-and-missing-findings.md`
- `reviewer-agents-missing-findings-capture-instruction.md`
- `self-correction-arrow-convention-drift.md` (tangentially)

**Root cause:** The findings capture instruction is in CLAUDE.md but not propagated to agent templates. Each agent must be individually patched.

**Recommendation:** Add findings capture to the agent template (`agent.liquid`) so all compiled agents get it automatically.

---

### Pattern 3: AI-Fabricated APIs in Skills (12 findings)

The largest category of skill findings involves AI-generated code that references APIs, methods, classes, CLI flags, or callback signatures that do not exist. This is a hallucination pattern.

**Examples:**

- Appwrite `Realtime` class and `Channel` helper (completely fabricated)
- Pinecone `fetchByMetadata()` (does not exist)
- Weaviate `.use()` instead of `.get()` (wrong method name)
- Promptfoo `--fail-on-error` (fabricated CLI flag)
- Resend idempotency key in wrong position (wrong API shape)
- Vercel Postgres claimed to wrap `@neondatabase/serverless` (wraps `pg`)

**Root cause:** AI models generate plausible-looking APIs that don't match real SDKs. The skill-atomicity-primer already warns about this but enforcement is inconsistent.

**Recommendation:** Strengthen the quality gate checklist in skill-atomicity-bible.md with a mandatory "verify every import and method call against official docs" step.

---

### Pattern 4: SKILL.md Content Duplication (8 findings)

Skills consistently duplicate full code implementations between SKILL.md and their example files, despite the atomicity bible requiring "brief 3-10 line snippet + link."

**Affected skills:** Prisma, Sanity, Payload, Drizzle, Turso, auth-security, turborepo, reviewing

**Root cause:** AI-generated skills create full implementations in SKILL.md and again in example files. The atomicity bible rule exists but is frequently violated in initial generation.

**Recommendation:** Add a more prominent callout in skill-atomicity-bible.md and a specific skill-summoner validation check.

---

### Pattern 5: Config Writer / Generator Bugs (4 findings)

Four findings uncovered bugs in the configuration generation pipeline, all involving merge semantics:

- Global stack not merged (shallow spread lost data)
- `Object.fromEntries()` dropped duplicate categories
- Config-types used wrong import pattern for self-contained config
- Dead code from YAML-to-TS migration not cleaned up

**Root cause:** The configuration system underwent a YAML-to-TypeScript migration and a global/project scope split. Both transitions introduced merge edge cases that weren't covered by tests.

**Recommendation:** Update configuration.md to document merge semantics, especially `mergeConfigs()` (in `config-merger.ts`) and the global-inlined vs global-imported patterns.

---

### Pattern 6: Observability gaps around `projects` + propagation in `local-installer.ts` (3 findings, 2026-04-21)

Three findings in two days (`d233-projects-normalization-asymmetry`, `propagation-skipped-observability-gap`, `registerProjectPath-sweep-observability-gap`) all point at the same module. Root cause: the module grew new return channels (`skipped`, sweep results) without a contract in `config-writer.md` requiring callers to inspect them.

### Pattern 7: E2E page-object keypress rule under-enforced (2 findings, 2026-04-21)

Two findings same day (`e2e-build-step-keypress-missing-stable-render`, `e2e-keypress-rule-coverage-gap-sibling-steps`). Rule exists in `standards/e2e/page-objects.md`, but coverage-as-policy is missing — nothing requires ALL step page-objects to comply.

### Pattern 8: Reference-doc drift sweep (iter 25–33 of Ralph loop) (9+ findings, 2026-04-21)

`dependency-graph`, `boundary-map`, `wizard/state-transitions` (canonical; `reference/state-transitions.md` is now a pointer stub post dual-home cleanup), `component-patterns` (guard + tombstone + skill-agent-summary), `store-map`, `commands/index` (×2; canonical; `reference/commands.md` is now a pointer stub post subdirectory migration), `features/wizard-flow`, `features/skills-and-matrix`, `testing/mock-data`. Root cause: no revalidation schedule during the D-2xx feature sprint. Remedy: single full-reference sweep after each D-2xx release, not per-finding patching.

---

## Priority Actions

### HIGH Priority

1. **`agent-system.md`** — DONE (created, last_validated 2026-04-21 per DOCUMENTATION_MAP).
2. **Pattern 9 closure** — run a convention-keeper iter doing a bidirectional diff between CLAUDE.md and `clean-code-standards.md`; promote missed rules.
3. **Pattern 6 closure** — surface `skipped` + sweep results in `config-writer.md` contract; document `registerProjectPath` / `deregisterProjectPath` normalization symmetry.
4. **Pattern 7 closure** — add enumerated coverage-as-policy list to `page-objects.md` for step page-objects that must call `waitForWizardFooter()` before every keypress (`BaseStep` subclasses only — the wait is a wizard-footer sentinel, not a generic stability primitive).
5. **Skills-content.md decision** — 38 skill-content findings: decide whether to create in CLI repo or migrate to `/home/vince/dev/skills/`.

### MEDIUM Priority

6. **Pattern 8 doc-drift sweep** — `commands/index.md` (canonical; `commands.md` is a pointer stub), `component-patterns.md`, `store-map.md`, `wizard/state-transitions.md` (canonical; `state-transitions.md` is a pointer stub), `features/wizard-flow.md`, `features/skills-and-matrix.md`, `features/configuration.md`, `testing/mock-data.md` — all flagged 2026-04-21. Several have been stamp-bumped without content-check (`commands-doc-stamp-without-content-check.md`).
7. **Pattern 10 closure** — complete delegation / ralph-loop / skill-content-tags sections in respective bibles (partially done per iter 68/70/74 fixes).
8. **`test-infrastructure.md`** — 9 original findings + `iter42-test-infrastructure-drifted-original.md` + `complex-helpers-in-component-tests-anti-pattern.md`. Mocking guidelines, `toStrictEqual` rule, helper catalog.

### LOW Priority

9. ~~**Backfill frontmatter** on `2026-04-13-e2e-anti-pattern-audit-d168.md` (unset `root_cause`/`severity`/`category`).~~ — DONE 2026-04-21 (`type: audit`, `severity: medium`, `category: testing`, `domain: e2e`, `root_cause: enforcement-gap`).
10. **Pattern 11 maintenance** — every ~10 iters, run a findings-directory self-audit iter.
11. **`D-NNN` task-ID sweep** — `task-ids-in-test-names-sweep-needed.md` identified ~151 instances across ~30 E2E files.

---

### Patterns 9-11 (new post-iter-40 — iter 92 regeneration)

**Pattern 9: Standards docs ↔ CLAUDE.md bidirectional drift** (4 findings, iter 67/71/90/91)

- `r73-atomicity-bible-drift.md` — bible quality-gate contradicts newer primer; stale `examples.md` references.
- ~~`iter71-bible-cross-ref-disambiguator.md`~~ — RESOLVED 2026-04-21: DOCUMENTATION_MAP.md carries `Scope disambiguator` column for both bibles; prompt-bible §8.3 now canonicalizes to `250-300 words` and cross-refs loop-prompts-bible §8.4 as SOT.
- `iter90-clean-code-standards-test-rules-drift.md` — test rules (`toStrictEqual`, no TODO IDs in names) enforced in CLAUDE.md but absent from reviewer-checkable `clean-code-standards.md`.
- `claude-md-standards-drift-iter-91.md` — bidirectional sweep found scope-awareness, fine-grained factory rules, and repo-hygiene rules in CLAUDE.md with no counterpart in standards doc.

Root cause: rules accumulate in CLAUDE.md when added in response to a slip but aren't promoted into the reviewer-checkable doc. Remedy: automated bidirectional diff in a convention-keeper iter.

**Pattern 10: Domain-bible section gaps** (3 findings, iter 68/70/74)

- `iter68-prompt-bible-missing-delegation-section.md` — prompt-bible had zero project-specific multi-agent delegation guidance.
- `iter70-loop-prompts-bible-missing-ralph-section.md` — loop-prompts-bible had zero ralph-loop mechanism coverage (completion-promise rule, single-focus, findings-as-product, report length caps, self-correction triggers).
- `iter74-prompt-bible-missing-skill-content-tags.md` — bible XML tag list missing skill-content layer (`<philosophy>`, `<patterns>`, `<red_flags>`, `<decision_framework>`, `<integration>`, `<performance>`, `<migration_notice>`).

Root cause: bibles were seeded with generic prompt-engineering content and never caught up to project-specific mechanisms (ralph-loop, skill content XML, delegation roster). Remedy: per-bible "domain completeness" audit.

**Pattern 11: Findings-system self-governance drift** (4 findings, iter 40/45/83/85)

- `findings-impact-report-no-regeneration-schedule.md` (iter 40) — this very report lacked a regeneration trigger. Fixed + codified in documentation-bible iter 49.
- `agent-findings-frontmatter-drift-iter45.md` — findings filed with `**Date:**` body lines instead of YAML frontmatter.
- `iter83-findings-status-model-codification.md` — two conflicting resolution models (directory-as-status vs frontmatter-as-status); 45 findings used frontmatter, 0 used `done/`. Frontmatter model codified; `done/` demoted to optional cold archive.
- `iter85-supersedes-asymmetry-one-way-link.md` — `supersedes:`/`superseded_by:` pair had one-way link.

Root cause: the findings directory grew past ~50 entries before anyone audited its own conventions. Remedy: every ~10 iters, run a findings-directory self-audit iter.

---

## Incremental Updates

_Reset iter 92 (2026-04-21). Next regeneration trigger: >10 entries accumulated here, OR a Ralph sweep iter explicitly regenerates._

- 2026-04-21 — `2026-04-21-changelog-summary-bullet-coverage-gap.md` → resolved. Added forward-applying Release Checklist bullet to `.ai-docs/standards/commit-protocol.md` requiring every `### D-xxx` subheading in `changelogs/{version}.md` to have ≥1 bullet in the corresponding `CHANGELOG.md` summary block (mechanically checkable via grep/diff). By Status: open 9→8, resolved 82→83.
- 2026-04-21 — micro-sync: one partial finding flipped to resolved. By Status: partial 9→8, resolved 87→88. Non-closed 16→15.
- 2026-04-21 — residual close: `file-path-canonicalization-mixed-forms.md` → resolved by `documentation-bible.md § File-Path Conventions in Docs` (three accepted forms + one-doc-one-form rule). By Status: partial 8→7, resolved 88→89. Non-closed 15→14.
- 2026-04-21 — filed `2026-04-21-eject-success-log-stale-partial-names.md` (convention-drift, low, architecture/cli, convention-undocumented, open). `src/cli/commands/eject.ts` success-log string references stale partial vocabulary ("templates, agent intro, workflow, and examples") not matching the actual partials (`identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md`, `output.md`). Total 107→108. By Status: open 9→10. Non-closed 16→17.
- 2026-04-21 — filed `2026-04-21-pre-implementation-design-docs-unmarked-as-historical.md` (convention-drift, low, architecture/shared, convention-undocumented, resolved). Added `HISTORICAL DESIGN NOTE` banner to `docs/excluded-skills-design.md` + `docs/excluded-skills-edge-cases.md` pointing to `.ai-docs/reference/concepts/tombstone-pattern.md`. Total 108→109. By Status: resolved 89→90.
