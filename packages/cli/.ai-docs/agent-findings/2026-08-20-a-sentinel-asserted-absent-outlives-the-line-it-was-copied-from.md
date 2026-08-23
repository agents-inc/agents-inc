---
type: anti-pattern
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - e2e/commands/doctor-corrupt-config.e2e.test.ts
  - src/cli/lib/configuration/config.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-20
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: premise-expired
status: resolved
resolved_by: >-
  Landed 2026-08-20 in the e2e pass. The repair diverges from the one proposed here, and the
  divergence is the point. Deleting the spec would have retired its surviving claim along with
  its dead one — this finding reasoned that "the two remaining assertions in expectFindingNaming
  already pin that the reason IS in the finding", and they do not. They pin the file path and the
  state label (DOCTOR_CONFIG_UNREADABLE, "exists but could not be loaded"); the reason is the text
  AFTER that label, and nothing asserted it. So the slot was reused rather than emptied.
  CONFIG_SOURCE_LOAD_NOISE is replaced by CONFIG_LOAD_REASON ("Failed to load config from", the
  opening of loadConfig's own reason in config-loader.ts), and the spec now asserts the state label
  and the reason as ONE joined string, so the adjacency carries the claim that the reason sits in
  the finding rather than loose between the rows. Asserted PRESENT, which is the direction this
  finding establishes as the safe one. A one-for-one swap, so STEP_TEXT stays at 178 members and
  both enumeration documents took a name change rather than a deletion; check-enumeration-drift
  and check-screen-sentinels are green. Verified by mutation — pointing the sentinel at a wrapper
  the product never prints reddens the spec on its own assertion message. The Proposed Standard
  below was NOT adopted: no rule was added to standards/e2e/assertions.md, since a standards
  change is codex-keeper's to make.
---

## What Was Wrong

`STEP_TEXT.CONFIG_SOURCE_LOAD_NOISE` in `e2e/pages/constants.ts` holds `"Failed to load project
config"`, copied verbatim out of `loadSourceConfig` in `src/cli/lib/configuration/config.ts`, and its
own comment says so. It has exactly one reader —
`doctor-corrupt-config.e2e.test.ts`'s _"carries the reason in the finding instead of printing it
beside the rows"_, which asserts `expect(stdout).not.toContain(...)`.

The 2026-08-20 unreadable-config ruling replaced that `verbose()` call with a throw. The string is
now emitted by nothing:

```
grep -rn "Failed to load project config" src e2e --include='*.ts' --include='*.tsx'
# 1 hit, and it is the constant itself
```

So the assertion cannot fail. It reads exactly as it did when it was load-bearing, it is green, and
it is green for a reason that has nothing to do with the behaviour it names — the same shape as an
arity pin over a data-loss bug, arriving from the ABSENCE direction instead.

**The class is what makes this worth a file rather than a fix note.** A sentinel duplicated from
source and asserted PRESENT dies loudly the moment the source line moves — the spec reddens. One
duplicated from source and asserted ABSENT dies silently, and goes on passing forever. The
constant's own comment anticipated exactly one half of this: _"the spec below asserts its ABSENCE,
which is the assertion that silently stops matching if the two drift apart."_ It named the hazard
and shipped no mechanism against it, which is the whole of what happened.

`scripts/check-screen-sentinels.ts` does not cover it: that checker judges the literals a page
object WAITS on, and this one is never waited on. So the one scan that reads `STEP_TEXT` against the
product cannot see the entries most able to rot.

## Fix Applied

None — discovery only, and deliberately. Retiring the constant would make the two `STEP_TEXT`
registry rows in `scripts/check-enumeration-drift.ts` report `namedButAbsent` against both documents
that enumerate it, and both were already drifted by a concurrent change to the same file. The repair
belongs with whoever reconciles those documents: delete `CONFIG_SOURCE_LOAD_NOISE`, delete the spec
that reads it, and drop the name from `standards/e2e/README.md` and
`reference/testing/e2e-infrastructure.md` in the same pass.

The spec loses nothing it still tests. Its stated subject — the loader's reason belongs to the
finding rather than to the rows — is now true by construction: no loader line exists to interleave,
and the two remaining assertions in `expectFindingNaming` already pin that the reason IS in the
finding.

## Proposed Standard

**A sentinel asserted only for its ABSENCE needs a paired assertion that it can still be produced,
or it must not be a shared constant at all.** `standards/e2e/assertions.md` is the home. Concretely:
where a spec asserts a product string is absent, some spec in the same file must assert the same
string PRESENT in the state that does emit it — the same pairing CLAUDE.md already requires for a
refusal and its allowed state, read one level down from behaviour to text. Where no such state
exists, the correct assertion is not "absent" but the positive one about what IS printed, and the
constant should be inlined into its single reader rather than promoted to `STEP_TEXT`, where it
looks like a maintained sentinel.

Cross-checked against CLAUDE.md: this extends the existing pair rule ("NEVER pin an operation as
REFUSED without pinning, in the same file, a state where the same operation is ALLOWED") rather than
conflicting with it, and it is the same failure the "NEVER encode a known gap in an assertion's
ARITY, LENGTH or ABSENCE" rule describes — that rule addresses a gap the assertion was written
around, and this one a gap that opened underneath an assertion written correctly.

The cheap mechanical half, if a checker is wanted rather than a rule: widen
`check-screen-sentinels.ts` from "literals a page object waits on" to "literals any spec matches on",
and have it report a `STEP_TEXT` member that no source file under `src/` contains. Census before
committing to it — this finding establishes one member, from one change, and is not a sweep.
