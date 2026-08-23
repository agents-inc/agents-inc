---
type: anti-pattern
severity: medium
affected_files:
  - apps/server/src/index.ts
  - apps/editor/src/lib/api/configs.ts
  - apps/editor/src/features/configure/lib/use-share-link.ts
  - apps/editor/src/features/configure/components/roster-panel.tsx
  - apps/editor/src/features/configure/lib/use-install-command.ts
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
  - .ai-docs/standards/briefing.md
  - docs/web/editor-spec.md
date: 2026-08-21
reporting_agent: general-purpose
category: architecture
domain: api
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The direction reversed on 2026-08-21 and this note records the new one: the
  CODE is complete and the STANDARD is half-written. Every half landed —
  the worker answers a payload naming another seed version with 409 rather than
  the 400 a malformed body gets, `createSharedConfig` classifies that into one
  of three refusals, and `useShareLink` and `useInstallCommand` each own a
  narration table keyed by the ending. Both now reach a screen: the Share button
  renders the hook's label and the install dialog renders the hook's note, each
  with a leg per refusal in its own spec, and no label table survives beside
  either markup. Proposed Standard 1 landed as the seed contract's "A wrong `v`
  on the write side is 409, not 400" section. What is PENDING is the other two,
  neither of which is written anywhere: Standard 2, that a result type carrying
  a user-facing message must have a renderer, in the editor spec; and Standard
  3, that a row filed partial is re-dispatched with the pending file inside the
  new lane's list, in the briefing contract.
---

## What Was Wrong

A share from the editor answered `POST https://api.agentsinc.sh/configs 400`, and the app said
nothing a person could use. The reason it reached the tracker as a screenshot of a browser console
is the finding: **two separate collapses, each defensible on its own, composed into a state that
fails forever and reads exactly like a blip.**

**Collapse one, on the wire.** `v: z.literal(SEED_VERSION)` is an exact match by design —
discard-don't-migrate, so a stale id fails loudly rather than being guessed at. That reasoning was
written for READING an id and was silently inherited by WRITING one, and the two have different
writers. A reader is a CLI run someone started a second ago. A writer is a browser tab that may have
been open since before the last deploy: it mints the version it was BUILT with, its own bundled
schema accepts that, and the deployed worker refuses it — on that click and on every click after
it, until the page is reloaded. The worker spent one status, `400`, on that and on a genuinely
malformed body, so the one refusal a person can act on was spelled the same as the one nobody can.

**Collapse two, in the app.** `useShareLink` mapped every ending to the word `failed` on a button
that decays to idle after two seconds. A version mismatch, a KV outage, an offline laptop and a
refused clipboard write were one word between them. The clipboard branch was worse than
undifferentiated — it was untrue: its own comment read _"the config is stored; only the copy was
refused"_ while it set the same `failed` the share-never-happened path sets, and the minted id was
then unrecoverable from the UI.

**What makes this a class rather than one bug.** `apps/editor/src/lib/api/` holds four modules, and
they distinguish 7, 10, 15 and 4 failure branches respectively (`grep -c "ok: false"` over
`catalog.ts`, `configs.ts`, `skill-contents.ts`, `skill-index.ts`). Three of the four have a
renderer for the message they compose: `catalog.ts`'s reaches `<Note>{state.error}</Note>` in
`marketplace-dialog.tsx`, and `configs.ts`'s own `fetchSharedConfig` reaches `refusedNotice` in
`use-catalog-first.ts`. **The one failure string in that layer with no renderer anywhere was
`createSharedConfig`'s** — it was composed, returned, and dropped on the floor by both of its
callers. Nothing failed, nothing warned, and the surface that was meant to carry it narrated the
coarse state instead.

## Fix Applied

All five halves, all under `SERVER-04`. The first three landed on the dispatches this finding
was filed from; the last two landed later the same day, once a lane owned the files.

1. **`apps/server/src/index.ts`** — `namesAnotherSeedVersion` is true when the body's validation
   error carries an issue on path `["v"]`; `z.literal` spends one issue on an older version, a newer
   one and a missing `v` alike, so one predicate covers every way a payload can be addressed to
   another contract. `refuseAnotherSeedVersion` is the POST's validation hook: it answers `409` with
   a body naming the reload for that case and returns nothing otherwise, which hands the request
   back to the validator's own `400`. **It only ever narrows** — a body malformed at the current
   version answers exactly as it did before. No schema moved.
2. **`apps/editor/src/lib/api/configs.ts`** — `ShareResult`'s failure is now
   `{ ok: false; refusal: ShareRefusal }` where `ShareRefusal` is
   `"out-of-date" | "refused" | "unreachable"`. The user-facing string is gone from this layer
   rather than left unrendered: the client classifies and the UI narrates. `out-of-date` is reported
   to the issue sink under its own name, because a stale-tab count spikes after a release and decays
   on its own, which is nothing like the shape of an outage.
3. **`apps/editor/src/features/configure/lib/use-share-link.ts`** — `SHARE_NARRATIONS` is a
   `Record<ShareOutcome, ShareNarration>` over `ShareRefusal | "copied" | "copy-refused"`, so an
   ending added without words of its own is a type error rather than a blank button. Each narration
   carries whether it decays: the out-of-date instruction does not, because nothing about the tab
   improves while the user looks away from it. `copy-refused` is a member rather than a fold into
   `refused`, which is the half that used to be untrue.
4. **`apps/editor/src/features/configure/components/roster-panel.tsx`** — the panel's own
   `Record<ShareState, string>` table is gone and the button renders the hook's `label`, so the
   words `useShareLink` computes are the words on screen. `ShareState` stopped being exported with
   it: once the table beside the markup was deleted, nothing outside the hook had a reason to name
   the coarse state.
5. **`apps/editor/src/features/configure/lib/use-install-command.ts`** — the second door, which
   mints an id when the install dialog opens and used to fall back to a bare `npx agents-inc init`
   on any failure with no reason anywhere. `COMMAND_NOTES` is a `Record<InstallNote, string>` over
   the same three refusals plus the states that are not endings, and the line under the command
   renders it. It lives beside the hook for the reason the Share button's does: a table at the
   render site can only see the coarse status, which is how three refusals came to share one
   sentence here too.

## Verified, and now on screen

The row was dispatched twice before either rendering half could move — each lane held a file list
drawn from the ROW's subject rather than from this finding's pending list, so both stopped at
exactly the same line, correctly. What those passes added is evidence rather than code:

- **The three landed halves are real, not just green.** Each was made red on purpose and restored.
  Dropping the validation hook from the POST's registration reddens the three 409 cases; widening it
  to fire on every failure reddens the three 400 controls beside them, which is the half that proves
  it only narrows. Mapping 409 to `refused` in the client reddens one case; giving `out-of-date` the
  words and the decay of `refused` reddens three, the first of them the distinctness gate.
- **Hand-run against a real worker** (`wrangler dev`, local KV): a v5 body answers `201` with an id,
  the same body carrying v4 or v6 answers `409` with `Reload the page: …`, a body malformed at v5
  still answers `400`, and the `409` carries `Access-Control-Allow-Origin` so a browser can read it.
- **The cost of stopping short was not neutral while it lasted.** `out-of-date` is the one narration
  that must not decay, and for as long as the panel's own table had no word for it a stale tab held
  `Sharing failed` indefinitely — worse to look at than the two-second version this row opened
  against, and identically uninformative.

The gate for each rendering half is a leg per refusal in that door's spec, and it is the only kind
of gate available: the editor's unit suite runs in node with no DOM, and knip reports exports rather
than the members of a returned object, so nothing else in the repository can observe a computed
label with no renderer. `apps/editor/e2e/specs/sharing.spec.ts` fulfils `**/configs` with a 409 and
asserts the button reads `Out of date — reload` _and still reads it past the decay window_, beside
`Sharing failed` for a refused store and `Offline — try again` for an aborted request.
`apps/editor/e2e/specs/install-dialog.spec.ts` asserts the same distinction on the dialog's note,
and asserts the refused-store case does NOT say "out of date" — so the two cannot re-collapse into
one sentence without a red.

## Proposed Standard

Three rules, and the first is the one that generalises. Only the first has landed; the other two
are what keep this finding `partial`.

**1. A refusal is distinguished by what the caller can DO about it, not by what went wrong.**
LANDED, in `.ai-docs/reference/features/seed-contract.md` — the "A wrong `v` on the write side is
409, not 400" section, whose table names `refuseAnotherSeedVersion` and `ShareRefusal` as the two
ends of it. It was proposed for beside that section and stated for the general case rather than for
`v`. The test is not "are these different causes" — 400 covered several already and rightly — it is
"does one of them have a remedy the others do not". A status is the only part of an HTTP answer a
client is guaranteed to branch on, so a remedy that exists needs a status of its own. Note what this
is NOT: it is not an argument against exact-match version literals, and it does not soften
discard-don't-migrate. The schema is unchanged and the payload is still refused. Only the spelling
of the refusal moved.

**2. A result type that carries a user-facing message must have a renderer, and the cheap way to
guarantee that is not to carry one.** Belongs in `docs/web/editor-spec.md` under the module map that
already lists `lib/api/configs.ts`. A failure union whose members are CAUSES (`"out-of-date"`,
`"refused"`, `"unreachable"`) plus a `Record` over that union at the surface makes an unnarrated
ending a compile error; a failure carrying a `string` makes an unnarrated ending nothing at all.
This is a proposal about the API layer's shape, and it should be read against the three modules
that DO render their strings — `catalog.ts`, `skill-index.ts`, `skill-contents.ts` reach dialogs
with room for a sentence, and a cause enum would be the wrong trade for them. **The rule is about
surfaces with no room for a sentence** — a button, a badge, a status word — where the words have to
be chosen ahead of time anyway.

**3. A row filed `status: partial` is re-dispatched with the pending file INSIDE the new lane's
list, or it is not re-dispatched.** Belongs in `.ai-docs/standards/briefing.md` beside the rule that
each lane names the files it owns. That rule is what made the first pass stop cleanly and report the
patch instead of writing it, and it is also what made the second pass stop at exactly the same line:
a fence drawn from the ROW's subject rather than from the finding's pending list splits a defect
from the only surface it is visible on, and each pass is individually correct while the user-facing
half does not move. The cost of getting this wrong is not a lost day — it is a half-landed change,
which here read worse on screen than the defect it was fixing, and did so for as long as the fence
held. Still unwritten in `.ai-docs/standards/briefing.md`: rule 11 there says a lane names the files
it owns, which is the half that already existed and is what both passes obeyed.

**The gate that holds the class, and it is one assertion.** `use-share-link.test.ts` asserts every
narration's label is distinct (`new Set(labels).size === labels.length`). Five endings sharing one
word was the whole defect; distinctness is impossible to satisfy by accident and fails the moment a
sixth ending is added without words. That is worth more than any number of assertions on individual
strings, none of which would have noticed that four of the five were the same string.

**What could not be pinned honestly.** Nothing checks that a browser tab and the worker it talks to
were built from the same tree — that is what the 409 exists to REPORT rather than prevent, and
preventing it would mean a version handshake the editor does not have. The deployment note in
`SERVER-04` (worker at 19:40:56Z, editor seven seconds later) shows the two halves can be current
and a third party — the cache in someone's browser — still be stale, so a build-time check would
prove nothing about the tab that actually posts.
