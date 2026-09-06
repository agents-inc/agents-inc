---
type: standard-gap
severity: medium
affected_files:
  - ../skills/src/skills/web-framework-angular-standalone/examples/core.md
  - ../skills/src/skills/web-framework-angular-standalone/examples/angular-19-features.md
  - ../skills/src/skills/web-framework-angular-standalone/examples/defer.md
  - ../skills/src/skills/web-framework-angular-standalone/examples/model.md
  - ../skills/src/skills/web-framework-angular-standalone/examples/rxjs.md
  - ../skills/src/skills/web-framework-angular-standalone/examples/dependency-injection.md
  - ../skills/src/skills/web-routing-react-router/examples/core.md
  - ../skills/src/skills/web-routing-react-router/examples/data-loading.md
  - ../skills/src/skills/web-routing-react-router/examples/error-handling.md
  - ../skills/src/skills/web-routing-react-router/examples/layouts.md
  - ../skills/src/skills/web-routing-react-router/reference.md
  - ../skills/src/skills/web-ui-base-ui/examples/styling.md
  - ../skills/src/skills/web-ui-base-ui/examples/state.md
  - ../skills/src/skills/web-ui-base-ui/examples/forms.md
standards_docs:
  - .ai-docs/standards/skill-atomicity-bible.md
date: 2026-09-04
reporting_agent: skill-summoner
category: architecture
domain: web
root_cause: enforcement-gap
status: open
---

## What Was Wrong

A skill is a directory whose layers state the same facts at different depths: `SKILL.md` decides,
`reference.md` looks up, `examples/` shows. Nothing in the skills repository checks that the three
still agree. Its only two gates are `prettier --check` (formatting) and
`bun scripts/validate-metadata.mjs` (`metadata.yaml` against a schema). Both pass on a skill whose
`SKILL.md` forbids exactly what its `examples/` demonstrates.

A two-pass rewrite of the 84 `web-*` skills left 38 example files in 18 skills byte-identical to
the baseline while rewriting the `SKILL.md` and `reference.md` around them. Auditing 14 of those
files found the drift is real and silent, in three shapes:

**A red flag in `SKILL.md` that an example contradicts.** `web-framework-angular-standalone`'s
`SKILL.md` says "`afterRenderEffect()` defaults to the `mixedReadWrite` phase, the one that thrashes
layout; name `earlyRead` and `write` instead" — and `examples/angular-19-features.md` used the bare
`afterRenderEffect(() => …)` form under a "Why good" heading. Angular's own docs on that API say
"You should prefer specifying an explicit phase for the effect instead, or you risk significant
performance degradation." Same skill: the `SKILL.md` says `allowSignalWrites` was removed in 19 and
the write is now permitted, while `examples/core.md` said writing a signal in an effect "causes
infinite loops or errors".

**A framing sentence in `SKILL.md` that describes content the example does not carry.** The same
`SKILL.md` advertises `examples/dependency-injection.md` as "`inject()`, `InjectionToken`, injection
options" (the file covered `optional` only), and `examples/angular-19-features.md` as the file that
"marks each one" of the version-and-experimental caveats (it marked none).

**A fact that was true when written and is not now.** `web-routing-react-router`'s `SKILL.md` says
the `react-router-dom` package "resolves to nothing" in v7; it is published throughout v7 as a
deprecated re-export and is deleted in v8. Its `examples/core.md` imported `RouterProvider` from
`react-router`, where the v7 upgrade guide directs DOM applications to `react-router/dom` — the
copy that wires up `react-dom`'s `flushSync`.

The last shape is the one that matters most for the process rather than the corpus: **both rewrite
passes were barred from research**, so a factual claim could only be preserved or reworded, never
checked. Every fact in these files had been through two editorial passes and none had been through
a source.

## Fix Applied

The 14 files in `affected_files` were corrected in place against official documentation (Angular
`angular.dev`, React Router `reactrouter.com` v7 docs, Base UI `base-ui.com`). Only the example and
reference layers were edited; the `SKILL.md` files were out of this lane's ownership and their
defects were reported back as decisions rather than changed.

That is a repair of the instances, not of the class. Nothing prevents the next rewrite from
reintroducing it, and 24 of the 38 untouched files were audited by two sibling lanes rather than
this one.

## Proposed Standard

Two rules, both for
[`.ai-docs/standards/skill-atomicity-bible.md`](../standards/skill-atomicity-bible.md).

**1. In "Skill Directory Structure", state that a skill is edited as a directory.** A change to a
`SKILL.md` pattern, red flag or resource line puts every file that pattern names in scope for the
same pass. The current standard describes what each file holds and is silent on what happens when
one moves — which reads as licence to edit one layer, because a skill whose layers disagree still
looks complete from whichever file you opened.

**2. In "SKILL.md Content Standard", require that each `**Detailed Resources:**` line be verified
against the file it names when either end changes.** That list is the skill's only inventory of its
own contents, and it is the cheapest place the drift becomes visible: three of the disagreements
above are legible from the resource line alone, without opening the example.

Neither rule is mechanically checkable as written, and this finding does not propose a checker.
The one candidate worth someone's time is narrow and would have caught the third shape: no skill
should assert that a package, export or API "does not exist" or "was removed" without a dated
source, because that is the claim class that rots silently — the code keeps working and the skill
keeps reading as correct.

Cross-checked against `CLAUDE.md`: neither rule conflicts with a NEVER/ALWAYS. Both are
documentation rules for the skills marketplace repository
([`agents-inc/skills`](https://github.com/agents-inc/skills)), whose diffs land there rather than
in this repository — `todo/skills.md` is its tracker.

The counts in this body are a **sample**, not a census: 14 files in 3 skills were audited out of 38
files in 18 skills, and the per-shape figures are from that sample.
