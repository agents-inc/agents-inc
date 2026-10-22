---
type: standard-gap
severity: medium
affected_files:
  - src/cli/utils/messages.ts
  - src/cli/base-command.ts
  - src/cli/commands/search.ts
  - src/cli/lib/seed/read-piped-payload.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The skip warnings now strip each payload key (messages.ts, pinned in messages.test.ts). Still
  open: clean-code-standards.md 5.8 says three chokepoints carry the sanitiser and no new site
  sanitises for itself, and four production sites strip for themselves.
---

## What Was Wrong

`skippedUnknownSkills` and `skippedUnknownAgents` print skill and sub-agent keys a payload named and
no catalogue knows. `seedPayloadSchema` accepts any string key, so `init --from` and `edit --from`
printed OSC and CSI sequences from a shared configuration (title set, screen cleared). The same
change had added `stripTerminalControls` to `reportValidationErrors`, whose messages quote catalogue
ids only, so no payload reaches it.

## Fix Applied

Both message functions strip each key they print. A control-free key prints word for word, and the
existing specs pin that.

## Proposed Standard

`clean-code-standards.md` 5.8 says "Three chokepoints carry it and nothing renders foreign text past
them … A new site reaches one of those three rather than sanitising for itself". This census finds
four files outside the three chokepoints that strip for themselves:
`grep -rln 'stripTerminalControls' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
lists seven, and less `utils/string.ts`, `utils/errors.ts` and `lib/schema-validator.ts` it leaves
`base-command.ts`, `commands/search.ts`, `lib/seed/read-piped-payload.ts` and `utils/messages.ts`. Either name the class of site allowed to
strip directly (an untruncated id or key that came off the wire), or route the sites through a
fourth chokepoint. A list of where foreign text enters also beats a list of chokepoints: payload
keys are the entry this one missed.
