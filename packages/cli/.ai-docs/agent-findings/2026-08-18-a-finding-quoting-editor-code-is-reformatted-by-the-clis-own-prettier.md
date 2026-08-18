---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/agent-findings/2026-08-18-a-store-action-that-changes-nothing-still-writes-the-slot.md
  - packages/cli/prettier.config.mjs
  - packages/prettier-config/prettier.config.mjs
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: convention-undocumented
status: partial
partial_note: >-
  The one live instance is fixed — two `<!-- prettier-ignore -->` directives in
  `2026-08-18-a-store-action-that-changes-nothing-still-writes-the-slot.md`, each under a comment
  saying which repository the quoted code comes from, and `npx prettier --check .` is clean. What is
  pending is the written rule. Nothing in `documentation-bible.md` says that a finding filed under
  `packages/cli/.ai-docs/` may quote code from a workspace formatted by a DIFFERENT prettier config,
  or what to do about it, so the next agent quoting `apps/editor` source verbatim will hit the same
  `format:check` failure and will reasonably read it as cosmetic and reformat the quotation.
---

## What Was Wrong

`npx prettier --check .` in `packages/cli` failed on one agent finding, and the failure reads as a
style nit. It is not.

The repository has two prettier configs and they disagree about semicolons:

| Config                                         | `semi`  | Governs                          |
| ---------------------------------------------- | ------- | -------------------------------- |
| `packages/prettier-config/prettier.config.mjs` | `false` | everything except `packages/cli` |
| `packages/cli/prettier.config.mjs`             | `true`  | everything under `packages/cli`  |

`2026-08-18-a-store-action-that-changes-nothing-still-writes-the-slot.md` is a finding about
`apps/editor`'s `config-store`. It quotes that store's code verbatim in two ```ts blocks — correctly,
because a finding's evidence is the bytes it cites. But the finding FILE lives under
`packages/cli/.ai-docs/agent-findings/`, so `packages/cli`'s config is the nearest one walking up and
prettier wanted to add semicolons to the quotation:

```
<   useUiStore.getState().clearFlash()
>   useUiStore.getState().clearFlash();
```

Taking that fix would leave the finding quoting code that does not appear in the file it names.
Refusing it leaves `format:check` red — and `format:check` is in `prepublishOnly`, so a red one
blocks a release for a reason nobody would guess from the message.

**The whole class is any finding that quotes a non-CLI workspace verbatim.** Thirty-five findings in
this directory reference `apps/editor`, and only this one fails today — the other thirty-four either
paraphrase, quote code that happens to be semicolon-terminated already, or quote non-TS content that
prettier does not reformat. That is luck rather than a boundary, and it will not hold: the finding
directory is the CLI's, the subjects increasingly are not, and every workspace outside
`packages/cli` is formatted by the semicolon-less root config.

The failure is also badly signposted in both directions. There is a precedent for exactly this
confusion in `scripts/check-findings-frontmatter.ts`, whose own doc comment records it: "Prettier
does not leave an unreadable block alone... `format:check` then reports a style violation, which
reads as cosmetic and is not." Same symptom, different cause, and neither is written down anywhere a
finding's author would look.

## Fix Applied

Two `<!-- prettier-ignore -->` directives in the failing file, each preceded by a plain HTML comment
naming which repository the block is quoted from and why prettier must leave it alone.

Two mechanical notes, both of which cost a cycle to discover and are worth recording:

- The directive must be **exactly** `<!-- prettier-ignore -->`. A directive carrying a trailing
  explanation (`<!-- prettier-ignore -- because ... -->`) is not recognised at all and silently does
  nothing. The explanation goes in its own comment above it.
- There must be **no blank line** between the directive and the fenced block it protects. With one,
  prettier reformats the block anyway and then also wants the blank line removed.

Not applied: a `.prettierignore` entry for `.ai-docs/agent-findings/`. That would buy the same result
by giving up formatting on every finding in the directory, where the defect is confined to quoted
foreign-workspace code.

## Proposed Standard

`documentation-bible.md` should carry the rule, because it is where a findings author reads:

> **A code block quoting a workspace outside `packages/cli` is protected with
> `<!-- prettier-ignore -->`.** The finding directory lives under `packages/cli`, which formats with
> semicolons; every other workspace is formatted by the root config, which does not. Left alone,
> prettier rewrites the quotation until it no longer matches the file it cites — and a quoted
> defect that does not appear in the named file is evidence of nothing. Put a plain comment above
> the directive naming the workspace the block came from, so the next reader knows why the block is
> exempt rather than deleting the exemption as noise.
>
> The directive is matched literally: `<!-- prettier-ignore -->`, on its own line, immediately above
> the fence with no blank line between.

The general shape, which outlives this particular pair of configs: **quoted evidence is data, not
source, and a formatter that owns the file does not own the quotation.** The same argument applies
to any future workspace whose config diverges, and to quoted YAML, JSON or output where a formatter
would normalise what the finding is claiming was abnormal.
