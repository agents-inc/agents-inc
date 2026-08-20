---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/agent-findings/TEMPLATE.md
  - .ai-docs/agent-findings/2026-08-01-link-integrity-scan-scope-excludes-the-keys-that-dangle.md
  - .ai-docs/reference/config/config-merger.md
  - .ai-docs/reference/features/compilation-pipeline.md
  - .ai-docs/standards/e2e/anti-patterns.md
  - e2e/interactive/edit-wizard-local.e2e.test.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: open
---

## What Was Wrong

A prune removed 66 findings from `agent-findings/`. Sixty-four citations in 39 surviving files
named 31 of them, and every one of those citations broke silently. Three of the 64 lines named two
deleted findings each, so 67 name-to-file references in total.

**Where the citations lived, and why the existing checks could not see them.**

| Carrier                                           | Sites | Covered by the mandated link-integrity scan |
| ------------------------------------------------- | ----- | ------------------------------------------- |
| Body prose — markdown links and inline code spans | 51    | no                                          |
| `affected_files:`                                 | 11    | no                                          |
| `partial_note:` prose                             | 2     | no                                          |
| `supersedes:`                                     | 1     | yes                                         |

The scan `documentation-bible.md` mandates covers `supersedes:`, `superseded_by:` and
`blocked_by:`. It caught one site in 64. A prior finding already argued for widening it to
`related:` and `standards_docs:`, and stated the rule by property — any frontmatter value that is a
path must resolve on disk — which would have caught 14. The remaining 51 are body prose, which no
proposal covers and which is four times every frontmatter key combined.

**A prose citation is not a cross-link — it is often where the fact lives.** Repairing these one
at a time, the citations divided three ways:

1. **The citing sentence still needed its evidence.** The deleted file was the only place the fact
   was written down. `reference/features/code-generation.md` asserted that regenerating JSON
   schemas without first regenerating types is "not hypothetical" and cited a deleted finding for
   the instance — the shipped `metadata.schema.json` enums lagging `source-types.ts` far enough to
   reject legitimate slugs and categories. `e2e/interactive/edit-wizard-local.e2e.test.ts` carried
   a JSDoc explaining why the spec exists, and the three-surface disagreement it describes
   (`config.ts` active, Changes block says removed, compiled agent absent) was recorded only in the
   deleted file. Each was repaired by writing the fact into the citing sentence.

2. **The citation was only a cross-link** — a "see also", a `related:`-shaped entry, a `Source:`
   line under a paragraph that already carried the fact. Dropped.

3. **The citing sentence was itself false**, because it described a defect the deleted finding
   recorded and the defect is fixed. Three of these, listed below. They are the ones that matter:
   the deletion did not create them, it exposed them, and a link check that only reported dangling
   targets would have repaired the link and left the lie.

### The three false sentences

- The 2026-04-21 report of the seven unguarded key presses in `BuildStep` carried
  `partial_note: … Pending — sibling coverage gap across ~32 keypress methods in base-step.ts + 6
other step files`. That sweep landed. `base-step.ts` and all six step files now guard every key
  press with the wizard-footer wait. The residue it left has since closed too: a later sweep
  deliberately carved out the sync `void` teardown methods, because making them `async` would have
  created floating promises at every unawaited spec call site in one change, and today
  `InitWizard.abort`, `EditWizard.abort` and `DashboardSession.escape`/`ctrlC` are all `async` and
  awaited, `InitWizard.escape` is gone, and `abortAndDestroy()` is the sanctioned teardown. What
  those four await is a keystroke `delay` rather than `waitForWizardFooter` — a bare synchronous
  write races the handler the current frame registered, and a dashboard has no wizard footer to
  wait on.

- `2026-08-01-link-integrity-scan-scope-excludes-the-keys-that-dangle.md` stated that **three**
  findings carry machine-specific absolute paths beginning `/home/vince/`, naming them. Two of the
  three are now deleted, and a `grep -rl` over the directory returns several files the scan never
  named — so the count was wrong in both directions. The claim now states the property and the
  grep instead of a count.

- `2026-08-16-a-landed-defect-kept-a-second-tracker-row-and-was-redispatched-as-a-go-live-blocker.md`
  stated that "both existing findings on this defect still carry `status: open`". Both have since
  been deleted rather than re-statused, so nothing on disk claims it any more. The same pair was
  cited from `2026-08-10-a-known-gap-pinned-as-an-arity-assertion-is-invisible-to-grep.md`, whose
  paragraph was rewritten to keep what actually survives them — the standards half neither of them
  got written into `clean-code-standards.md`.

## Fix Applied

All 64 sites repaired, per the three classes above. Two structural notes:

- **One `supersedes:` key was removed and its lineage written into the body**, as TEMPLATE.md
  rule 3 requires when a target legitimately no longer exists: the referring finding was given an
  opening comment recording what the link had asserted and that its target had carried the mirrored
  `superseded_by:`.

- **Eleven `affected_files:` entries naming deleted findings were dropped.** Six of the surviving
  findings listed other findings as affected files, which is how a documentation change gets its
  own dated evidence, and is also how a frontmatter key silently accumulates unresolvable paths.

Verified: `npx prettier --check .` clean, `npx vitest run scripts/` 139 passing, `tsc -p
e2e/tsconfig.json --noEmit` clean, and a per-basename grep of all 66 deleted names over `.ai-docs`,
`src`, `e2e` and `scripts` returns zero hits outside `agent-findings/INDEX.md`, which records the
deletion by design.

## Proposed Standard

**One runnable check, in the existing `scripts/check-*.ts` family.** Every token matching
`YYYY-MM-DD-*.md` anywhere under `.ai-docs/**`, `src/**`, `e2e/**` and `scripts/**` must resolve to
a file in `agent-findings/` or `agent-suggestions/`. Two exemptions, both narrow — `INDEX.md`,
which records deletions, and `TEMPLATE.md`'s quoted specimens. Stated over the whole file rather
than over an enumerated key list, because the key list is what missed 51 of 64 sites here, and
because a body citation is where the load-bearing ones turned out to live.

**For `documentation-bible.md`, beside the citation rules:** a `reference/` or `standards/`
document cites a finding for provenance only, and rule 1 already forbids provenance in those
documents. Where a citation is doing work, the fact belongs in the sentence — a filename that
resolves today is not a durable place to keep a claim a reader needs.

**A deletion protocol, for whoever prunes next.** Grep the basename before deleting. Every hit is
either a fact to relocate first or a sentence to re-read — the three false claims above were all
found that way, and each had been readable-but-wrong for weeks with the target still on disk.
