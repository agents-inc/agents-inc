---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/doctor.ts
  - src/cli/lib/__tests__/commands/doctor-content.test.ts
  - e2e/commands/doctor-content.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Code side LANDED — CLI-475 scoped the skip in doctor.ts and the nine red specs are green. What
  remains is the DOCS half: neither of the two assertion rules under "Proposed Standard" below is
  written into .ai-docs/standards/e2e/assertions.md, so nothing stops the next spec restating an
  implementation branch as its own justification.
---

## What Was Wrong

`doctor` runs a content layer and then an operational layer, and skips the whole operational layer
whenever any content row failed:

```ts
if (contentResults.some((r) => r.status === "fail")) {
  this.log(`${ROW_INDENT}${SKIP_AFTER_CONTENT_ERRORS}`);
  return [];
}
```

The reason given for the skip — an operational finding on broken content is a downstream cascade of
that content finding — is true of SOME rows and was applied to ALL of them. `No Orphans` compares
compiled agent file NAMES against the config, `Config Valid` reads `config.ts`, `Marketplace
Reachable` reports whether the marketplace loads. None of the three opens an installed skill, a
plugin registry or an agent's frontmatter, so none of them can be misled by one of those being
broken — and all three go silent anyway. Live on the owner's machine today, one skill directory
missing its `metadata.yaml` hides whether the install has orphans, whether its config is valid and
whether its marketplace can be reached.

What makes this a testing finding rather than only a product one is that **two specs asserted the
blanket behaviour, in the words of the rule rather than of the row**:

```ts
// src/cli/lib/__tests__/commands/doctor-content.test.ts — a MARKETPLACE content error
expect(stdout, "operational rows are downstream cascades of broken content").not.toContain(
  "Config Valid",
);
```

```ts
// e2e/commands/doctor-content.e2e.test.ts — a corrupt INSTALLED SKILL
expect(
  stdout,
  "operational findings on broken content are downstream cascades and must not be printed",
).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
```

Both assertion messages restate the implementation's own justification, and both name a row the
seeded error provably cannot reach: a marketplace with an invalid `metadata.yaml` says nothing
about whether `config.ts` is valid. So the specs did not merely fail to catch the over-reach — they
made removing it look like a regression, in the two files a developer would open first.

The near-identical defect one row down is the precedent for the scoping being feasible: the content
layer ALREADY gates per check, with a `readsConfig` flag on each `GatedContentCheck` and a skip
message that names the blocking finding (`Skipped — the configuration that names them cannot be
read`). The operational layer got a boolean and a blanket sentence.

## Fix Applied

At discovery, specs only — no production code touched (CLI-475 was a separate implementation task).

- Rewrote both defect-pinning assertions to the scoped rule: a content error stands down only the
  operational rows that read the content it is about.
- Added `describe("operational rows an unrelated content error must not silence")` to
  `doctor-content.test.ts`, covering the owner's exact shape (one installed skill directory with no
  `metadata.yaml`, everything else healthy), the plugin-registry case, the agent-frontmatter case
  that blocks nothing at all, the summary counts, and the config-unreadable case as the control
  where the blanket skip is still correct.
- Nine specs were red on the code as it then stood, each on its behavioural assertion.

Closed on the code side by CLI-475 (2026-08-16), which took the precedent this finding named and
applied it one row down: `GatedContentCheck` already carried `readsConfig`, and now carries
`blocks` — the operational rows whose own verdict would be that pass's finding re-worded. Two
passes name a row (`Marketplaces` and `Skills` block `Skills Resolved`, `Plugins` blocks `Plugins
Installed`), and `Agents` names none, because nothing downstream opens an agent `.md`. A blocked
row prints a sentence naming the pass that blocked it instead of the blanket notice, and is counted
in neither column of the summary. The blanket skip survives for the one finding it was always right
about — a config nobody can read, which every row is read out of — and the constant was renamed
`SKIP_AFTER_CONFIG_ERROR` to say so.

On the owner's own machine, where the finding was observed: one skill directory missing its
`metadata.yaml` used to print `Summary: 4 passed, 0 warnings, 1 error` and five suppressed rows. It
now prints eight, and among them the two findings the suppression was hiding — three agents needing
recompilation, and one skill the config declares ejected with no directory on disk.

## Proposed Standard

Two rules, both for `.ai-docs/standards/e2e/assertions.md` (they apply to the `commands` specs
equally, which that document already governs by reference):

1. **Assert the row, not the rule.** An assertion message may state what the row could not have
   known — "the config row reads config.ts and nothing the marketplace holds" — but never restate
   the implementation's gating rule as its own justification. A message of the form "X are
   downstream cascades of Y and must not be printed" is a paraphrase of the branch under test, and
   a paraphrase passes for exactly as long as the branch exists, including all the time it is
   wrong.

2. **A negative assertion names the input that makes it true.** `not.toContain("Config Valid")`
   after seeding a MARKETPLACE error is a claim about a row whose inputs the fixture never touched.
   Before asserting a row is absent, state which of its inputs the fixture broke; if the answer is
   "none of them", the assertion is pinning a blanket rule and belongs in a test that seeds an
   input that row genuinely reads.
