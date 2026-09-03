---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/monorepo-layout.md
  - packages/cli/.ai-docs/reference/features/code-generation.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-09-02
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: enforcement-gap
status: partial
partial_note: >-
  The document half landed — both reference documents now describe the push hook as it is, and
  neither carries a sentence telling a reader to keep the suites out of it or to run them
  separately from each other. The standards half did not: documentation-bible.md's
  "Filling a gap includes grepping the docs for the gap's own vocabulary" still offers one census
  whose vocabulary reaches neither shape below, and standards/ is convention-keeper's directory
  rather than this agent's.
---

# A justified absence reads as an instruction, and no vocabulary census finds it

## What Was Wrong

`.husky/pre-push` had the lint, unit and e2e suites removed from it, and later got them back as
separate sequential `bunx turbo run` invocations. Two reference documents still described the hook
without them.

The self-contradiction was the harmless half — `monorepo-layout.md` said "the suites are not in
this hook" in one paragraph and "a change touching both sides runs both full suites" forty lines
below it, and a reader would have opened the hook. The live danger was that both documents carried
a **reason** for the absence, and a reason reads as an instruction:

- `monorepo-layout.md`: "Running the suites is the pusher's job now: `bun run test` and
  `bun run test:e2e` from the root, **separately**, because running the two in one turbo invocation
  reproduces the same race."
- `code-generation.md`: "**The suites left this hook on 2026-08-23** and running them is the
  pusher's job".

Both told the next agent to take the suites back OUT of the hook — which is the mechanism this
finding is about, stated exactly: **a justified absence argues for restoring the absence.** The two
quotations above say the suites are not there and give the reason; a reader who acts on the reason
removes them again. Nothing mechanically reads the hook, so those sentences were part of what stood
between the repository and that regression, and they were pointed the wrong way.

**This paragraph itself carried the error for one day**, and it is the cheapest possible
demonstration of the finding: it first said the two documents argued for _collapsing the separate
invocations into one_ — a real but different regression, contradicted by the two quotations printed
directly above it. A justified absence is easy to misread even while you are writing the finding
about how easy it is to misread.

### The bible's own instrument does not reach this shape

`documentation-bible.md` → "Filling a gap includes grepping the docs for the gap's own vocabulary"
exists for exactly this failure and offers one command. Run against the pre-repair text of both
files (`git show HEAD:<path>` into a scratch copy, 2026-09-02):

```
grep -nP 'declares no|no equivalent|is absent|is a gap|does not exist|untested|no spec|vestigial' \
  ml-old.md cg-old.md
```

Two hits, **neither of them one of the four false sentences** — one about a `tags` field, one inside
an anti-pattern table. A passive absence says "there is no X"; a justified absence says "X is not
here, and here is why", and the second shares almost no vocabulary with the first. The words that
would have found these are the words of a decision: `is a decision rather than`, `rather than an
omission`, `deliberately absent`, `deliberately omitted`, `left this hook`, `is the whole hook`.

A census over that vocabulary, run against the same pre-repair copies, returns five hits: two of the
four defect sites, plus three legitimate justified absences elsewhere in the same two files
(`generate:types` deliberately absent from CI, `generate:types:check` deliberately absent from
`ci.yml`, `source` deliberately omitted from a config write). That ratio is the point rather than a
weakness — every justified absence in the tree is worth re-reading when the thing it justifies moves,
and three of the five were correct, each because it names its cause the way the bible's "write an
absence so it dates itself" section asks.

### The wrap blind spot, which is the sharper half

The proposed census finds two of the four sites and not the third, and the reason is mechanical
rather than lexical. `.ai-docs/` markdown is Prettier-formatted with `proseWrap` at its default
`preserve`, so authors wrap by hand near 100 columns, and any multi-word phrase has a chance of
landing on the wrap point:

```
sed -n '227,228p' cg-old.md
```

```
to documentation or other root files sets neither flag and lints neither side. **The suites left
this hook on 2026-08-23** and running them is the pusher's job: the hook asked for
```

`grep -nP 'left this hook' cg-old.md` exits 1 with no output. Folding the newline first finds it:

```
tr '\n' ' ' < cg-old.md | grep -oP '.{40}left this hook.{40}'
```

This is the same hazard `agent-findings/TEMPLATE.md` records against itself — an enum value sat
wrapped across a line break "for as long as the claim did, so every grep for it returned nothing".
There it cost one unfindable value; here it means **no line-oriented phrase census over `.ai-docs/`
can be trusted to return a clean zero**, whatever its vocabulary. Every existing multi-word grep in
the bible inherits the limit.

## Fix Applied

Both documents repaired, deleting the false halves rather than reconciling them:

- `monorepo-layout.md` — the justified-absence paragraph and the closed-gap paragraph about the
  CLI's side-grep are gone. The section now states the composition (`lint` and both suites per
  side), names all five paths that set the CLI side, and states the separate-invocation rule as a
  live design decision, pointing at the hook's header for the measurement and the cost rather than
  copying either. The pre-commit section's "since 2026-08-23 it is not in the push hook either" is
  gone.
- `code-generation.md` — the pre-push table row now names the suites, "Neither row is a full-suite
  run" is deleted, the side-grep names all five paths, and "The suites left this hook on 2026-08-23"
  is replaced by a statement that each side's two suites are two invocations rather than one.

`last_validated` was left at `2026-08-30` in both: this was a partial pass, and moving the date
would report the sections nobody opened as freshly checked.

The bible was not edited — `standards/` belongs to convention-keeper.

## Proposed Standard

Two additions to `documentation-bible.md` → "An Absence Names No Symbol", both in the
"Filling a gap includes grepping the docs for the gap's own vocabulary" subsection.

**1. A second census, for the justified absence.** The existing one finds a claim that something is
missing. It does not find a claim that something is missing _for a reason_, which is the shape that
does real damage, because a stated reason is an argument for keeping the state that has already
changed:

```
grep -rPn 'is a decision rather than|rather than an omission|deliberately (absent|omitted)|left this (hook|file|command|suite)|is the whole (hook|file|thing)' .ai-docs/
```

Expect legitimate hits — a correctly-written justified absence matches too, by design. The
instruction is to re-read each one against the thing it justifies, not to remove them.

**2. State the wrap limit on every phrase census the bible carries.** A multi-word grep over
`.ai-docs/` returns a lying zero whenever the phrase happens to straddle a hand-wrapped line, and
nothing about the output says so — the same silent shape the bible already documents for ugrep's
pattern dialect, arriving from a different direction. Where a phrase census matters, fold first:

```
tr '\n' ' ' < <file> | grep -oP '.{40}<phrase>.{40}'
```

Cross-checked against `CLAUDE.md` and the bible: neither addition conflicts with an existing
NEVER/ALWAYS rule, and both are censuses rather than checkers — nothing in `scripts/` reads
`.ai-docs/` prose, so this stays a discipline. The one rule they touch is the bible's own
"prefer deleting a claim to rewriting it", which the document repair above followed.
