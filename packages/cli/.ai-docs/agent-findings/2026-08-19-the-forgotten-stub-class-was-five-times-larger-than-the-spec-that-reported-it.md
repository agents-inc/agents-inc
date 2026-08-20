---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/fixtures.ts
  - apps/editor/e2e/specs/install-dialog.spec.ts
  - apps/editor/e2e/specs/skill-contents.spec.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The guard the predecessor finding proposed is installed in the page fixture of
  `apps/editor/e2e/fixtures.ts` — the three third-party origins are routed at page creation, an
  un-stubbed request is aborted and recorded, and the fixture asserts in teardown that the record
  is empty, naming the URL. Both halves are load-bearing and the fixture's own comment says so.
  Installing it reddened four tests that had been green, in two files; both files now stub the
  worker's config mint in a setup hook, with a comment naming why the call is there.
---

## What Was Wrong

The predecessor finding, since deleted, reported ONE spec reaching an un-stubbed third party —
a spec named for a skill that "cannot be read is refused", which installed no stub, hit live GitHub
and passed on the SIZE refusal, so it asserted in effect that a third party keeps a directory over
256 KB. It diagnosed that correctly and proposed a default-refuse guard as the fix for the class. **Installing that guard found four more the same
day** — all green, all reaching `http://localhost:8787/configs`, the worker route the install
dialog mints a config id from:

| File                                           | Where                                                                             | Tests |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ----: |
| `apps/editor/e2e/specs/install-dialog.spec.ts` | the `install dialog counts` describe, which had no `beforeEach` at all            |     2 |
| `apps/editor/e2e/specs/skill-contents.spec.ts` | the file's only describe, whose `beforeEach` stubbed the skill index and contents |     2 |

**One reported, five real.** That measurement is the argument, and it is the part the predecessor
could not have made: it was reasoning from the instance it happened to hit, and its own severity
and its "nothing prevents the next spec" both read as speculative until the guard counted.

**The mechanism it did not name is that a file's stub list is written for the subject the file is
named after.** Neither of the two files reads as a network test anywhere near the omission:

- In `install-dialog.spec.ts` the shape is a **sibling describe**. Three of its four describes
  install `stubCreateConfig(page)` in a `beforeEach`, and so does its one file-level test. The
  fourth is about COUNTS — an ejected-count badge and a scope group — and its author had no reason
  to think about the network while writing an assertion on a footer note. It sits between two
  describes that stub, and the difference is invisible unless the four `beforeEach` blocks are read
  against each other.
- In `skill-contents.spec.ts` there is only one describe, and its `beforeEach` stubs exactly what
  the file's subject needs: the skill index and the skill contents. Two of its ten tests open the
  install dialog for reasons that have nothing to do with contents — one to check the preview
  survives behind it, one to check `escape` closes the preview and leaves the dialog — and the mint
  those two trigger is the file's only call to the worker.

So the omission is not "somebody forgot". In both files the stubs present are exactly the ones the
file's own subject implies, and the missing one belongs to a surface the test merely passes
through. A review that reads a spec top to bottom sees a complete-looking `beforeEach` and a test
whose subject is elsewhere. **That is why this needs a structural guard rather than a review
habit** — the reader is not being careless, they are being asked to notice the absence of something
the file gives them no reason to think about.

The failure mode remains the one the predecessor named: Playwright does not block an un-routed
request, so forgetting a stub is a PASS, and a spec asserting only that some error appeared is
satisfied by the wrong one.

## Fix Applied

- `apps/editor/e2e/fixtures.ts` overrides the `page` fixture. Every third-party origin the app
  talks to — the worker and the two GitHub hosts, taken from the same fixture module `e2e/support/`
  stubs from — is routed at page creation, so a per-spec `page.route` installed later still wins and
  the fallback only ever sees what nobody claimed. An un-stubbed request is recorded and aborted,
  and after the test the fixture asserts the record is empty.
- Both halves are needed and the fixture says why: the abort keeps the bytes out, and the teardown
  assertion is what makes the omission LEGIBLE. An abort alone reaches the app as some failure or
  other, which is precisely the shape that hid the original.
- The four tests now stub the mint, each behind a comment naming the call that reaches the worker
  rather than reading as ceremony.

## Proposed Standard

The predecessor's proposal 2 stands unchanged and is still owed to
`.ai-docs/standards/documentation-bible.md`:

> A test suite's freedom from the network is a property of the SUITE, not of the tests that
> remembered. Where any test may reach a third party, the default must be refusal, and reaching out
> is what a test opts into.

What this finding adds is the evidence for preferring a mechanism over a rule, and it should travel
with the rule: **the class was five times the size of the instance that reported it, and every one
of the four extra members was in a block whose subject was something else.** A rule addressed to
authors is a request to notice an absence; the guard makes the absence the failure. There are now
two live instances of the mechanism in this repository — the unit suite's blanket worker wiring and
the e2e suite's default-refuse `page` fixture — and they are the two halves of one claim about one
workspace.

Cross-checked against `CLAUDE.md` and `.ai-docs/standards/e2e/README.md`: neither carries a rule
this contradicts. The nearest neighbour is the standing preference for asserting a specific failure
over asserting that a failure occurred, which the predecessor's proposal 3 already states and which
is what let the original instance pass on the wrong refusal.
