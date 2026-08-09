---
type: anti-pattern
severity: medium
affected_files:
  - e2e/interactive/edit-wizard-local.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code side landed — the assertion in edit-wizard-local.e2e.test.ts is now anchored to its own
  row and was observed to bite. The standards side is pending: no rule in assertions.md or
  anti-patterns.md yet says that a fragment asserted on a stream carrying both a warning and a
  summary must be anchored to the line it claims to be about.
---

## What Was Wrong

`edit-wizard-local.e2e.test.ts` claimed to pin the reason `edit` gives for removing an entry it
could not resolve:

```ts
expect(rawOutput, "the removal of an unresolvable skill must say why it went").toContain(
  "not present in",
);
```

That assertion never read the Changes block. The same run prints, on the way in, the wizard
store's own warning about the same skill:

```
Warning: Installed skill 'web-styling-tailwind' is not present in the loaded source — it may
have been removed or renamed
```

`rawOutput` is append-only, so both lines are in it, and the fragment matches the warning. The
proof: CLI-456 changed the reason on that removal row from `not present in <source>` to
`skill files no longer exist at <path>` — the exact string the assertion existed to pin — and
the spec stayed green. It had been passing on a line written by a different module, for a
different purpose, six steps earlier in the run.

This is the second trap in the suite's own "absence is hard to assert" family, arriving from the
positive direction: the fragment is real, the subject is real, and they are not the same line.
The existing rules cover negatives (`not.toContain` matching scrollback) and diff-shape
collections (`arrayContaining` tolerating extra rows). Neither covers a POSITIVE `toContain` on a
stream that carries two sentences about one skill.

## Fix Applied

Anchored the assertion to the row it is about — the removal marker, the skill, its scope tag, and
the opening paren the reason sits inside:

```ts
expect(rawOutput, "the removal of an unresolvable skill must say why it went").toContain(
  `${REMOVED_MARKER} web-styling-tailwind [P] (${STEP_TEXT.REMOVED_REASON_FILES_GONE}`,
);
```

The prefix `- <id> [P] (` cannot appear in a `warn()` line, so the assertion can now only be
satisfied by the Changes block. The three reason strings moved into `STEP_TEXT` as
`REMOVED_REASON_NOT_IN_SOURCE` / `REMOVED_REASON_FILES_GONE` / `REMOVED_REASON_NOT_INSTALLED`,
so a spec asserting one of them cannot spell it a fourth way.

The two new specs written for CLI-456 use the same anchored form, and both were observed red
against the unfixed binary — the local one on this exact substitution.

## Proposed Standard

In `.ai-docs/standards/e2e/assertions.md`, beside the negative-assertion rules:

> **A fragment is not a line.** When the captured stream carries more than one sentence about the
> same subject — a `warn()` on the way in and a summary row on the way out are the common pair —
> a bare `toContain("<fragment>")` pins whichever of them happens to contain it, which is not
> necessarily the one the test names. Anchor the assertion to something only the intended line
> carries: its marker, its scope tag, the punctuation the value sits inside. `edit` prints
> "is not present in the loaded source" (store warning) and "(not present in <source>)" (Changes
> row) about one skill in one run; a spec asserting `"not present in"` pins neither on purpose.

Worth a matching line in `anti-patterns.md` § Weak Assertions, since that is where a reader looking
for "my assertion is too loose" arrives first.
