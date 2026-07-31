---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/agent-findings/2026-04-21-d233-projects-normalization-asymmetry.md
  - .ai-docs/agent-findings/2026-07-25-register-deregister-path-normalization-asymmetry.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/agent-findings/README.md
  - .ai-docs/agent-findings/TEMPLATE.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: missing-rule
status: open
---

## What Was Wrong

Two findings describe the **same defect in the same file**. When the fix shipped,
only one of them was closed. The other still tells the reader the bug is live.

- `2026-07-25-register-deregister-path-normalization-asymmetry.md` — correctly
  updated to `status: resolved` with a Resolution Note.
- `2026-04-21-d233-projects-normalization-asymmetry.md` — still
  `status: partial`, and its `partial_note` still reads: _"Code fix pending —
  `registerProjectPath` still uses `fs.realpathSync` (L622) while
  `deregisterProjectPath` still uses `path.resolve` (L651)"_.

That sentence is now false. Both functions call the shared
`normalizeProjectPath()` helper in
`src/cli/lib/installation/local-installer.ts`. A reader who opens the older
finding — it is the one cited as "the original report", so it is a natural
landing point — is told to go and unify two functions that are already unified.

Nothing in the findings pipeline can catch this. The pre-processing scan in
`documentation-bible.md` ("Agent Findings Frontmatter") looks for six schema
defects, and duplicate detection is class (c): _"Duplicate
`affected_files + root_cause + date` tuple"_. **Because the tuple includes the
date, two findings about the identical defect filed months apart can never
collide by construction.** These two also carry different `root_cause` values
(`convention-undocumented` vs `enforcement-gap`), so they miss on two of the
three key parts. Every other check is per-file — nothing compares lifecycle
status _between_ findings.

The template already provides the right tool (`supersedes:` /`superseded_by:`,
described in the bible as being for exactly "a discovery finding later replaced
by a fix finding covering the same files and root cause"), but nothing prompts
an agent to reach for it, so the pair was never linked.

This is the same failure shape the bible already names for reference docs —
_"a closed limitation left standing reads as an open one and gets designed
around"_ — occurring one layer down, in the findings that feed those docs.

Secondary: the stale `partial_note` pins source line numbers (`L622`, `L651`).
Both have since moved. Line numbers in `.ai-docs/` are already discouraged;
inside a lifecycle field that is read as current state they are actively
misleading.

## Fix Applied

None to the finding files — editing findings authored by other agents was
outside this pass's scope (the task owned `.ai-docs/reference/`).

Per the bible's rule for a mismatch in a file you do not own ("record the
mismatch in a file you _do_ own — naming the stale file, its stale value, and
its owner"), the staleness is recorded in
`.ai-docs/reference/config/config-writer.md` → "`deregisterProjectPath` —
removal semantics", which now names the 2026-04-21 finding as still marked
`partial` with a `partial_note` that no longer matches the code.

## Proposed Standard

Two changes, both cheap and mechanical.

**1. Widen the duplicate check so it can see across dates.** In
`documentation-bible.md` → "Agent Findings Frontmatter", change defect class (c)
from an `affected_files + root_cause + date` tuple to a **date-free** key, and
make the finding a _review prompt_ rather than an error:

> (c) Two or more findings sharing an `affected_files` entry AND naming the same
> function or symbol, with **divergent `status:` values**. This is not
> automatically a defect — a file legitimately accumulates unrelated findings —
> but a resolved finding and an open/partial one over the same symbol must
> either be linked with `supersedes:` / `superseded_by:` or explained.

The current key cannot fire across dates, which is the only case that matters:
same-day duplicates are caught by the author, months-apart duplicates are not.

**2. Make closing a finding include a sibling sweep.** Add to
`.ai-docs/agent-findings/README.md` → "Resolution Model (authoritative)", and
mirror it in the `How to resolve a finding` comment block in `TEMPLATE.md`:

> **Before marking a finding `resolved`, grep the findings directory for its
> `affected_files` entries and for the function names in its body.** If another
> finding covers the same defect, resolve it in the same pass or link the pair
> (`supersedes:` on the newer, `superseded_by:` + `status: superseded` on the
> older). A defect is not closed while any finding still asserts it is open.
> Re-read every `partial_note:` you touch — it is a claim about current code,
> not a historical record, and it must be deleted or rewritten when the code
> changes.

Also worth stating plainly in `TEMPLATE.md` beside `partial_note:`: it describes
**what is pending right now**, so it goes stale exactly like a doc claim and
should carry no source line numbers.
