---
type: missing-standard
severity: medium
affected_files:
  - .ai-docs/agent-findings/TEMPLATE.md
  - .ai-docs/agent-findings/README.md
  - scripts/check-findings-frontmatter.ts
  - scripts/check-findings-frontmatter.test.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-24
reporting_agent: codex-keeper
category: testing
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`TEMPLATE.md` tells an agent resolving a finding to add `status: resolved` and a `resolved_by:`
note that "should cite the mechanism of resolution". For the commonest resolution shape there is —
a fix that DELETED or RENAMED something — the natural note names the thing that went. That note
fails a gate, and nothing the resolving agent is pointed at says so.

`check-findings-frontmatter.ts` extracts every backticked identifier from **every** frontmatter
field (`undeclaredSymbolsIn` over `fieldsOf`, not a lifecycle-field allowlist) and asks whether the
working tree still declares it. Anything it cannot resolve lands in `repository.undeclared`, which
`check-findings-frontmatter.test.ts` compares with `toStrictEqual` against a hardcoded
`UNDECLARED_SYMBOLS_ON_DISK`. So a resolution note naming a deleted symbol reddens a repository
gate, and the only two ways out are to phrase the note without the dead name or to append to a pin
that lives in a test file — which a documentation pass is told not to edit.

Reproduced 2026-08-24 while marking
`2026-08-24-one-command-answered-the-same-count-two-ways-and-only-the-piped-half-was-wrong.md`
resolved. The first note named the four helpers the fix had removed — `countInstalledSkills`,
`countPluginSkills`, `countDistinctSkillIds`, `sumOverScopes` — and produced four entries in
`repository.undeclared` and one red suite. Rewriting the note to name `getInstallationInfo` and
`countManagedSkills`, and to describe the removed helpers as "the four counting helpers the body
names", made it green with no loss of meaning, because the body is not scanned and already names
them.

**The tension is already acknowledged in exactly one place, and it is a place no author of a note
will read.** The docblock above `FAKE_HOME_OUTLIVED` in `check-findings-frontmatter.test.ts`
argues that naming the dead names "is the note's content rather than a slip" — that "a rename note
that cannot spell the old name says nothing" — and pins both rather than editing them out. Seven of
the pinned entries are `resolved_by` and three more are `partial_note`, so this has happened at
least four times on four different findings. Every one was resolved by growing the pin, and the
rule was never written down.

Derivation:

```
grep -n 'RESOLVED_BY\|PARTIAL_NOTE' -A 1 scripts/check-findings-frontmatter.test.ts | grep undeclaredSymbol
grep -rn -i 'undeclared\|lifecycle symbol' .ai-docs/agent-findings/TEMPLATE.md .ai-docs/agent-findings/README.md
```

The second returns nothing, which is the finding: the constraint is enforced by a gate, contradicted
by a test-file docblock, and absent from both documents that instruct the person who trips it.

## Fix Applied

None to the standard — documentation pass only. The one note this pass wrote was phrased around the
constraint rather than pinned, so `UNDECLARED_SYMBOLS_ON_DISK` did not grow. Whether the general
rule is "phrase around it" or "pin it" is the open question below.

## Proposed Standard

**A resolution note describes the mechanism without naming what the mechanism removed.** Name what
EXISTS now — the surviving symbol, the module, the behaviour — and refer to the removed names
through the body, which the scan does not read and which already spells them. This is the same rule
`documentation-bible.md` -> "An Absence Names No Symbol" states for reference documents, arriving at
frontmatter, and it is why the pass that hit it recognised the shape.

Where it should go: `.ai-docs/agent-findings/TEMPLATE.md`, in the "How to resolve a finding" comment
block beside the existing `resolved_by:` bullet, since that block is what a resolving agent reads.
One sentence, plus the reason — that the scan reads frontmatter and not the body, so the body is
where a dead name belongs.

**This contradicts a docblock and the conflict should be settled rather than left.** The
`FAKE_HOME_OUTLIVED` note argues the opposite for renames specifically, and it has a point that does
not apply to deletions: a rename note genuinely does need both names to say anything, whereas a
deletion note needs only the survivor. A defensible split is to phrase around deletions always, and
to pin renames where the old name is load-bearing — but that is an owner call, not this pass's, and
it is exactly the kind of rule that should be decided once rather than per finding.

**Cross-check against CLAUDE.md.** No conflict found. This constrains how a note is worded and adds
no gate, checker or standard of its own; the "guards are not features" ruling applies, so the
`UNAUTHORED_DIRECTORIES` defect the same docblock records — the scan reading the working tree rather
than `git ls-files`, which is why it answers differently on a clean checkout — is named here as
context and is not proposed as work.
