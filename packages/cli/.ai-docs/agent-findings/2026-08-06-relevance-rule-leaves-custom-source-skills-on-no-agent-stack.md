---
type: audit
severity: medium
affected_files:
  - packages/cli/src/cli/lib/configuration/config-generator.ts
  - packages/matrix/src/read-model/assignment-defaults.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-06
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: open
---

## What Was Wrong

Nothing broken — a consequence of the CLI-406 owner rulings, recorded so the
already-queued custom-skill investigation inherits it rather than rediscovering
it.

`resolveAssignment` answers "empty" for any id the generated catalog does not
carry, per the owner's 2026-08-06 confirmation ("custom skills shouldn't be
added anywhere yet"). On the CLI this reaches further than GitHub-added ids:
a CUSTOM SOURCE'S skills — real skills with real categories in the merged
matrix, whose ids simply are not in the built-in union — now land on **no
agent's stack** as new derived triples. `config-generator.test.ts` pins it
("assigns a skill outside the catalog to no agent"): before CLI-406 such a
skill landed lazily on every scope-compatible agent; now it lands nowhere.

Two paths still carry custom skills onto agents, both explicit-tier:

- prior `config.ts` stack entries survive verbatim (D-220 preservation), and
- a source's authored stack YAML overlays as `existingStack`, so its triples
  count as prior — the e2e suite's own E2E source works exactly this way
  (`e2e/helpers/create-e2e-source.ts` assigns its meta skills through the
  stack YAML, and those rows ride through the relevance filter untouched).

But a scratch init against a custom source with no stack YAML produces a
config whose agents compile with none of that source's skills, silently.

## Fix Applied

None — discovery only. The behavior is the ruling as specified; the seed
(`--from`) path was verified to pass `assignedStack` through unfiltered
(explicit tier), so shared configurations are unaffected.

## Proposed Standard

When the "wider custom-skill re-enable question" investigation runs (named in
todo/cli.md under CLI-406), it should decide whether a custom source's own
matrix domain can stand in for catalog relevance — e.g. resolve targeting from
the MERGED matrix's category→domain data instead of only the vendored catalog —
or whether custom sources are expected to author stack YAML. Until then,
`.ai-docs/reference/features/configuration.md` should state that non-catalog
skills join stacks only through explicit assignment (prior entries, stack YAML,
or a seed payload).
