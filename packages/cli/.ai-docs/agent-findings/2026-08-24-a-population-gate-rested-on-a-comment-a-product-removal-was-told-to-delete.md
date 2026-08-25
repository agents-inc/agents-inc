---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/e2e/pages/constants.ts
  - packages/cli/scripts/check-finding-citations.test.ts
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-08-24
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`scripts/check-finding-citations.test.ts` holds a **population gate**: `SCOPE_POPULATIONS` asserts
that each of its three scopes — `todo/`, `packages/cli/changelogs/` and `packages/cli/e2e/` — cites
at least one finding that resolves on disk. Its purpose is stated in its own docblock: without it, a
scope that reads NOTHING reports exactly what a scope whose every citation resolves reports, so the
`it` filtering dangling citations to that scope asserts over an empty list and passes.

The gate is sound. What it rested on was not: on 2026-08-24 the entire `packages/cli/e2e` population
was **one comment**, in `e2e/pages/constants.ts`, above the `STEP_TEXT.ONLY_SKILL_IN_CATEGORY`
member — the comment naming
`2026-08-21-three-specs-pressed-space-at-a-wizard-that-refuses.md` as the reason the sentinel
existed. Reproduce the shape of the dependency:

```
grep -rn 'agent-findings/' packages/cli/e2e --include='*.ts'
```

CLI-822 deleted the product refusal that comment described, and the brief for it correctly
instructed the removal of `STEP_TEXT.ONLY_SKILL_IN_CATEGORY`. The comment went with the constant,
the scope's citation count went to zero, and `SCOPE_POPULATIONS[SPECS]` reddened — in a lane whose
brief named no documentation scope at all and whose author had no reason to look at a citation gate.

**The class, stated so it is not read as one file's problem.** A gate whose subject is "this
directory is non-empty for property P" is coupled to every deletion anywhere in that directory, and
the coupling is invisible from the deletion end. Nothing at the `constants.ts` call site said that
the comment was load-bearing. Nothing in the brief could have said so either, because the brief was
re-derived against the product surface — the comment is not a symbol, does not appear in any grep a
product brief would run, and lives in prose that reads as ordinary context.

The gate's docblock already anticipates the value moving and rules on it correctly: _"Moving it back
would mean the spec tree had stopped citing, which is worth a second look rather than a silent
edit."_ That is the right posture and it held. What it does not do is tell the person about to
delete the last citation that they are about to.

## Fix Applied

None — discovery only. The failing assertion is left red deliberately. This lane owns neither
`scripts/check-finding-citations.test.ts` nor `.ai-docs/`, and the gate's own docblock forbids
silently moving the value; the owner decision is whether `packages/cli/e2e` should acquire a real
citation (a spec whose KNOWN GAP or posture comment genuinely cites a finding) or whether the scope
has legitimately stopped citing and `SCOPE_POPULATIONS[SPECS]` should become `"cites none today"`.

The first option is the one the gate was built for: the three lifecycle specs that carried the
citation until the CLI-822 tester removed their KNOWN GAP comments are gone as citations because the
gap they pinned was retired, which is the healthy outcome rather than a regression.

## Proposed Standard

Two candidates, the second cheaper and the one to prefer.

**1. Mark the load-bearing citation at its call site.** A comment that is a gate's only subject says
so: `// Cites <finding> — this is packages/cli/e2e's only finding citation; see
scripts/check-finding-citations.test.ts SCOPE_POPULATIONS before deleting.` This works, and its
weakness is the usual one for a marker: nothing keeps it attached, and a second citation appearing
elsewhere makes it quietly false.

**2. Make the gate's failure message name what to do.** `SCOPE_POPULATIONS`'s assertion message
currently states the invariant ("a scope that read nothing reports exactly what a scope whose every
citation resolves reports"), which explains why the gate exists but not what the reader is holding.
A message that also says _"this scope's citations are prose comments, not code — a deletion
elsewhere in the directory may have taken the last one; `grep -rn 'agent-findings/' <scope>` shows
what is left"_ turns a puzzling red into a two-command diagnosis. This belongs in the assertion
itself rather than in a document, per the repository's own preference for a gate that carries its
reproduction.

Neither conflicts with CLAUDE.md. Both are compatible with the "guards are not features" ruling:
option 2 edits an existing assertion's message rather than adding a checker.

**A note for `standards/briefing.md` rather than a rule.** This is a case a brief cannot re-derive:
rule 1 tells an agent to check that its row describes the tree, and this row did. The removal was
correct, the gate's red is correct, and the two are only connected through a comment. Where a brief
instructs the deletion of a shared sentinel constant, the reachable half is that its **surrounding
prose** may be load-bearing to something the brief never names — which is worth a sentence in the
report contract's cross-lane-needs field rather than a new rule nobody can apply prospectively.

Every figure in this finding is a census over `packages/cli/e2e` at the date above, produced by the
grep quoted in the first section.
