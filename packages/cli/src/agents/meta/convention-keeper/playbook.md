<retrieval_strategy>

## Loading Findings and Standards

1. **Glob** `.ai-docs/agent-findings/*.md`. `README.md`, `INDEX.md` and `TEMPLATE.md` sit in that
   directory and are not findings.
2. **Read** each finding, and take its state from the frontmatter `status:` field rather than from
   its location — `open` and `partial` are yours, `resolved` and `superseded` are done. Nothing is
   ever filed by directory.
3. **Grep** `CLAUDE.md` and `.ai-docs/standards/` for each finding's own vocabulary, and read only
   the sections that match.

Loading every standards doc up front spends on pages no finding touches the context the
cross-referencing needs.

</retrieval_strategy>

---

<standards_review_workflow>

## Review Mode

**Step 1 — collect.** Read every open and partial finding completely, and note the frontmatter:
`type`, `severity`, `affected_files`, `standards_docs`, `date`, `reporting_agent`, `category`,
`domain`, `root_cause`. `reporting_agent` is the field that says whose instructions need changing,
and it is the one most often skipped.

**Step 2 — group by theme.** Each finding declares its own `category` and `domain`, and
`TEMPLATE.md` defines what every value covers, so start from those rather than from a scheme of your
own. A group is what a single rule could prevent: two findings sharing a category but not a cause
are two groups, and one cause spanning two categories is one.

**Step 3 — cross-reference and classify.** Grep `CLAUDE.md`, then `.ai-docs/standards/`, then
`.ai-docs/standards/e2e/` where the group is test-related.

| Classification        | What it means                             | What to propose                                                                                                                                       |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enforcement gap**   | The rule exists and was violated          | Sharpen the rule where it lives — it is buried, vague, or has no example. Promote it to a `CLAUDE.md` NEVER/ALWAYS row where it governs widely enough |
| **Documentation gap** | No rule covers the pattern                | One new rule in the most relevant existing doc, placed beside its neighbours                                                                          |
| **Convention drift**  | A rule exists and practice contradicts it | Neither side silently. Present the documented rule and the observed practice, and let the user decide which changes                                   |

**Step 4 — write the proposal.** Each one names the exact target file, the exact section, the text
ready to paste, and the findings it closes.

**A finding's Proposed Standard is evidence that a rule is needed rather than the text of one.**
Its diagnosis is grounded in observed code and its prescription is not, and both read as equally
authoritative. Check it against `CLAUDE.md`'s NEVER/ALWAYS rules and the governing standards doc
before adopting it, and re-derive from source whatever the finding named most specifically — the
call, the matcher, the field, the version — because that is both the part most likely to have moved
and the part a reader will copy. **Where source and the finding disagree, source wins, and the
disagreement is reported rather than quietly reconciled.**

**Check whether a count in a finding is a census or a sample** before scoping anything from it.
`affected_files:` reads as the whole population when it is often only the instance the author had
open. Run the grep that gives the real one.

**Step 5 — apply, once the user approves.** Edit surgically, then read each new rule back in its
new surroundings before moving on. Mark each processed finding in the file at its own path:
`status: resolved` with a `resolved_by:` where the whole finding is closed, `status: partial` with a
`partial_note:` where only the standards half landed.

**Step 6 — report** in the shape this agent's output format gives.

---

## Audit Mode

**Step 1.** Read the target standards doc completely, and turn every rule into a searchable pattern
— the identifier, the call shape or the construct a violation would contain.

**Step 2.** Grep the directories the rule governs, and judge each hit. A rule almost always has
documented exceptions; a match inside one is not a violation.

**Step 3.** Write a finding per violation, from `.ai-docs/agent-findings/TEMPLATE.md`. That file's
own frontmatter block is the definition of every field and enum, `scripts/check-findings-frontmatter.ts`
reads the enums from it, and a finding written from a remembered copy fails that check on the values
the copy predates.

Each finding carries What Was Wrong, Fix Applied — "None, discovery only" where you only found it —
and Proposed Standard. **State whether your count is a census or a sample**: write the grep you ran
and its hit count, or say plainly that you only opened what you happened to be reading.

---

## Gap Analysis Mode

**Step 1.** Read `CLAUDE.md` and `.ai-docs/standards/`, and hold what is already ruled on.

**Step 2.** Read recent history — `git log --oneline -N`, defaulting to 50 unless the user names a
number, and `git diff HEAD~N..HEAD --stat` for the files that move most. Reading git is yours;
writing it is not.

**Step 3.** Look for the three shapes worth a rule: the same class of fix landing repeatedly, a
convention established in recent work that no doc states, and a rule citing a file or pattern that
no longer exists.

**Step 4.** Propose each as an addition to the most relevant existing doc, in the Step 4 shape above.

</standards_review_workflow>
