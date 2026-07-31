---
date: 2026-07-30
proposer: codex-keeper
status: absorbed
resolution_date: 2026-07-30
resolution_note: |
  Approved by the user and adopted 2026-07-30, in two passes. Both halves have
  now landed.

  HALF ONE — the export exception now lives in
  `CLAUDE.md` -> "NEVER do this" -> "Code Style", appended to the existing
  "NEVER export constants only used within the same file" bullet rather than
  placed in a separate section, so a reader of the original rule cannot miss it.
  It names the exempt category (helpers building an identity or lookup key more
  than one surface must agree on), states that the export is the single
  definition every surface is meant to call, cites `skillSlotKey` and
  `agentSlotKey` in `src/cli/lib/wizard/scope-diff.ts` as the live examples, and
  closes with "Nothing else is exempt" to keep it narrow.

  HALF TWO — the SLOT-key vs MERGE-key guidance, outstanding at the first pass
  and the sole reason this was `mostly-completed`, landed later the same day as
  rule **8.7** in `.ai-docs/standards/clean-code-standards.md` -> "8. DRY",
  directly after 8.6. It sits with the DRY rules (as the proposal asked) rather
  than in a section of its own, because the mistake it prevents is an
  over-eager de-duplication. Adopted as prose rather than the proposed table:
  the two-directions-of-breakage explanation does not fit a table cell, and the
  brief called for tight prose over a matrix. It names both families with their
  file paths and function names, states the one structural difference (the
  merge key carries a `:excluded` suffix on deletion markers, the slot key does
  not, so the two strings are identical for a live entry and diverge only on
  tombstones), forbids both unifying them and routing one through the other's
  helper, and states what breaks in each direction.
affected_files:
  - src/cli/lib/wizard/scope-diff.ts
  - src/cli/lib/wizard/index.ts
  - src/cli/lib/configuration/config-merger.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
category: dry
domain: cli
---

# Exempt identity/key helpers from the "no same-file-only export" rule

> **ADOPTED 2026-07-30** (both halves, in two passes). The export exception lives in
> `CLAUDE.md` -> "NEVER do this" -> "Code Style", on the "NEVER export constants only
> used within the same file" bullet itself. The key-families guidance proposed below
> landed later the same day as rule **8.7** in
> `.ai-docs/standards/clean-code-standards.md` -> "8. DRY" — as prose rather than the
> table sketched below; see `resolution_note` in the frontmatter. Source of the
> underlying observation:
> `.ai-docs/agent-findings/2026-07-30-shared-identity-key-helpers-conflict-with-the-no-single-file-export-rule.md`.

## Problem

Two rules in this project currently point in opposite directions, and a fix that
shipped today sits exactly on the seam.

`CLAUDE.md` -> "Code Style" says:

> NEVER export constants only used within the same file — run grep before adding `export`.

`agentSlotKey` was added to `src/cli/lib/wizard/scope-diff.ts` and exported from
the `src/cli/lib/wizard/index.ts` barrel. Verified on disk 2026-07-30, its only
functional consumer is `scope-diff.ts` itself:

| Site                                     | Use                                    |
| ---------------------------------------- | -------------------------------------- |
| `scope-diff.ts` — `computeScopeDiff`     | builds the baseline `Set`              |
| `scope-diff.ts` — `classifyAgentDiffRow` | probes the baseline `Set`              |
| `lib/wizard/index.ts`                    | barrel re-export only — not a consumer |

A future agent applying the rule mechanically greps, finds one same-file user,
drops the `export`, and the next surface that needs an agent slot key writes its
own literal. **That is precisely the precondition that caused D-278** — the
Sources tab and the confirm step had each built the match key differently, one on
skill id alone and one on `(id, scope)`. The remedy was a single shared helper.
Stripping the export restores the defect class, and the agent doing it would be
correctly following a written NEVER rule.

The rule is right about its usual target: an incidental constant that leaked an
`export`. It cannot currently distinguish that from a helper whose entire purpose
is to be the single definition of how two things are matched — where a second
consumer is the expected future and the export is what makes divergence
impossible rather than merely unlikely.

## Proposal

Amend the `CLAUDE.md` -> "Code Style" bullet to carry its exception:

> NEVER export constants only used within the same file — run grep before adding `export`.
> **Exception: identity/key helpers.** A function whose job is to define how
> entities are MATCHED (slot keys, merge keys, dedup keys, cache keys) may be
> exported before a second consumer exists. For these the export IS the
> guarantee — a second surface computing the key itself, differently, is the
> defect class the helper prevents (D-278). Name them `*SlotKey` / `*Key` and
> state in the JSDoc that the export is pre-emptive, so the next grep finds the
> reason instead of an apparently-unused export.

And add to `.ai-docs/standards/clean-code-standards.md`, near the DRY guidance:

> **Key families are not interchangeable.** Before routing a key construction
> through a shared helper, check WHICH key it is. The wizard has at least two
> `` `${a}:${b}` `` families that must stay separate:
>
> | Family    | Helpers                        | Location                                     | Shape                   | Used for             |
> | --------- | ------------------------------ | -------------------------------------------- | ----------------------- | -------------------- |
> | SLOT key  | `skillSlotKey`, `agentSlotKey` | `src/cli/lib/wizard/scope-diff.ts`           | `(id, scope)`           | session diffs        |
> | MERGE key | `skillKey`, `agentKey`         | `src/cli/lib/configuration/config-merger.ts` | `(id, scope, excluded)` | D-221 entry identity |
>
> They look identical and mean different things. Folding the `excluded`
> discriminator in, or dropping it, changes merge behaviour. The D-278 fix
> correctly left `skillKey` alone.

## Rationale

The narrow alternative — delete the `export` and re-add it when a second consumer
appears — fails because the second consumer is the moment the bug is introduced,
not a moment when someone thinks to check for an existing helper. The export has
to precede the need for it to do any work.

Scoping the exception by NAMING CONVENTION (`*SlotKey` / `*Key`) plus a mandatory
JSDoc line keeps it auditable: a reviewer can still challenge any other
single-consumer export, and the pre-emptive ones announce themselves.

The second half of the proposal is arguably the more valuable one. The two key
families are a live trap independent of the export question — an agent told to
"route every agent key through `agentSlotKey`" would plausibly unify them,
because both read as `` `${a}:${b}` `` at a glance, and the result would silently
change merge behaviour around tombstones.

## Risks / Open Questions

- **Enum creep.** "Identity/key helper" is a judgement call. The naming
  convention bounds it, but an agent could rationalise a wider class.
- **The rule is currently unqualified, which is part of its value.** An
  unqualified NEVER is cheap to apply and hard to argue with. Adding the first
  exception invites more.
- **Alternative not taken:** enforce via a JSDoc marker alone (e.g.
  `@preemptive-export`) and leave CLAUDE.md unchanged. Cheaper, but the grep-and-
  delete agent never reads the JSDoc — it greps for call sites. Rejected on that
  basis, but worth a second opinion.
- **Scope of application:** the proposal covers `agentSlotKey` today. Whether
  `skillSlotKey` (which does have multiple consumers) needs the same JSDoc marker
  for consistency is undecided.
