---
type: anti-pattern
severity: medium
affected_files:
  - e2e/commands/compile-project-scope-containment.e2e.test.ts
  - e2e/commands/source-flag-is-init-only.e2e.test.ts
  - e2e/commands/config-unreadable-stops-the-guess.e2e.test.ts
  - e2e/commands/marketplace-name-refusal.e2e.test.ts
  - e2e/commands/marketplace-manifest-required.e2e.test.ts
  - e2e/commands/compile-stack-skill-installed-nowhere.e2e.test.ts
  - e2e/commands/unparseable-skill-frontmatter-is-warned.e2e.test.ts
  - e2e/commands/edit-ui-from.e2e.test.ts
  - e2e/commands/edit-from.e2e.test.ts
  - e2e/commands/init-ui.e2e.test.ts
  - e2e/commands/compile-config-types-refresh.e2e.test.ts
  - e2e/commands/doctor-content.e2e.test.ts
  - e2e/commands/doctor-corrupt-config.e2e.test.ts
  - e2e/commands/eject.e2e.test.ts
  - e2e/commands/plugin-build-versioning.e2e.test.ts
  - e2e/commands/provider-is-on-every-help-screen.e2e.test.ts
  - e2e/commands/from-prints-load-warnings.e2e.test.ts
  - e2e/commands/init-from-external-skills.e2e.test.ts
  - e2e/commands/share-from-project.e2e.test.ts
  - e2e/commands/two-installations-are-never-acted-on-silently.e2e.test.ts
  - e2e/commands/provider-arrives-on-the-command.e2e.test.ts
  - e2e/commands/claude-trust-is-read-where-claude-code-keeps-it.e2e.test.ts
  - e2e/commands/compile.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/README.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: partial
partial_note: >-
  Ten specs carry their ruling again, both standards' quotes among them, and twelve carry their
  red or measurement record again. Pending are three citations whose ruling could not be found
  (one an owner question), two red records that contradict their own spec and need re-measuring,
  and the quote check proposed below.
---

## What Was Wrong

Commit 753afca8 (a comment purge) deleted the ruling citations from `e2e/commands/` specs. The
"Spec Provenance" section in `anti-patterns.md` and `assertions.md` requires those citations, and
both standards quoted two of the deleted sentences as live examples
(`compile-project-scope-containment`, `source-flag-is-init-only`). This is the `e2e/commands/`
sibling of `2026-10-20-a-comment-purge-deleted-the-mutation-check-records-the-e2e-standard-requires-and-cites`,
which covered `e2e/lifecycle/` only. The cause is the same: the purge brief carried no keep
criteria for provenance.

Census (removed lines naming a ruling or a red/mutation check):

```
git show 753afca8 -- packages/cli/e2e/commands | awk '/^diff --git/ {f=$4} /^-/ && !/^---/ && tolower($0) ~ /ruled|ruling|red before|went red|mutation|mutated|reverted|watched it fail|goes red|reddened|owner/ {print f}' | sort -u
```

Six of its 22 files are false positives, listed in `affected_files` by omission:

- **Five match `red before`** inside "declared before", "captured before", "shared before" or
  "registered before".
- **`update` matches `owner`** inside "ownership".

`unparseable-skill-frontmatter-is-warned` is a real hit that only the `owner` term finds
(`The owner: "yes, this should be warned"`).

The same purge deleted red and measurement records, which `anti-patterns.md` ("Record in the spec
which assertion carries the red") and `README.md` (record a fixture mutation in the JSDoc) require.
The terms above miss most of them. A second census, each hit then read by hand:

```
git show 753afca8 -- packages/cli/e2e/commands | awk '/^diff --git/ {f=$4} /^-/ && !/^---/ && tolower($0) ~ /unfixed|pre-fix|before the fix|scratch|green against|red against|stayed green|was green|is green|went green|observed|measured|by hand|hand-run|mutat|revert|go red|goes red|turned red|reddens|reddened|red on|red for|carries the red/ {print f}' | sort -u
```

## Fix Applied

Each ruling was checked against the record before its citation went back in. Ten specs now carry
it again, comment-only:

- **2026-08-08 containment:** archive CLI-438 and f31bfdf4.
- **2026-08-09 `--marketplace` is init's flag:** archive CLI-466.
- **2026-08-20 unreadable config:** `git show 58ee935f`, "RULING (owner, 2026-08-20): hard error,
  and say the config is unreadable"; archive CLI-702 calls it "a standing owner ruling".
- **2026-08-20 kebab-case marketplace name:** `git show 58ee935f`, "RULING (owner, 2026-08-20)".
- **2026-08-24 `--ui` opens what `--from` names:** archive CLI-621.
- **2026-10-02, items u06, u10 and u11 plus the SKILL.md warning:**
  `git show 520afdf8:journey-issues.md`.

Red and measurement records restored, comment-only, each checked against the assertions it names
in the spec today rather than re-measured (that needs a pre-fix build):
`compile-stack-skill-installed-nowhere`, `eject` (two describes),
`provider-is-on-every-help-screen` (`FLAG_WITH_ROSTER`), `plugin-build-versioning`,
`from-prints-load-warnings`, `init-from-external-skills` (the expectation-flip record, the
hand-authored skill, and the unknown-skill negative a later pass cut),
`marketplace-manifest-required`, `share-from-project`,
`two-installations-are-never-acted-on-silently`,
`unparseable-skill-frontmatter-is-warned`, `provider-arrives-on-the-command`, and
`claude-trust-is-read-where-claude-code-keeps-it` (the Claude Code version it was watched on).
`source-revalidation`, `init-from-scenarios-curation`, `doctor-diagnostics` and
`handed-out-invocations` kept the substance and were left alone.

Not restored:

- **No ruling could be found** for `compile-config-types-refresh` (its source is audit row 4 of
  2026-10-03, a defect with no ruling), for `edit-from`'s "destructive by ruling" (the only record
  is the 2026-08-17 CLI-462 "Ratified" list, which names no owner, and its sibling decision was
  overturned by CLI-621), or for `doctor-content`'s "the ruling". Writing them back would put an
  unchecked claim into the spec. `doctor-content` pins an author/consumer split with no
  provenance at all, so it is an owner question.
- **`doctor-corrupt-config`** lost history, not provenance.
- **Two red records contradict their own spec**, so restoring them would restore a false sentence:
  - `provider-is-on-every-help-screen`'s file-level record says red "on all five" rows and green
    "on both" control rows, but `git show 7343da2e`, the commit that wrote it, already had eight
    and one.
  - `compile`'s fan-out record says the third project compile carries the red. The defect it
    describes also reddens the two assertions after the global run, which come first.

## Proposed Standard

Same as the lifecycle finding: a comment-pass brief names ruling citations and mutation records as
keep criteria. Nothing checks this today. The cheap part that could be checked is that a standard
quoting a spec's JSDoc still finds that text in the spec. A script could read each
`` `<spec>` ("<quote>") `` in `standards/e2e/` and grep the cited file for the quote, with the
comment prefixes and line wraps taken out.
