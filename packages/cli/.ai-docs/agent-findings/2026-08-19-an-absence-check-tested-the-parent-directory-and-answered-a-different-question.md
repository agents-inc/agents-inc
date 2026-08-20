---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/loading/source-fetcher.ts
  - src/cli/lib/loading/source-loader.ts
  - .ai-docs/reference/features/source-fetch-and-cache.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-19
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `fetchMarketplace` now checks `fileExists(marketplacePath)` rather than
  `directoryExists(path.dirname(marketplacePath))`, and throws
  `MarketplaceManifestAbsentError` so the absence is legible to callers by TYPE rather than by
  message. `resolveMarketplaceLabels` classifies on that type into a three-member `ManifestState`.
---

## What Was Wrong

`fetchMarketplace`'s "marketplace not found" guard read

```ts
if (!(await directoryExists(path.dirname(marketplacePath)))) { ... }
```

The path it names is `.claude-plugin/marketplace.json`; the path it tested is `.claude-plugin/`.
Those are different questions, and the shape that separates them is the commonest one in this
domain: a plugin repository ships `.claude-plugin/plugin.json` and no marketplace beside it. For
every such repository the guard answered "the manifest is there", the read two statements later
threw ENOENT, and the absence surfaced as a generic failure.

That was invisible while the only caller collapsed every throw into one sentence. It stopped being
invisible the moment `resolveMarketplaceLabels` was asked to report an absent manifest apart from an
unreadable one: with the directory check, a plugin repository would have been reported to the user
as a marketplace whose manifest is present and broken — a **new** false statement introduced by a
change made to remove one.

## Fix Applied

The guard tests `fileExists(marketplacePath)` — the file it names — and throws
`MarketplaceManifestAbsentError`, a subclass so that a caller which does not care still catches an
ordinary `Error`. The existing message needed no change: it already said "The
.claude-plugin/marketplace.json file is missing from this repository", which was true of the
condition the guard was meant to detect and not of the one it detected.
`reference/features/source-fetch-and-cache.md` recorded the old behaviour explicitly and was
corrected in the same change.

## Proposed Standard

Two rules for `clean-code-standards.md`:

1. **An existence check tests the exact path its refusal names.** `directoryExists(dirname(p))` and
   `fileExists(p)` answer different questions, and a guard that names one while testing the other
   is only correct for inputs where the two happen to agree. The refusal text is the specification:
   if it says "this file is missing", the check is on the file.
2. **A caller that must distinguish two failures needs the throw to carry the distinction.** Where
   one function is the only code that can tell two conditions apart, it says which — an error
   subclass, or a discriminated result — and no caller re-derives it by matching on message text.
   A message is presentation and changes without notice; a type does not.
