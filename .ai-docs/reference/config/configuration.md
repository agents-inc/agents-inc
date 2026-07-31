---
scope: reference
area: config
keywords:
  [
    config,
    source-resolution,
    ProjectConfig,
    SkillConfig,
    config-writer,
    config-generator,
    scope-splitting,
    branding,
  ]
related:
  - reference/config/config-writer.md
  - reference/config/config-merger.md
  - reference/config/scope-split.md
  - reference/concepts/scope-system.md
  - reference/architecture/overview.md
  - reference/types/core-types.md
last_validated: 2026-07-30
---

<!--
re-validated 2026-07-30 (product 0.146.0): pointer body only — added a topic->destination table so the
0.145.0/0.146.0 additions are routable (ConfigLoadError three-way load contract, the 89 default category
definitions, D-279 cross-scope reconciliation, compile/uninstall config-types regeneration). No content
duplicated; features/configuration.md remains authoritative.
-->

# Configuration System

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Reorganized from:** `reference/features/configuration.md`. The original file is preserved during migration.

**Full content: See `reference/features/configuration.md`** -- this file is the authoritative source until cleanup.

## Where Content Lives

| Topic                                                                                                 | Destination                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Config file locations, `ProjectConfig` / `SkillConfig` / `AgentScopeConfig` shapes, source resolution | [../features/configuration.md](../features/configuration.md)                                         |
| `ConfigLoadError` — missing vs blank vs unloadable config (D-273)                                     | [../features/configuration.md](../features/configuration.md)                                         |
| The 89 `defaultCategories` definitions, exclusive/required counts, ordering rule                      | [../features/configuration.md](../features/configuration.md)                                         |
| D-279 cross-scope reconciliation (masking, self-heal, mask lifetime)                                  | [../features/configuration.md](../features/configuration.md), [config-writer.md](./config-writer.md) |
| Config writer internals, `generateProjectConfigWithInlinedGlobal`, union emission                     | [config-writer.md](./config-writer.md)                                                               |
| `writeScopedConfigs` branches, `propagateGlobalChangesToProjects`, the `projects` registry lifecycle  | [config-writer.md](./config-writer.md)                                                               |
| `config-types.ts` writer selection, `regenerateScopeConfigTypes`, compile/uninstall regeneration      | [config-writer.md](./config-writer.md)                                                               |
| Merge semantics: `mergeConfigs`, `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`   | [config-merger.md](./config-merger.md)                                                               |
| Scope partitioning: `splitConfigByScope`, the D-220 delta pipeline                                    | [scope-split.md](./scope-split.md)                                                                   |
| Cross-cutting scope model (project vs global paths, install-path resolution)                          | [../concepts/scope-system.md](../concepts/scope-system.md)                                           |
| Tombstone / derived-mask lifecycle                                                                    | [../concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md)                                 |

## Why This Path Is Kept

Inbound links from `DOCUMENTATION_MAP.md`, the sibling `config/*.md` files' `related:` frontmatter, and agent findings that cite `reference/config/configuration.md` as the config-area entry point.
