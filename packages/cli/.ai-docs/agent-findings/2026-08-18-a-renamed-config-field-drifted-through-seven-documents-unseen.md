---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/skills/skill-primitives.md
  - .ai-docs/reference/features/plugin-system.md
  - .ai-docs/reference/features/model-and-effort.md
  - .ai-docs/reference/features/source-fetch-and-cache.md
  - .ai-docs/reference/features/operations-layer.md
  - .ai-docs/reference/concepts/guard-pattern.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The eleven feature and concept documents were re-derived and repaired, and two drift rows
  (MODEL_NAMES, EFFORT_NAMES) were registered. What is pending is a standards rule for the two
  classes the repair exposed — a renamed field name and a parenthetical line count — neither of
  which any check can currently police.
---

## What Was Wrong

Re-deriving eleven feature and concept documents from source turned up three distinct classes of
drift, none of which any gate could have caught.

**1. A renamed field propagated through seven documents unseen.** `SkillConfig.source` is now
`SkillConfig.origin`. The rename landed in `src/cli/types/config.ts` and every call site, and it is
correct everywhere in code. Seven documents were still describing the old name — in prose
(`Filters to source !== EJECT_SOURCE`), in a guard condition
(`config.source === EJECT_SOURCE`), and in a quoted code fragment
(`config.skills.map((s) => [s.id, s.source])`).

What made it survive is that **a second, genuinely-still-named `source` exists one layer away**.
`SkillReference.source` and `Skill.source` are the compiler-side twins carrying the same value, so
a reader grepping the docs for `source` finds live and dead uses side by side and cannot tell them
apart without opening both type declarations. `scripts/check-enumeration-drift.ts` cannot help:
`origin` is a field on a type alias, not a member of an enumerated symbol, so no row can name it.

**2. A function rename left the documented symbol unfindable.** `derivePluginRef` in
`src/cli/lib/compiler.ts` is now `pluginRefFor`, and its contract changed shape at the same time —
it returns `{}` rather than `undefined`. `plugin-system.md` named the old symbol three times. This
is the failure the drift checker's own header calls out as the worse of the two: a reader greps for
`derivePluginRef`, finds it nowhere in the tree, and reasonably concludes the document describes a
different codebase.

**3. Parenthetical line counts were wrong in every instance.** `skill-primitives.md` annotated five
modules with `(N lines)`. All five were stale — `skill-copier.ts` `(213)` against 218,
`skill-metadata.ts` `(175)` against 166, `skill-fetcher.ts` `(88)` against 84,
`local-skill-loader.ts` `(129)` against 125, `skill-plugin-compiler.ts` `(217)` against 218. A line
count carries no navigational value that a symbol name and a file path do not, and it is wrong after
any edit to the file.

**A related class, recorded because it is the reason two of the above sat so long.** The document
that had already caught some of this drift recorded it as a _table of other documents' mistakes_.
`model-and-effort.md` carried an eight-row "Known drift in other docs" section. Every one of those
eight had since been repaired in its owning document — so the section was, on the day it was read, a
list of defects that no longer existed, formatted identically to a list of live ones. Nothing can
tell the two apart, and a reader acting on it would have "fixed" five documents that were already
correct.

## Fix Applied

Every claim below was re-derived from source before being changed.

**Corrected across the eleven pages:**

- `SkillConfig.source` -> `origin` in `plugin-system.md` (five sites), `operations-layer.md`,
  `guard-pattern.md` and `tombstone-pattern.md`, each with a sentence naming
  `SkillReference.source` as the separately-live twin so the next grep is not ambiguous.
- `derivePluginRef` -> `pluginRefFor` in `plugin-system.md`, with its `{}`-not-`undefined` return.
- `config.marketplace` -> `config.marketplaceName` in the uninstall key derivation, which was
  building registry keys off the user's ref rather than the manifest's own name.
- Five stale line counts deleted rather than refreshed.
- `skill-primitives.md`'s reachability table: three symbols documented as internal-only
  (`validateSkillPath`, `readLocalSkillMetadata`, `writeMetadataYaml`) each have a production caller
  in `src/cli/lib/seed/external-skills.ts`, a module that did not exist when the table was written.
- `ForkedFromMetadata` gained a `path?` field and `injectForkedFromMetadata` a four-member `origin`
  bag; both were documented at the older shape.
- `source-fetch-and-cache.md`'s local-branch error text (`Local source not found` against the
  actual `Local marketplace not found`, which does carry remediation lines the doc said it lacked),
  and its claim that the module "only names `GIGET_AUTH` in prose" — `fetchEtag` reads it per
  request and sends it as a `Bearer` header.
- `model-and-effort.md`'s "20 opus, 3 sonnet" bundled-model distribution, against 16 and 2. That
  count is owned by `agent-system.md`, which had it right; the second copy now cites rather than
  restates.
- The stale "Known drift in other docs" section was deleted, replaced by a count-ownership table
  and a note saying why a running list of other documents' mistakes must not be re-opened.

**Undocumented functionality written up:**

- `src/cli/lib/operations/project/remove-compiled-agents.ts` — an entire operations-layer module
  (`removeCompiledAgents`, `pruneCompiledAgents`, three exported types) that no page named.
- `src/cli/lib/skills/unresolved-skill-entries.ts` — claimed in `skill-primitives.md`'s scope with
  no section behind it. Its five-fate classification now has one.
- `markCopyCurrentForThisRun` in `source-fetcher.ts` — the memo write that makes a moved source
  download once per RUN rather than once per LOAD.
- `ClaudeConfigOptions` / `configDir` on every `claude plugin` wrapper in `exec.ts`.
- The per-skill scope routing of `claude plugin install`, and both refusal paths
  (`pluginInstallFailureError`, `unbackedPluginInstallError`) — confirming, as CLAUDE.md requires,
  that no page describes a plugin-to-eject fallback.

**Bound to source:** `MODEL_NAMES` and `EFFORT_NAMES` are now registered rows in
`scripts/check-enumeration-drift.ts`. Both required restructuring their one-cell comma list into a
member-per-row table first: the checker's `code-spans` reader only matches CONSTANT-shaped
backticked names, and every member of both arrays is lower-case, so `table-rows` was the only
readable form. Both rows were proved to fail by renaming a member in the working tree
(`fable` -> `fabel` reported `namedButAbsent: ["fable"], presentButUnnamed: ["fabel"]`; adding
`ultra` to `EFFORT_NAMES` reported `presentButUnnamed: ["ultra"]`), then reverting.

## Proposed Standard

Two rules for `standards/documentation-bible.md`.

**A. A renamed field is a documentation change, not just a code change.** Add to the maintenance
section: when a field on an exported type is renamed, grep `.ai-docs/` for the OLD name before the
change is called done. State the trap explicitly — if a same-named field survives on a neighbouring
type, the grep returns live and dead hits together, and each must be judged against its own type
declaration. `SkillConfig.origin` versus `SkillReference.source` is the live example and should be
named.

**B. No line counts in `.ai-docs/`, alongside the existing no-line-numbers rule.** A `(213 lines)`
annotation is the same defect as a `:213` citation wearing different clothes: it dates the document
without saying so, it is wrong after any edit, and it carries nothing a symbol name and a file path
do not. Five of five instances were stale.

**C — the class neither rule closes, recorded for the owner.** The checker cannot falsify an
assertion of ABSENCE. Filling a gap moves no symbol name, so "no spec exercises it", "it declares
none" and "checked by nothing" stay green forever. Eight such claims were checked on these pages
this session; three were FALSE. The mitigation applied here is to make each one re-derivable in
place — every surviving absence claim now carries the grep that settles it, and says outright that
the checker cannot police it. Whether that becomes a rule ("an absence claim must carry its own
re-derivation") is the owner's call, but the alternative — trusting the sentence — has now failed
in three separate documents on one pass.
