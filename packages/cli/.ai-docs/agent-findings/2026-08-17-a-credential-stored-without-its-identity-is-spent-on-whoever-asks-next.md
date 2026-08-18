---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/stores/marketplace-store.ts
  - apps/editor/src/features/configure/lib/use-catalog-first.ts
  - apps/editor/src/features/configure/components/marketplace-dialog.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-17
reporting_agent: web-developer
category: architecture
domain: web
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  EDITOR-39 keyed the marketplace slot by marketplace, so a token is filed under
  the repository it authorizes and can only be looked up by naming that
  repository. `tokenFor(marketplace)` replaced `getState().token` at the one
  seating call site, and the dialog's token box now re-reads from the name
  beside it whenever that name changes. Pinned by
  `apps/editor/e2e/specs/marketplace-switch.spec.ts` -> "sends no token to a
  marketplace it holds none for", which asserts on the `Authorization` header
  the browser actually sent.
---

## What Was Wrong

The editor stored one marketplace and one token in a single slot:
`{ marketplace, token }`. Everything that needed to read a catalogue asked the
slot for "the token" — never for "the token for THIS repository", because with
one of each there was no difference to express.

There was a difference. The marketplace being read is not always the one in the
slot:

- a shared address (`/?fromId=…`) names its OWN marketplace and seats it without
  storing it, which is a deliberate rule (EDITOR-37);
- the dialog's token box persisted across an edit of the marketplace field, so
  the credential held for one repository was submitted with the name of another.

Both paths fed `fetchCatalog(marketplace, token)` a pair that had never been
issued together. The observable consequence, captured verbatim from a browser
before the fix — a visitor holding a PAT for `acme/private-skills` opens a link
naming `acme/skills`:

```
- Expected  - 1
+ Received  + 1
  Array [
-   null,
+   "Bearer ghp_000000000000000000000000000000000000",
  ]
```

The credential goes to api.github.com rather than to an attacker, so nobody
learns its value — but a PAT scoped to one private repository was presented, on
a stranger's instruction, to a repository it was never issued for, and every
later read of that repository would do it again. The second path was worse than
the first: on a successful load the mismatched pair was WRITTEN, filing the PAT
under a marketplace that had never seen it.

The shape is what allowed it. A credential stored beside the identity it
authorizes, rather than under it, has no way to refuse the next reader — the
lookup carries no name to check against.

## Fix Applied

The slot is now `{ current, saved: Record<marketplace, token> }`. The identity is
the KEY and the credential is the VALUE, so a token cannot be reached without
naming the repository it belongs to, and `tokenFor(marketplace)` answers `""` for
one this browser holds nothing for. The single call site that used to read
`getState().token` already had the marketplace in hand.

The UI half is the same rule said on screen: editing the marketplace field
re-reads the token box from `tokenFor(the new name)`, so a credential cannot
follow a name it was not issued for into storage.

## Proposed Standard

There is no `standards/security.md` in this repository — the nearest home is
`.ai-docs/standards/clean-code-standards.md`, and the rule below should go there
under a new heading **"Store a credential under the identity it authorizes,
never beside it"** unless a security document is created for it:

> A stored secret is keyed by the thing it grants access to — the repository, the
> host, the account. Never hold it in a field whose name is only its type
> (`token`, `apiKey`, `secret`), and never look one up without naming the
> identity being reached.
>
> The reason is not tidiness. A lookup that takes no identity cannot check one,
> so the credential is spent on whoever the caller happens to be reaching — and
> in a browser the caller is frequently chosen by someone else, through a link.
> Keying makes the mismatch unrepresentable rather than something each call site
> has to remember.
>
> Two consequences to check for at review:
>
> 1. **Reads.** Every credential read passes the identity: `tokenFor(repo)`, not
>    `state.token`. A read with no argument is the defect.
> 2. **Writes, including the form that produces them.** A field holding a
>    credential is bound to the field naming its identity: change the identity
>    and the credential is re-read, never carried. A form that keeps a pasted
>    secret while the target changes underneath it will file the pair, and a
>    stored wrong pair is permanent in a way a single wrong request is not.
>
> The single-slot shape is the tell: `{ identity, secret }` as sibling fields is
> a map with one entry and no key, and it stops being safe the moment a second
> identity is reachable — which for anything a URL can address is immediately.

A second, narrower note belongs in the same file: **a discard path added for
safety becomes a data-loss path at the next schema change.** This slot absorbed
any unparseable blob by returning empty and reporting nothing, so the deploy
that landed the keyed shape would have destroyed every stored PAT — silently,
through the code that exists to be careful. Any persisted store holding
something the user cannot re-obtain needs `version` + `migrate` before its shape
changes, and the discard branch needs a `reportIssue`. `config-store.ts` had all
three; this one had none, and nothing flagged the asymmetry.
