---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/e2e/specs/external-skills.spec.ts
  - apps/editor/e2e/fixtures.ts
  - apps/editor/vitest.config.ts
  - apps/editor/e2e/support/skill-contents.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: web-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The one offending test was fixed in place on 2026-08-18 while landing EDITOR-46 — it now installs
  `stubSkillContents(page)` and refuses on the stub's 404, which is what its own comment always
  claimed. Pending - nothing stops the next one. The editor's e2e suite still has no equivalent of
  the unit suite's blanket network guard, so a spec that forgets a stub is green and silent rather
  than red. The Proposed Standard below names the guard and where it goes.
---

## What Was Wrong

`apps/editor/e2e/specs/external-skills.spec.ts` → "a directory that cannot be read is refused
rather than added" installed no content stub at all. Its sibling tests in the same `describe` each
call `stubSkillContents(page)` or `stubSkillContentsUnreachable(page)` on their first line; this one
did not, and Playwright does not block un-routed requests. So the browser resolved the staged
skill's directory against the **live** `api.github.com` and `raw.githubusercontent.com`.

It passed anyway, and the reason it passed is the finding. The skill it staged was
`anthropics/skills` → `skills/docx`, which really is about 1.1 MB. The dialog's error line duly
appeared — but it was the **size** refusal from a live listing, not the "cannot be read" refusal the
test names, describes in its comment and exists to cover. The assertion was only
`expect(dialog.error).toBeVisible()`, which cannot tell the two apart.

So the test asserted, in effect: _a third party continues to keep this directory over 256 KB._ Three
things follow from that, and each is worse than the last:

1. **It tested the wrong thing.** The "cannot be read" path — a repository the stub does not serve —
   was never exercised. A regression in `unreadable` handling would not have failed it.
2. **It was one upstream commit from breaking.** Nothing in this repository controls that
   directory's size, and nothing here would explain the failure to whoever hit it.
3. **It made the suite non-hermetic and slower**, in a suite whose sibling unit runner takes the
   opposite position explicitly.

**How it surfaced.** Not by inspection. EDITOR-46 gave the skill index a per-entry weight and made
the add-skills dialog refuse an oversized row before staging, which meant `docx` could no longer be
staged and this test had to point at a different skill. Pointed at a small one, it failed — by
_adding_ the skill, with no error at all, which is only possible if real bytes arrived over the
network. The mechanism was invisible for as long as the accidental substitute assertion held.

**Why this is an enforcement gap rather than an oversight.** The rule already exists on the other
side of the same workspace, and is stated more sharply than most rules in this repository.
`apps/editor/vitest.config.ts` wires MSW into _every_ file in the unit suite and says why:

> Every file in this suite gets the mocked worker, not only the ones that call it: the guarantee
> worth having is that none of them reach the network, and that is only a guarantee if it holds
> where nobody thought to ask.

That is exactly this defect, named in advance, by the same workspace, about the same guarantee — and
the e2e suite has no such setup. `e2e/fixtures.ts` extends the base `test` with a single `configure`
fixture and installs no default routing. Every stub in `e2e/support/` is opt-in per spec, so
"forgot to stub" and "deliberately unstubbed" are indistinguishable from the outside, and the
failure mode of forgetting is a _pass_.

## Fix Applied

The single offending test now installs the stub, and its comment records why the line is there
rather than reading as ceremony:

- `stubSkillContents(page)` added, so the tree call 404s for `anthropics/skills` the way GitHub does
  for a repository the stub does not serve — which is what the test's own comment always claimed was
  happening.
- The spec's `UNSTUBBED_SKILL` now names an index entry that is _within_ the per-skill cap, so the
  refusal it reaches can only be `unreadable`. Under EDITOR-46 an oversized entry is refused on the
  search row before it can be staged, so the old target could not reach this path at all.

Verified: the test passes against the stub, and the whole editor e2e suite (296 tests) is green.

**Not fixed: the class.** Nothing prevents the next spec from forgetting a stub, and the same
silent-pass mechanism is available to any of them.

## Proposed Standard

**1. Give the e2e suite the guard the unit suite already has.** The mechanism belongs in
`apps/editor/e2e/fixtures.ts`, in the `page` fixture, and it is a few lines: route `**/*` for the
third-party origins the app talks to — `api.github.com` and `raw.githubusercontent.com`, plus the
worker origin — and **fail** rather than fulfil when nothing more specific has claimed the request.
Playwright's later `page.route` calls take precedence over earlier ones, so a per-spec stub
installed afterwards still wins; the fallback only catches what nobody stubbed.

The failure has to be loud. Aborting quietly reproduces the same problem in a new shape — a spec
that never noticed it was offline. A route handler that throws, or fulfils with a body naming the
un-stubbed URL, turns "forgot a stub" from a pass into a legible red.

**2. State the rule where both suites can see it.** The unit-side reasoning is currently a comment
inside one workspace's `vitest.config.ts`, which is why it never reached the e2e suite two
directories away. It generalises with no loss:

> A test suite's freedom from the network is a property of the suite, not of the tests that
> remembered. Where any test may reach a third party, the default must be refusal, and reaching out
> must be the thing a test opts into.

This belongs in `standards/documentation-bible.md` beside the existing guidance on shared test
fixtures, and it is the same argument the `vitest.config.ts` comment already makes — it only needs
lifting out of one file's comment into a rule both runners are held to.

**3. A checkable corollary, cheap enough to be worth stating.** An assertion that a failure occurred
should say _which_ failure. `expect(dialog.error).toBeVisible()` passes for any of four reasons, and
the one it was written for was not the one supplying it. The dialog's failure kinds are a discriminated
union (`unreadable | too-large | not-text | unreachable`) with distinct wording, so the assertion
could always have been `toContainText`. Where a UI has several ways to say no, a test that only
checks that it said no is one upstream change away from testing nothing — and this suite already
knows that, because the sibling test two lines below asserts `toContainText(/try again/i)` precisely
to pin `unreachable` apart from the rest.
