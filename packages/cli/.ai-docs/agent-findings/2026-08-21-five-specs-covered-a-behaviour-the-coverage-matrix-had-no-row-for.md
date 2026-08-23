---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/e2e/user-journeys.md
  - e2e/commands/doctor-corrupt-config.e2e.test.ts
  - e2e/commands/edit-corrupt-config.e2e.test.ts
  - e2e/commands/compile-corrupt-config.e2e.test.ts
  - e2e/commands/uninstall-corrupt-config.e2e.test.ts
  - e2e/commands/doctor-blind-spots.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Journey 38 added to user-journeys.md, naming the five orphaned specs, splitting the two readers
  of the file, and marking the source-config reader's legs against the new
  config-unreadable-stops-the-guess spec. The orphan check itself is proposed rather than
  implemented and is named in the body.
---

## What Was Wrong

`user-journeys.md` opens with a rule about itself: _"Every spec the `e2e` project collects belongs
to a journey on this page, bar those whose subject is the harness itself and which are named
below."_ Five did not, and they are not harness specs — they are the whole of the suite's coverage
of a configuration that exists and cannot be read:

```
for f in doctor-corrupt-config edit-corrupt-config compile-corrupt-config \
         uninstall-corrupt-config doctor-blind-spots; do
  printf '%-28s ' "$f"; grep -c "$f" .ai-docs/standards/e2e/user-journeys.md
done
```

All five answer `0`. Journey 14 is the nearest row and is a different subject — a config the user
DELETED, which the CLI must recover from. A config that is present and unreadable is the opposite
state, and `doctor` splits the two in its own output precisely because conflating them once sent a
reader to a command that refused the file `doctor` had called missing.

**The cost is not that a reader cannot find the specs. It is that no one was ever asked the
coverage question about them**, and the 2026-08-20 unreadable-config ruling is where that came due.
That ruling changed the SECOND reader of `.claude-src/config.ts` — `loadSourceConfig` in
`lib/configuration/config.ts`, the settings reader, as distinct from `loadProjectConfigFromDir`,
which the four `*-corrupt-config` specs drive through `BaseCommand.ensureConfigReadable`. The
commands the settings reader is reached from (`search`, `eject`, `list`, `build`) never touch that
guard, so none of the five specs covers a single line the ruling changed, and the page had no row
whose surfaces anyone would have re-judged. A row with the wrong marker sends the next reader to
write a duplicate; a behaviour with no row sends them nowhere at all, and nothing distinguishes
that from a behaviour nobody has yet had.

**And the page is not unchecked — which is what makes the gap worth writing up rather than just
closing.** `src/cli/lib/__tests__/spec-gates.test.ts` reads `user-journeys.md` through
`helpers/journey-page.ts` and holds it to three rules: every spec a row NAMES resolves to a real
file, every name carries the directory it lives in, and a row whose named specs all open from a
fixture is marked `TO TEST` rather than `PARTIAL`. All three run row → spec. **None runs spec →
row**, so a file no row mentions is in no gate's domain: the two pairing gates beside them ask only
whether a file RUNS, and the three journey gates ask only about files a row already points at. A
spec with no row is the one shape every existing check is blind to by construction.

That the third gate exists is also why this finding is filed as resolved rather than as a
discovery: writing the new rows immediately turned it red, because two of them named only
fixture-opened specs and were marked `PARTIAL`. A gate that corrects a row the moment it is written
is exactly the mechanism the orphan direction lacks.

## Fix Applied

Journey 38 added to `user-journeys.md`, naming all five specs and splitting the row by which reader
of the file each leg exercises — because that split is the thing the absence of a row hid. Its
four-surface verdict is judged per leg rather than as a union of the file's own optimism, and the
one leg the pass closed (the settings reader, through `search` and `eject`) is named against
`commands/config-unreadable-stops-the-guess`, written and mutation-checked in the same pass.

## Proposed Standard

**A spec file with no journey is a coverage question nobody has been asked, and the page's own
rule is the only thing that says so — which makes it exactly the kind of rule that needs a
runnable check.** The rule is already written and already precise; what it lacks is the one-line
scan that would report a violation, and the five files above sat outside it long enough for a
ruling to land on their subject.

The check is cheap because both halves are already in that file: `readSpecNames(E2E_ROOT)` walks
the tree and `readJourneyRows` resolves what each row names, so the reverse index is a set
difference over two collections already in hand. Glob `e2e/**/*.e2e.test.ts`, subtract the harness
specs the page names by hand, and require every remaining path to be named by some row. Its home is
`src/cli/lib/__tests__/spec-gates.test.ts`, beside the three gates that already read this page from
the other direction.

Two properties it needs, both learned from the gates this repository already has. The harness
exemption must be a ROSTER in the test with a reason per entry rather than a glob, or a new file
under `e2e/smoke/` inherits the exemption silently. And it must report the DIRECTION — a spec with
no row, not a row with no spec — because the reverse case is legitimate: a row may name a spec that
is `TO TEST`, and a check that conflated the two would have to be weakened until it saw neither.

**It cannot be dropped in as-is, and the number is why.** Run over the tree on 2026-08-21 — 235
files matching `e2e/**/*.e2e.test.ts`, each looked for in `user-journeys.md` by path and by
basename — **144 are named by no row**, which is 61% of the suite. That is a census of the naive
scan and a SAMPLE of the real gap: many of the 144 are legitimate variants of a journey that is
covered, and naming them in the row they belong to is all they need. But it means the check lands
red at a scale no single pass can absorb, so it wants introducing the way a large lint rule is:
implement the scan, roster today's 144 as a declared backlog with the gate refusing any ADDITION
to it, and let each subsequent pass move files out of the roster into the rows they belong to. A
gate that starts by demanding 144 rows will be deleted; a gate that stops the 145th will not.

The corrupt-config family is worth doing first regardless of the roster, and is done: it is the
case where the missing row cost something rather than merely reading untidily.

Cross-checked against `CLAUDE.md`: this adds a gate rather than a feature, which the
"Guards Are Not Features" ruling puts in scope for a fixes-only pass, and it introduces no new
pattern — `page-object-space-presses.test.ts` and `failure-reporting-classification.test.ts` are
the same shape, a roster held against a scan of the tree.

Both counts above say which they are. The five-file census is exhaustive for the corrupt-config
family, which is this finding's own subject. The 144 is a census of what a path-and-basename scan
finds and a sample of the real orphan set, for the reason given beside it — a row can describe a
spec it does not name, and a named spec can still belong to the wrong row.
