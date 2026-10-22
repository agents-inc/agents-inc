---
type: convention-drift
severity: low
affected_files:
  - ../skills/README.md
  - ../skills/docs/guides/commit-protocol.md
  - ../skills/package.json
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: architecture
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

The skills repository's README lists every skill by hand, per domain, and nothing compares the list
to `src/skills/`. Census on 2026-10-20 (`domain:` in each `src/skills/*/metadata.yaml` against the
README's backticked entries): the README named 157 of 238 skills. Mobile (24) and CLI (3) had no
section; Desktop listed 2 of 16, Infra 4 of 12, Meta 4 of 13, Web 71 of 84, API 48 of 56, Shared 8
of 10. AI (20 of 20) was the only complete domain. The headline count read `150+` in three places.

The same repository's docs carried claims about directories that had since gone:
`docs/guides/commit-protocol.md` listed `stacks` and `agents` commit scopes with no `src/stacks` or
`src/agents`, and said there were no build artifacts while `dist/plugins` is tracked;
`package.json` described the package as "Skills, stacks, and agents".

## Fix Applied

The README sections were completed from each skill's `displayName`, and the count became `230+`.
The false scope rows, the build-artifact sentence and the description's "stacks, and agents" were
deleted. This was a one-time repair: the list will drift again on the next skill added.

## Proposed Standard

Generate the README's catalogue from `src/skills/*/metadata.yaml`, or have
`scripts/validate-metadata.mjs` fail when a skill's `displayName` is absent from `README.md`. The
`230+` headline is one count held in three places in one file, against documentation-bible.md "A
Count Lives in Exactly One Document". A generator should own it, or it should be deleted. Not
checked against this repository's CLAUDE.md: that repository's CLAUDE.md is gitignored, and none
exists in the working tree.
