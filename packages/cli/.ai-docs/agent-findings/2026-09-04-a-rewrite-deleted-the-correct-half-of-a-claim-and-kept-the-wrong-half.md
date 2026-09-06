---
type: missing-standard
severity: high
affected_files:
  - ../skills/src/skills/web-utilities-date-fns/examples/timezone.md
  - ../skills/src/skills/web-utilities-date-fns/examples/relative.md
  - ../skills/src/skills/web-pwa-offline-first/examples/sync.md
  - ../skills/src/skills/web-accessibility-web-accessibility/examples/forms.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-09-04
reporting_agent: audit-lane (read-only, no Write grant; filed by a second agent from its material)
category: architecture
domain: web
root_cause: enforcement-gap
status: open
---

## What Was Wrong

A skill file often states one fact twice — once as prose, once as the worked example that
demonstrates it; or once as a rule, once as the markup that obeys the rule. **The compression pass
resolved a disagreement between those two halves in favour of the wrong one**: it deleted the
correct prose and kept the inverted example. What remains is a single, confident, false claim, and
it reads exactly like a finished one.

**The methodological point is that the audit this programme already runs cannot see this shape.**
The standard tool for checking a compression pass — run twice over this rewrite — is a
restore-from-baseline comparison: for each rewritten file, diff it against its pre-rewrite copy and
report content present in the baseline and absent afterwards. That audit asks exactly one question,
_did anything go?_, and this class answers it in the negative every time. The thing that went was
the **correct** half, and it went for the same reason as every other line the compression removed;
the surviving half is not reported at all, because nothing was removed from it. Only a reader
holding the survivor against a source outside the file can see the defect. The two questions have
different answers, and the second cannot be reached from the first.

**This is not the dangling-symbol class**, which two other lanes filed today —
`2026-09-04-a-skill-example-can-call-a-symbol-it-never-declares-and-nothing-opens-it` and
`2026-09-04-a-skill-example-import-was-deleted-to-genericise-it-rather-than-rewritten`. Those are
the opposite failure and are cheap to find: an identifier survives its declaration, so the example
**does not resolve**, and a free-identifier scan over a fence reports it. Here the example resolves
perfectly and says something untrue. No cross-link is asserted between this file and those two
because there is no lineage — they were found in the same programme, on the same corpus, by
different readings.

### The three instances that verify

Each was checked against the pre-rewrite baseline and against the repaired file, and the external
fact each one turns on was checked against the library's own documentation rather than against
memory. Four files were handed over; three carry the class and the fourth is discussed below. **This
is a sample from one lane's files, not a census of the corpus.**

**1. `web-utilities-date-fns/examples/timezone.md` — an inverted sign convention.** The baseline
carried both halves of the claim, and they contradicted each other. The prose said

```
// - change: Offset change in minutes (e.g., 60 for spring forward, -60 for fall back)
```

and four lines under it the annotated `tzScan` result gave `change: -60, offset: -240` for Spring
forward and `change: 60, offset: -300` for Fall back — the signs the other way round. The prose was
right: `@date-fns/tz` documents `tzScan("America/New_York", ...)` as
`[{ change: 60, offset: -240 }, { change: -60, offset: -300 }]`, spring forward first. The rewrite
kept the annotated result and dropped the sentence that contradicted it, leaving a reader with the
inverted convention and nothing beside it to disagree.

**2. `web-pwa-offline-first/examples/sync.md` — a correct sentence attached to the wrong branch.**
The baseline documented `compareVectors` with a four-line block naming all four results (`before`,
`after`, `concurrent`, `equal`). The rewrite deleted that block and wrote in its place
`// neither dominates: each side has a counter the other has not seen` — a correct description of
the **concurrent** case — directly above `if (aBeforeB && bBeforeA) return "equal";`, which is the
identical-vectors branch. Correct prose, wrong branch, and both the prose and the code read as
finished. This is the one instance where the pass created the mismatch rather than inheriting it.

**3. `web-accessibility-web-accessibility/examples/forms.md` — the same class arriving as a partial
fix.** The rewrite introduced a rule the baseline did not state: the asterisk beside a required
field takes `aria-hidden`, because `aria-required` already announces the requirement — "otherwise
the field is read as 'Email star, required'". It then applied that rule to the login-form pattern
the rule sits in, and not to the Required-field-indicators block further down the same file, which
went on carrying the baseline's `<abbr title="required" aria-label="required">*</abbr>` beside
`aria-required="true"` — the exact double announcement the new rule forbids, in the file that states
it. Nothing was deleted here, so the same audit is blind for the same reason: a rule applied to one
of its two sites is a rewrite that added content, and content added is not content missing.

### The fourth file, which does not verify as this class

`web-utilities-date-fns/examples/relative.md` was handed over as a fourth instance — prose stating
`formatRelative`'s window, an example outside that window, and the correct half deleted. **It does
not survive checking, and the reason is worth keeping.** In the baseline neither half was correct.
The prose was `// Use formatRelative for nearby dates (within a week)` with
`const RELATIVE_THRESHOLD_DAYS = 7`, and the example annotated a call seven days out as
`"Thursday at 10:00 AM"`. `formatRelative` falls back to a plain date beyond ±6 calendar days, so
the example is flatly wrong and the threshold admits by one day exactly the case its own fallback
exists to avoid. There was no correct half to preserve, and the repair had to state a fact that
neither half held. **The class needs a correct half; a file whose two halves are both wrong is an
ordinary wrong claim and any reading finds it.** It is listed in `affected_files` because it is one
of the four files this finding is written from, not because it is a third instance.

### What the evidence does and does not cover

The baseline was verified from two independent copies that agree byte for byte: the audit's own
snapshot, and the `dist/plugins/**` build in the skills repository, which predates the rewrite. The
repaired files were read directly. **The intermediate state — rewritten and not yet repaired — is
preserved nowhere.** The compression and the repair sit in one uncommitted diff, nothing is staged
in that repository, and a machine-wide search for the misplaced vector-clock comment finds only the
repaired copy. So the reading of what each file looked like between the two is the audit lane's
report rather than something re-derived here, and the finding says so rather than implying
otherwise. That is itself a fact about the class: **the second reading has to happen before the
repair lands, or the evidence for it is gone.**

## Fix Applied

None by this finding — all four files were repaired in `agents-inc/skills` before it was written,
and the repairs are not its subject. For the record of what the repaired state now asserts:
`timezone.md` carries the documented signs with the convention spelled out beside them,
`sync.md` puts the "neither dominates" sentence on the `concurrent` return and gives the `equal`
branch its own, `forms.md` hides the asterisk at both sites and cross-references the rule from the
second one, and `relative.md` states the ±6-day window, demonstrates the fallback at seven days out
and switches on `days <= 6`.

## Proposed Standard

One rule, for `.ai-docs/standards/skill-atomicity-bible.md` § 6 "Quality Gate Checklist", as a new
lens beside **Integrity** — which is where the removal-shaped checks already live ("Valuable content
relocated before deletion", "No orphaned references to removed content"), and which is precisely the
set this class walks through:

> **A rewrite pass is verified by two readings, and the second cannot be performed by the first.**
> The first diffs each rewritten file against its baseline and asks _did anything go?_ The second
> reads the rewritten file alone and asks _is what survived true?_ — holding every claim it still
> makes against a source outside the file: the library's own documentation for a value, a sign, a
> range or an API's window; the skill's own stated rule for a markup or usage pattern. A
> baseline diff cannot answer the second question, because the content it reports is the content
> that was **removed**, and the failure this reading exists for removes the correct half.
>
> **A rule and its worked example are one claim.** A pass may rewrite either; it may delete neither
> on its own, and it may fix neither on its own.
>
> The worklist is read off the pass's own diff rather than chosen: every file in which prose was
> rewritten or deleted beside a surviving fence, a fence was rewritten beside surviving prose, or a
> rule was introduced that the file demonstrates in more than one place. **Run it before the
> repairs land** — once a repair is folded into the same uncommitted diff as the rewrite, the state
> the second reading judges no longer exists anywhere.

I have checked this against `CLAUDE.md`'s NEVER/ALWAYS rules and against the bible's existing
sections, and it conflicts with none. It sits closest to § 9 "Pitfall 2: Breaking Example Logic" and
"Pitfall 6: Deleting Valuable Content Without Relocation", and is narrower than either: both of
those ask whether the surviving example still _works_, where this asks whether what it says is
_true_.

**No general checker is proposed, and the reason is the same one the sibling findings record.**
Extracting a fence and type-checking it fails on most fences by design, and no scanner can evaluate
whether a sentence about a timezone offset is correct. **One narrow scan is worth a follow-up**,
because it would have caught the third instance on its own: where a skill file states a rule in its
own prose using an attribute name, report any other site **in the same file** that matches the
rule's subject and not its prescription — an asterisk beside `aria-required` without `aria-hidden`,
in a file whose prose says the asterisk takes `aria-hidden`. That is a same-file consistency check
rather than a correctness one, which is why it is runnable at all.
