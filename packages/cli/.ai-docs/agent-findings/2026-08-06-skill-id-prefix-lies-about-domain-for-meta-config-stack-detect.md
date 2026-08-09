---
type: audit
severity: low
affected_files:
  - packages/matrix/src/read-model/assignment-defaults.ts
  - packages/matrix/src/read-model/preload-defaults.ts
  - packages/matrix/src/read-model/sub-agents.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-06
reporting_agent: general-purpose
category: architecture
domain: shared
root_cause: convention-undocumented
status: open
---

## What Was Wrong

While building CLI-406's shared relevance resolver, a whole-catalog sweep showed
that a skill's id prefix is NOT a reliable statement of its domain:
`meta-config-stack-detect` is named `meta-` but its category is
`shared-tooling`, whose domain is `shared`. Every other skill's prefix agrees
with its catalog domain (229/229 ids are domain-prefixed; exactly this one lies
about which domain).

Anything that derives a SKILL's domain from its id prefix — the way
`agentDomainOf` in `packages/matrix/src/read-model/domains.ts` legitimately
does for AGENT ids — would route this skill under the meta rule (reach only
the flavors its preload row names; it has no row, so reach nobody) instead of
the shared rule (reach every implementation domain's agents). That is a
21-agent difference for one skill, silent until someone selects it.

## Fix Applied

The relevance resolver (`resolveAssignment` in
`packages/matrix/src/read-model/assignment-defaults.ts`) and the domain-gated
load resolution (`domainOfSkill` in `preload-defaults.ts`) both read the
catalog's category-derived `domainId`, never the id prefix. A test pins the
liar by name: `assignment-defaults.test.ts` → "places a meta-prefixed
shared-category skill by its catalog domain".

## Proposed Standard

Add to `.ai-docs/standards/typescript-types-bible.md` (or the skills-and-matrix
reference): "A skill's domain is its category's domain, never its id prefix.
The prefix is a naming convention with at least one standing exception
(`meta-config-stack-detect` → `shared-tooling`). Prefix-derivation is sanctioned
only for AGENT ids, where `agentDomainOf` is the single implementation."
