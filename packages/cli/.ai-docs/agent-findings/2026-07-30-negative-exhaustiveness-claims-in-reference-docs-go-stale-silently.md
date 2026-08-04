---
type: missing-standard
severity: medium
affected_files:
  - .ai-docs/reference/config/config-writer.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Doc-side fix HAS shipped — the three stale negative claims in config-writer.md are corrected and now
  name their callers in a table. Still pending: the "negative claims must carry a verification command"
  rule in documentation-bible.md, and a sweep of the other reference docs for the same claim shape.
---

## What Was Wrong

Three claims in `.ai-docs/reference/config/config-writer.md` were true when written and became false without
anything noticing. All three share one shape: they assert a **negative about the whole codebase** rather than
a positive about a named function.

| Stale claim                                                                  | What made it false                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "`skipped` is returned but never consumed … architecturally orphaned"        | `uninstall.tsx::updateRegisteredProjects` now warns once per skipped project (`registeredProjectUpdateSkipped`) |
| "the enclosing `writeScopedConfigs` returns `void` regardless of skip count" | It returns `ScopedConfigWriteResult` = `{ propagatedProjects }` (D-240)                                         |
| "**Callers (two write sites)**" for `propagateGlobalChangesToProjects`       | A third production caller landed: `pruneGlobalEntriesFromRegisteredProjects` (D-274)                            |

Two of the three even carried their own verification instructions in prose — "Grep for
`propagateGlobalChangesToProjects` confirms these are the only two production callers" — which was accurate at
the time and would have caught the drift if anyone had re-run it. Nobody did, because nothing said to.

The failure mode is worse than an ordinary stale line. A positive claim that goes stale ("function X does Y")
usually breaks visibly the first time someone follows it. A negative claim that goes stale reads as an
architectural invariant: "the `skipped` array is architecturally orphaned" invites a developer to delete it,
or to build the missing observability that in fact already exists on one path. A count in a heading
("two write sites") is the same class — it silently converts "here is the list I knew about" into "here is the
complete list".

This is the documentation twin of the code-side finding
`2026-07-29-project-config-written-by-two-paths-only-one-reconciled.md`, whose own proposed standard says: a
doc describing a reconciliation rule must enumerate the write sites by function name, because "reconciled on
write" is not checkable while "reconciled at these two functions" is. The same reasoning applies to every
negative and every count, not just to reconciliation.

Secondary observation, same sweep: the reference docs have **no in-file convention for per-revalidation
annotations**. `DOCUMENTATION_MAP.md` carries rich `<!-- re-validated ... iterNN: ... -->` notes per row, but
no file under `.ai-docs/reference/` contains an HTML comment at all (verified by grep). A per-file annotation
was requested this pass and had to be invented; I placed a `<!-- re-validated YYYY-MM-DD (product X.Y.Z): ... -->`
block between the frontmatter and the H1 in all five edited files, mirroring the map's wording.

## Fix Applied

Doc-side only, in `config-writer.md`:

- Replaced "never consumed" with a three-row **caller table** stating, per production caller, whether it reads
  `updated` and whether it reads `skipped`. The gap is now scoped ("on the two `writeScopedConfigs` paths")
  instead of asserted globally.
- Replaced "returns `void`" with the actual signature and return type, in a new signature line at the head of
  the `writeScopedConfigs` section.
- Changed "**Callers (two write sites)**" to "**Callers (three production sites)**" and added the third.
- Added a **write-site inventory table** for `reconcileProjectSplitAgainstGlobal` naming both sites, per the
  companion finding's documentation corollary.

No source files touched.

## Proposed Standard

Add to `.ai-docs/standards/documentation-bible.md`, as a new subsection under "Documentation Standards"
(adjacent to "Exhaustive Enumeration over Glob Shorthand", which is the same instinct applied to lists):

> ### Negative and Exhaustiveness Claims
>
> A claim that something does **not** happen anywhere, or that a list of call sites is **complete**, is a claim
> about the entire codebase — not about the file being documented. It cannot be checked by re-reading the
> function it appears under, so it survives every validation pass that only re-reads that function.
>
> Any of these forms MUST carry the grep or glob that verifies it, inline:
>
> - "never called / never consumed / no caller inspects X"
> - "the only N call sites are …" or a bare count in a heading ("Callers (two write sites)")
> - "architecturally orphaned", "dead", "unreachable in production"
> - "no code outside `<file>` does X"
>
> Prefer the checkable rewrite over the assertion. Instead of "`skipped` is never consumed", write a per-caller
> table with a column for it — a new caller then shows up as a missing row rather than as a sentence that is
> quietly wrong. Instead of "two write sites", write "the write sites are `a()` and `b()`" and state the grep
> (`writeConfigFile(..., { isProjectConfig: true, globalConfig })`) that enumerates them.
>
> Return types are the same class: never describe a function's return in prose ("returns `void`") without
> naming the type. A widened return type is invisible to a prose reader and to every reviewer of the widening.
>
> **Re-validation trigger:** a doc containing any negative/exhaustiveness claim must have that claim's stated
> grep re-run in every sweep that touches the doc, regardless of the calendar cadence.

Also add to the same file, under "Documentation Standards" → format rules:

> ### Per-File Revalidation Annotation
>
> Every reference doc edited during a sweep carries an HTML comment between the frontmatter block and the H1:
>
> ```
> <!--
> re-validated YYYY-MM-DD (product X.Y.Z): <what was corrected, semicolon-separated>
> -->
> ```
>
> This is the same content as the doc's `DOCUMENTATION_MAP.md` row annotation, kept with the file so a reader
> who opens the doc directly — the common case for an agent following a cross-link — sees what the last sweep
> changed without loading the map. The map row stays authoritative for scheduling; the in-file block is for
> provenance.
