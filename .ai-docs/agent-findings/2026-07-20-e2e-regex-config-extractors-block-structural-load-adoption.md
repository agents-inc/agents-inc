---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/uninstall-reinit-lifecycle.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`uninstall-reinit-lifecycle.e2e.test.ts` declares two local regex extractors inside the
test body — `extractSkillIds` and `extractAgentNames` — which `.match()` the raw text of
a generated `config.ts` for `"id": "..."` / `"name": "..."` pairs, then map, strip and
sort the captures. This is exactly the pattern CLAUDE.md bans under "Test Assertions":
non-trivial local parsers that pick data out of generated text and would need their own
tests to be trusted.

`extractSkillIds` is also imprecise in a way a reader cannot see from the call site.
`config-writer.ts` emits the top-level `skills` array via `JSON.stringify(entry)` and the
`stack` block via `JSON.stringify(stack, null, 2)` — both produce a quoted `"id"` key. The
regex therefore captures the union of `skills[].id` AND every `stack.<agent>.<category>[].id`
entry, not the skill roster the test name implies. (`extractAgentNames` is narrower than it
looks for the opposite reason: the top-level project name is written with an UNQUOTED key,
`name: "..."`, so the quoted-key regex correctly skips it and matches only `agents[].name`.)

The imprecision is invisible because the extractor is applied to BOTH sides of the
comparison — Phase A config vs Phase C re-init config. A shared defect cancels out, so the
test being green is not evidence the extractor is right.

The correct replacement (`loadConfigOrFail(dir)` from `e2e/helpers/test-utils.ts`, landed in
this pass) exists and would yield a structural `ProjectConfig`. It could not be adopted here
without changing what the test asserts: the current assertions compare regex captures over
raw file text, whereas a structural load compares parsed config fields. Under a strictly
behaviour-preserving sweep that is an assertion change, so the extractors were deliberately
left in place.

## Fix Applied

None — discovery only. Adoption was declined because it would change the asserted values,
which the Pass 8 Cluster G sweep forbids. The surrounding `configTsPath` / `skillsPath` /
`agentsPath` and `TIMEOUTS.SETUP_DUAL` adoptions in the same file were applied.

## Proposed Standard

The existing CLAUDE.md rule ("NEVER define local parser/extractor helpers inside a test
file") is correct but does not say what to do when the extractor is already there and
removing it changes an assertion. Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the
raw-text-extractor section:

- A behaviour-preserving sweep must NOT silently retire a raw-text extractor. Retiring one
  is an assertion change and needs its own task.
- When a sweep finds an unretirable extractor, it must file a finding naming the file and
  the structural replacement (here: `loadConfigOrFail`), so the follow-up is tracked rather
  than re-discovered every pass.
- Call out the specific failure mode above: an extractor used on BOTH sides of a comparison
  hides its own bugs. Migrating this one to `loadConfigOrFail` should be expected to change
  the compared values (dropping the `stack` ids that `extractSkillIds` currently folds into
  the skill list), and that is the fix, not a regression.
