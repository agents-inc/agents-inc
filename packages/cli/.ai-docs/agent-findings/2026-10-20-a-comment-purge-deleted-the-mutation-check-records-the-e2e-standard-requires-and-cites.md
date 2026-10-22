---
type: standard-gap
severity: medium
affected_files:
  - e2e/lifecycle/install-update-source-drift.e2e.test.ts
  - e2e/lifecycle/branding-survives-config-rewrites.e2e.test.ts
  - e2e/lifecycle/claude-install-byte-identity.e2e.test.ts
  - e2e/lifecycle/mixed-marketplaces-across-scopes.e2e.test.ts
  - e2e/lifecycle/project-config-deleted-under-global-install.e2e.test.ts
  - e2e/lifecycle/project-edit-removes-project-half-of-pair.e2e.test.ts
  - e2e/lifecycle/project-only-agent-to-global-drops-project-skill.e2e.test.ts
  - e2e/lifecycle/codex-refusal-on-the-read-path.e2e.test.ts
  - e2e/lifecycle/init-plugin-marketplace-fail.e2e.test.ts
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: open
---

## What Was Wrong

`e2e/README.md` ("mutate the FIXTURE instead") and `anti-patterns.md` ("When the pre-fix binary
cannot express the defect") require a spec checked by mutating its fixture to record that in its
JSDoc, and both name `install-update-source-drift.e2e.test.ts` as the worked example.
`anti-patterns.md` ("one sentence in the file-level JSDoc naming the decision") also quotes
`project-edit-removes-project-half-of-pair.e2e.test.ts` as citing a ruling.

Commit 753afca8 ("comments say only what the code cannot") deleted those records as history. The
worked example's JSDoc no longer says how it was checked, and the quoted ruling phrase is gone.
Census of `e2e/lifecycle/` only: removed lines in that commit's diff matching mutation-checked,
went red, owner ruling, ruled or the ruling, by file:

```
git show 753afca8 -- packages/cli/e2e/lifecycle | awk '/^diff --git/ {f=$4} /^-/ && !/^---/ && tolower($0) ~ /mutation-checked|mutation was applied|watched failing|went red|turned the spec red|owner ruling|ruled correct|the ruled behaviour|the ruling/ {print f}' | sort -u
```

Nine files, listed above. `e2e/commands/` is censused in
`2026-10-20-a-comment-purge-deleted-the-ruling-citations-e2e-commands-specs-owe-and-the-standards-quote`;
the other `e2e/` directories were not checked.

The cause is that the two rules disagree and only one was in the brief. A purge brief that says
"delete dated-history comments" reaches a mutation-check record, which is history of a measurement,
and nothing in it says the e2e standard keeps that record. No gate notices either. A check for the
record is satisfied by writing the sentence, which is the defect INDEX.md records under
`2026-08-21-the-gate-that-proves-a-door-clears-a-variable-is-satisfied-by-a-comment`.

## Fix Applied

None, discovery only. The C8-e2e-lifecycle purge on 2026-10-20 kept every surviving record and
deleted no ruling citation. Restoring a deleted record means re-running its mutation first, because
re-asserting an old measurement unverified is an inherited claim (`briefing.md` rule 6).

## Proposed Standard

`e2e/README.md`, in the mutation rule: the record of how a no-change spec was mutation-checked, and
the sentence naming the deciding ruling, are kept by any comment pass, and a purge brief names them
as keep criteria. Then an owner ruling is needed: either re-run and restore the records in the files
above, or rewrite the two standards' worked examples to point at specs that still carry one. No
honest gate exists for "the record exists", for the reason given above.
