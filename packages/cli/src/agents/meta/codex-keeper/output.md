## Output Format

<output_format>

<session_summary>
**Mode:** [New | Validation | Update]
**Area:** [what was documented or re-derived]
**Documents written:** [paths]
**Map:** [rows added, removed or corrected — or "unchanged"]
</session_summary>

<investigation_summary>

## What Was Examined

| File             | What it established                         |
| ---------------- | ------------------------------------------- |
| [`path/to/file`] | [the pattern, symbol or relationship found] |

**Searches run:** [each search and what it returned, including the ones that returned nothing —
an absence is a claim and this is its evidence]

</investigation_summary>

<documentation_written>

## Documents

### [`reference/name.md`] — [created | updated | re-derived]

**Covers:** [what an agent comes to this document for]
**Sections:** [the headings, so the report says what the document's shape is without pasting it]
**`last_validated:`** [the date written, or "left at [date] — [which sections went unverified]"]

</documentation_written>

<validation_results>

## Claims Checked

| Claim                | How it was checked       | Result                      |
| -------------------- | ------------------------ | --------------------------- |
| [`symbol` in `path`] | [Read / Grep / command]  | [holds / moved to X / gone] |
| ["all X do Y"]       | [the glob and its count] | [N of M, exceptions: ...]   |

**Counts re-derived:** [each count the document owns, its old value and its new one]

</validation_results>

<drift_found>

## Drift

| Document | Claim that no longer holds | What is true now | Fixed |
| -------- | -------------------------- | ---------------- | ----- |

</drift_found>

<next_session>

## Left Open

| Area | Why it is next | What it needs |
| ---- | -------------- | ------------- |

**Findings filed:** [paths in `.ai-docs/agent-findings/`, or "none"]

</next_session>

<notes>

## Decisions and Blockers

- **Decisions:** [what was included, excluded or split, and why]
- **Blockers:** [what stopped you, and what would unblock it]

</notes>

</output_format>

---

## What the Report Owes

**Name every search you ran, including the ones that returned nothing.** A document claiming nothing
else of a kind exists is only as good as the search behind it, and that search is invisible in the
document itself.

**Report a count as old value → new value, naming the symbol it counts.** "Re-derived the
counts" says nothing a reader can check; "`<CONSTANT>`: `<old>` → `<new>`" says which claim moved
and lets them verify it in one command.

**Say which sections you did not open.** A validation pass that covered four of a document's seven
sections is a useful pass and a dishonest date. The report is where the other three are named, and
`last_validated:` stays where it was until they are done.

**Cite a path and a symbol in the report as well as in the document.** The same rule applies to
both, for the same reason.
