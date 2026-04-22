# Unit Test Gap — Implementation Tracker

> Tracks progress on the 29 untested functions originally catalogued in the unit-test gaps audit.
> Agents: update Status to `in-progress` when starting, `done` when tests pass.

## Batch A: output-validator.ts (P1)

| #   | Function                 | File                | Status | Notes               |
| --- | ------------------------ | ------------------- | ------ | ------------------- |
| 1   | `checkXmlTagBalance`     | output-validator.ts | done   | Exported + 12 tests |
| 2   | `checkTemplateArtifacts` | output-validator.ts | done   | Exported + 6 tests  |
| 3   | `checkRequiredPatterns`  | output-validator.ts | done   | Exported + 8 tests  |
| 4   | `validateFrontmatter`    | output-validator.ts | done   | Exported + 9 tests  |

## Batch B: matrix-resolver.ts (P1)

| #   | Function                  | File               | Status | Notes               |
| --- | ------------------------- | ------------------ | ------ | ------------------- |
| 5   | `validateConflicts`       | matrix-resolver.ts | done   | Exported + 9 tests  |
| 6   | `validateRequirements`    | matrix-resolver.ts | done   | Exported + 12 tests |
| 7   | `validateExclusivity`     | matrix-resolver.ts | done   | Exported + 10 tests |
| 8   | `validateRecommendations` | matrix-resolver.ts | done   | Exported + 11 tests |

## Batch C: source-loader.ts + source-fetcher.ts (P1)

| #   | Function                      | File              | Status | Notes                                               |
| --- | ----------------------------- | ----------------- | ------ | --------------------------------------------------- |
| 9   | `convertStackToResolvedStack` | source-loader.ts  | done   | Exported + 7 tests                                  |
| 10  | `extractSourceName`           | source-loader.ts  | done   | Exported + 12 tests                                 |
| 11  | `mergeLocalSkillsIntoMatrix`  | source-loader.ts  | done   | Exported (already takes matrix as param) + 10 tests |
| 12  | `getGigetCacheDir`            | source-fetcher.ts | done   | Exported + 12 tests                                 |

## Batch D: wizard/utils.ts + hotkeys.ts + schemas.ts + versioning.ts (P2)

| #   | Function               | File            | Status | Notes                               |
| --- | ---------------------- | --------------- | ------ | ----------------------------------- |
| 13  | `getDomainDisplayName` | wizard/utils.ts | done   | 2 tests in utils.test.ts            |
| 14  | `orderDomains`         | wizard/utils.ts | done   | 4 tests in utils.test.ts            |
| 15  | `getDomainsFromStack`  | wizard/utils.ts | done   | 2 tests, uses initializeMatrix      |
| 16  | `getStackName`         | wizard/utils.ts | done   | 3 tests, uses initializeMatrix      |
| 17  | `formatZodErrors`      | schemas.ts      | done   | 5 tests appended to schemas.test.ts |
| 18  | `parseMajorVersion`    | versioning.ts   | done   | Exported + 2 tests                  |
| 19  | `bumpMajorVersion`     | versioning.ts   | done   | Exported + 2 tests                  |
| 20  | `isHotkey`             | hotkeys.ts      | done   | 2 tests in hotkeys.test.ts          |

## Batch E: local-installer.ts + compiler.ts (P2/P3)

| #   | Function                    | File               | Status | Notes                                                                       |
| --- | --------------------------- | ------------------ | ------ | --------------------------------------------------------------------------- |
| 21  | `resolveInstallPaths`       | local-installer.ts | done   | Exported + 3 tests                                                          |
| 22  | `buildLocalSkillsMap`       | local-installer.ts | done   | Exported + 4 tests (uses initializeMatrix for module-level matrix)          |
| 23  | `buildCompileAgents`        | local-installer.ts | done   | Exported + 5 tests (incl. cross-scope safety net)                           |
| 24  | `buildAgentScopeMap`        | local-installer.ts | done   | Exported + 3 tests                                                          |
| 25  | `buildAgentTemplateContext` | compiler.ts        | done   | Exported + 7 tests                                                          |
| 26  | `setConfigMetadata`         | local-installer.ts | done   | Refactored to pure (returns new object) + 8 tests (incl. no-mutation check) |

## Batch F: config-merger.ts + source-validator.ts (P3)

| #   | Function                                                      | File                | Status | Notes                              |
| --- | ------------------------------------------------------------- | ------------------- | ------ | ---------------------------------- |
| 27  | `mergeConfigs` (extract from `mergeWithExistingConfig`)       | config-merger.ts    | done   | Extracted pure function + 17 tests |
| 28  | `validateMetadataConventions` (extract from `validateSource`) | source-validator.ts | done   | Extracted pure function + 13 tests |
| 29  | `validateSkillFilePairs` (extract from `validateSource`)      | source-validator.ts | done   | Extracted pure function + 7 tests  |
