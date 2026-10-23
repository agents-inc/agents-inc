---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/loading/source-fetcher.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-23
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`createDetailedFetchError` in `source-fetcher.ts` decides which remedy to print by searching the
whole error message for `"404"`, `"401"`, `"403"`, `"ENOTFOUND"`, `"ETIMEDOUT"` and `"network"`.
That message is giget's or the CLI's own wording, and it contains the marketplace's URL. So a
marketplace whose host, port or path holds one of those strings gets the wrong remedy whatever it
actually answered.

Reproduction (a hand-run through the built CLI, 2026-10-23). A server answered `503` to every
request, and a project named `http://localhost:<port>/source.tar.gz`. `doctor` printed:

```
--- port 14041
    Marketplace Reachable   ✗  Failed to load marketplace
                               Repository not found: http://localhost:14041/source.tar.gz
--- port 15031
    Marketplace Reachable   ✗  Failed to load marketplace
                               Failed to fetch http://localhost:15031/source.tar.gz: Failed to download http://localhost:15031/source.tar.gz: 503 Service Unavailable
```

The same bug makes e2e specs flaky. `startTarballSourceServer` listens on a random port, so any spec
asserting a non-404 refusal text (for example the `405` leg of `doctor-diagnostics`) fails whenever
the port's digits hold `404`, `401` or `403`.

## Fix Applied

None. This was found while working on lane F5c (doctor downloads every run) and is not part of that
task. The new e2e leg asserts only `Failed to load marketplace` and the request log, so the random
port cannot redden it.

## Proposed Standard

Classify a fetch failure by its status, not by its text. `TarballWithheldError` already carries
the `Response`. giget's own error carries the status only in its message, after the URL
(`Failed to download <url>: <status> <statusText>`), so it should be matched there, anchored after
the URL, or the status should be taken from the request's response. `clean-code-standards.md`
could add one line: never match an error message that interpolates user input. No conflict with
CLAUDE.md found.
