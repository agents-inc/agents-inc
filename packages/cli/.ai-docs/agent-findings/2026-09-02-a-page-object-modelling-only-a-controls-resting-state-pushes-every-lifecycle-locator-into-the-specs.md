---
type: convention-drift
severity: low
affected_files:
  - apps/editor/e2e/specs/accounts.spec.ts
  - apps/editor/e2e/specs/agent-scope.spec.ts
  - apps/editor/e2e/specs/sharing.spec.ts
  - apps/editor/e2e/pages/roster-panel.ts
standards_docs:
  - apps/editor/e2e/README.md
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-09-02
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The mechanism is closed for Save only. `RosterPanel.saveNarrating(label)` landed with EDITOR-66
  and the one new assertion uses it; the eleven existing sites were not migrated, because they sit
  in three spec files another lane owns and a migration is a diff of its own. Share has no
  equivalent method yet, and eight of the eleven are Share's.
---

## What Was Wrong

`apps/editor/e2e/README.md` states the rule in its Layout table — "`pages/` — Page and component
objects — all locators live here, never in a spec". Eleven assertions build a locator in a spec
anyway, and all eleven are the same shape:

```
grep -rn 'roster\.root\.getByRole' apps/editor/e2e/specs --include='*.ts'
```

Three spec files, and the eleven are the whole of that grep's output — `sharing.spec.ts` (5),
`accounts.spec.ts` (3), `agent-scope.spec.ts` (3). Every one reaches past the page object into its
`root` to name a button by words the page object does not know about: `"Link copied"`,
`"Sharing failed"`, `"Saving failed"`, `"Offline — try again"`, `"Out of date — reload"`,
`"Signed out — sign in"`.

**The cause is an omission in the page object rather than carelessness in the specs.**
`RosterPanel` locates the footer's three buttons by their RESTING word — `name: "Save"`,
`name: "Share"` — and both buttons narrate: their accessible name IS the outcome, because a
refused save produces no cell in the grid and a refused share produces no link, so the words are
the only feedback surface either has. The instant either button reports anything, the page
object's locator stops matching it, and a spec whose subject is an ENDING has nowhere to go but
`roster.root`. The comment on `shareButton` says as much — "Its accessible name narrates the share
lifecycle ('Share', 'Link copied', …), so specs asserting an outcome locate it by that state" —
which reads as a note about the specs and is really a description of what the object does not
offer.

**The generalisation, and it is what makes this worth filing:** a page object that models only a
control's resting state pushes every assertion about its other states into the specs. That is not
a rule anybody broke; it is a rule nobody could obey from where they were standing. The wider
class is a spec reaching into a page object's `root` for something the object does not expose:

```
grep -rnE '\.(root|dock|proposal)\.(getByRole|getByText|getByLabel|locator)\(' \
  apps/editor/e2e/specs --include='*.ts' | grep -v visual.spec.ts
```

That is a census of 28 hits across seven spec files at the date above, of which these eleven are the
narration sub-class. The rest are a mixed bag and each needs reading on its own — several are
legitimate scoped counts (`toHaveCount(0)` over a container), which is a claim about a REGION and
not a locator for an element.

**Nothing reports any of it.** The rule is one row of a table in a README; there is no lint rule,
no test and no script that reads `e2e/specs/**` for a locator construction, so the drift is
invisible until somebody reads the README and the file in the same sitting. Every previous author
here had the page object in front of them saying, in effect, "do it in the spec".

## Fix Applied

Partial, and deliberately narrow. `RosterPanel.saveNarrating(label)` was added — the Save button
under whatever words a refusal gave it, parameterised the way `skillRow(name, agentId)` and
`agentNamed(name)` already are — so the locator lives in `pages/` and the app's words stay in the
spec that expects them. That split is the file's own stated principle: "Locating is this file's
job; expecting is the spec's."

`scope-reach.spec.ts`'s new signed-in-Save assertion uses it. The eleven existing sites were left
as they are: they are in three files another lane owns, and rewriting a passing assertion to
change where its locator is built is a diff that has to be reviewed on its own terms rather than
carried in as a side effect of an unrelated row.

## Proposed Standard

Two, and they are separable.

**1. Add the rule the README's table implies, to `apps/editor/e2e/README.md` § Conventions, beside
"Locate by role":** a page object must expose every state a control can be located in, not only
its resting one. Where a control's accessible name carries its outcome, the object owes a
name-parameterised accessor for that outcome — `saveNarrating(label)` is the shape — so that the
spec supplies the words and the page object supplies the locator. The existing "Locate by role"
paragraph already establishes that the locators double as a navigability check; this is the same
argument applied to a control that changes its name.

**2. Consider a mechanical check, and consider it sceptically.** The narrow, false-positive-free
form is a scan of `e2e/specs/**` for `.root.getByRole(` / `.root.getByText(` — a spec reaching
into a page object's own root — rather than for `getByRole` at large, which appears 55 times
across fifteen spec files and is legitimate in most of them (`page.getByRole("link", …)` for
navigation, scoped `toHaveCount` assertions over a container). **A checker written against the
broad pattern would condemn more correct code than incorrect and would be turned off.** This is a
proposal rather than a recommendation: the narrow form catches 28 hits of which an unmeasured
fraction are legitimate, and nobody has triaged them. Triage first, then decide — the number that
matters is how many of the 28 survive a reading, and this finding does not have it.

Neither proposal conflicts with anything in `packages/cli/CLAUDE.md` or in
`.ai-docs/standards/e2e/page-objects.md`, which is silent on a control whose accessible name is
its state.
