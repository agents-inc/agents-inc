---
type: missing-standard
severity: low
affected_files:
  - ../skills/src/skills/web-i18n-next-intl/SKILL.md
  - ../skills/src/skills/web-i18n-next-intl/reference.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-10-20
reporting_agent: skill-summoner
category: testing
domain: infra
root_cause: missing-rule
status: open
---

## What Was Wrong

A fix to the next-intl skill said that `t()` on a message containing tags reports `FORMATTING_ERROR`
and renders `namespace.key`. That holds only in development. use-intl 4.14.9 ships two builds
through `exports` conditions: `development` maps to `dist/esm/development` and `default` to
`dist/esm/production`. `getPlainMessage` compiles a message containing `<` or `{` only under
`process.env.NODE_ENV !== 'production'`. The production build's version is
`return e||/'[{}<#|']/.test(t)?void 0:t`, so a tagged message called without values comes back
as raw text, tags and all. With values, both builds compile it, intl-messageformat throws
`MissingValueError`, and the translator reports `FORMATTING_ERROR`. Every source the fix cited (the
library's tests and its error path) runs in development, so all of them agreed, and the claim was
wrong for the build users ship.

Nothing in the authoring rules mentions build conditions. The skill-summoner playbook asks for the
library's documentation "at the version the project actually depends on". The atomicity bible
asks that examples "compile conceptually". Neither tells an author that a library can behave
differently by `NODE_ENV`.

## Fix Applied

SKILL.md's red flag and the reference.md prose now state both cases. The reference.md WRONG-block
comment that repeated the claim was deleted. This was checked by reading both installed builds of
use-intl 4.14.9 and upstream `compile-format.tsx`, and the reviewer's probe output matches.

## Proposed Standard

Add to skill-atomicity-bible.md, beside "Examples must compile conceptually": a claim about what a
library does at runtime (an error, a fallback, a returned value) is checked against the build
selected by the `default` export condition. Where the package's `exports` declare a `development`
condition, it is also checked against that build, and the skill states both outcomes when they
differ. The check is a probe run once with `node` and once with `node --conditions=development`.
This was not checked against the skills repository's CLAUDE.md, because none exists in the working
tree.
