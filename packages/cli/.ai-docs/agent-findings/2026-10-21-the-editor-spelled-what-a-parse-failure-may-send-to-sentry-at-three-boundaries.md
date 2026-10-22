---
type: anti-pattern
severity: low
affected_files:
  - apps/editor/src/lib/observability/report.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/stores/marketplace-store.ts
  - apps/editor/src/lib/api/catalog.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: dry
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  `reportableIssues` in apps/editor/src/lib/observability/report.ts is the one spelling; the
  config store's `merge`, `readSavedMarketplaces` and catalog.ts's `issuesOf.reported` call it.
---

## What Was Wrong

What a failed parse may send to the reporter (the first path segment and the zod code, never a
value or a deeper path, because past the first segment a path is a catalogue id, a repository the
visitor named, or a name a private org chose) was written out inline at every boundary that
reports one. Census, run before the change over non-test source:

```
grep -rn 'issue.path\[0\]\|"(root)"' apps/editor/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.ts'
```

It returned the inline map in `stores/config-store.ts` (`merge`), the same map in
`stores/marketplace-store.ts` (`readSavedMarketplaces`), `firstSegment` in `lib/api/catalog.ts`, and
catalog.ts's `wholePath`, which is the display spelling and correctly different. That is three
copies of a privacy rule, each with its own comment, and catalog.ts held the reportable form and
the whole-path form side by side. A new persisted slot copying the nearest copy could pick up the
whole-path form, and nothing would fail.

## Fix Applied

`reportableIssues(failure)` in `lib/observability/report.ts`, beside `reportIssue`. All three sites
call it. The same census now returns `report.ts` and catalog.ts's `wholePath` only. The pins are
unchanged: `config-store.test.ts`, `marketplace-store.test.ts` and `catalog.test.ts` each assert
`"(root): invalid_type"` in the reported `issues`.

## Proposed Standard

An editor boundary that reports a parse failure passes the error to `reportableIssues` and never
maps `issues` inline. No CLAUDE.md rule conflicts. There is no honest gate for this: a grep for
`issues.map` cannot tell a reported list from a displayed one, and catalog.ts's `shown` is a
legitimate whole-path map.
