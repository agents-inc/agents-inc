---
type: anti-pattern | standard-gap | convention-drift | audit | missing-standard | architectural-drift
severity: high | medium | low
affected_files:
  - path/to/file1.ts
  - path/to/file2.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: YYYY-MM-DD
reporting_agent: <agent-type> # which sub-agent discovered the issue (tells us whose instructions may need updating)
category: dry | typescript | testing | complexity | performance | architecture
# category guidance:
#   dry          → duplicated logic/constants/fixtures that should be extracted
#   typescript   → type-safety issues (casts, any, missing narrowing, schema gaps)
#   testing      → test hygiene (factories, assertions, flakes, coverage gaps)
#   complexity   → high cyclomatic complexity, deeply nested control flow, tangled branches
#   performance  → runtime latency, memory footprint, hot-path optimization
#   architecture → layering, module boundaries, ownership, dependency direction
domain: e2e | cli | web | api | shared | infra
# domain guidance:
#   e2e    → e2e/ tests, page objects, fixtures
#   cli    → oclif commands, wizard flows, install/compile logic
#   web    → UI/React/Ink components, terminal rendering
#   api    → HTTP handlers, external service integration
#   shared → utilities, types, schemas used across domains
#   infra  → build, tooling, CI, scripts
root_cause: missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred | premise-expired
status: open | partial | resolved | superseded # REQUIRED — see "Lifecycle fields" below
# Conditionally required lifecycle fields:
# partial_note: <which half landed and which is pending — either direction>  # REQUIRED when status: partial
# resolved_by: <short note describing the fix>  # REQUIRED when status: resolved
# superseded_by: <newer-finding-filename.md>  # REQUIRED when status: superseded — and implies it
# supersedes: <older-finding-filename.md>  # on the NEWER finding; does not change its own status
# blocked_by: <upstream-finding-filename.md>  # upstream open/partial finding whose code-side fix must land before this one can close
---

<!--
FRONTMATTER SCHEMA RULES (enforced by the convention-keeper / codex-keeper pre-processing scan
described in `standards/documentation-bible.md` -> "Agent Findings Frontmatter")

1. `status:` is REQUIRED on every finding. Write it explicitly even when it is `open`.
   Do NOT rely on README.md's "defaults to open" — an omitted field makes every status rollup
   an inference rather than a count. As of the 2026-07-30 backfill, every finding on disk
   declares one; keep it that way (see "Known gap: status backfill — CLOSED" below).
   Do not quote a count here: the status distribution is owned by
   the tracker (`todo/cli.md`), per documentation-bible.md's
   "A Count Lives in Exactly One Document".

2. `type:` and `root_cause:` are SEPARATE enums. They are not interchangeable.
     type:       WHAT KIND OF DOCUMENT this is / what was observed.
                 anti-pattern | standard-gap | convention-drift | audit |
                 missing-standard | architectural-drift
     root_cause: WHY IT HAPPENED — which property of the rule system let it through.
                 missing-rule | rule-not-visible | rule-not-specific-enough |
                 convention-undocumented | enforcement-gap | scope-discipline-deferred |
                 premise-expired
                 `premise-expired` is the one that needs a definition rather than a reading:
                 the rule was CORRECT when written, a later change invalidated the fact it
                 rested on, and nothing existed to notice. It is not `missing-rule` (a rule
                 was there) and not `rule-not-specific-enough` (it was specific, and right).
                 Reach for it only when the original reasoning still reads as sound against
                 the world it was written in — that is the whole of what distinguishes it.
   `enforcement-gap` is a `root_cause` value ONLY. It is NOT a valid `type`. The two enums are
   disjoint — no value is legal in both fields. If a value seems to fit both, you have picked the
   wrong field for one of them.

   **RUNNABLE.** `scripts/check-findings-frontmatter.ts` reports any finding whose `root_cause` is
   outside the enum, naming the file and the value. It does not restate the enum: it reads the
   `root_cause:` LINE out of this file's own frontmatter above and splits it on the pipes, so the
   list at the top of this document is not a description of the check — it IS the check's input.
   Two consequences worth knowing before editing this file. Reformatting that line (wrapping it,
   changing the separator, moving it into a comment) changes what the scan accepts. And a value in
   neither list was previously invisible rather than wrong, which is the whole reason this scan
   exists: a finding carrying an invented `root_cause` parses, reads normally, and is silently in no
   group for every rollup that reads the field.

3. `superseded_by:` and `status: superseded` are a PAIR. Setting one without the other is a
   schema defect. A finding pointing at its replacement is by definition superseded.
   `supersedes:` is the mirror key on the NEWER finding and carries no status implication —
   the newer finding keeps its own lifecycle status (usually `open` or `partial`).

   Three further requirements on cross-links, all one-line checks:
   a. **The target file must exist on disk.** `supersedes:`, `superseded_by:` and `blocked_by:`
      are filenames, not free text. A dangling target is a defect, not a stylistic issue.
   b. **`supersedes:` / `superseded_by:` must be mirrored.** If A says `supersedes: B`, then B
      must say `superseded_by: A`. A one-sided link hides the lineage from whichever end the
      reader arrives at.
   c. **A finding may supersede more than one predecessor** — write `supersedes:` as a YAML list
      in that case. A scalar silently drops the other links, and nothing reports the loss: the
      surviving link still resolves, so a link-integrity scan passes over the ones it replaced.

   If a target legitimately no longer exists, do NOT just delete the key: record in the referring
   file's body what the link asserted and what evidence establishes the target once existed. The
   link is the only surviving record of the lineage once the file is gone.

4. Widening an enum: if an authentic value does not fit, widen the enum HERE in TEMPLATE.md
   rather than inventing an ad-hoc value in a single finding.

   **RUNNABLE, and cheaper than it reads.** Because the checker reads `root_cause` from the
   frontmatter line above, widening that enum is ONE edit — this file's own line — and the scan
   widens with it. There is no second list to update in `scripts/`, and there is no version of this
   change that leaves a checker disagreeing with the template. The precedent is
   `scope-discipline-deferred`, and it is worth reading for what it did rather than for the
   sentence it usually gets. A finding invented `scope-boundary-preserved` for deferred cleanup
   that respected a task-scope boundary; the CAUSE was authentic and the enum was widened for it —
   but under a different word, so the invented value survives on neither side and the finding did
   not keep it. Widening and rewriting are not alternatives: widen for the cause, then write the
   finding in the vocabulary that landed. What is not intended is leaving an invented value in
   place, which now fails the scan rather than sitting unnoticed.

   Two mechanical notes, both learned here. The enum values are also restated in rule 2 above, and
   that restatement is NOT read by the checker — widen both or they disagree silently. And write
   the value on one line wherever it appears in prose: `scope-boundary-preserved` sat wrapped
   across a line break in this very paragraph for as long as the claim did, so every grep for it
   returned nothing and the error was unfindable by the one check anybody would run.

   Nothing else in this schema is read mechanically, so `type:`, `status:` and the lifecycle-field
   pairings are still prose that a reader has to keep. Do not infer from "the enum is checked" that
   the rest of the block is.

5. **Any multi-sentence value is double-quoted or written as a `>-` block scalar.** A plain YAML
   scalar cannot contain a bare `: ` — the parser reads colon-space as a nested key and gives up on
   the whole block. This rule exists because ten findings broke exactly that way, and all ten broke
   on `resolved_by:` or `partial_note:`: they are the only fields carrying a paragraph of prose, and
   prose is where a colon turns up (a ratio, a time, a `key: value` quoted from source, an "and then
   this happened: that"). Short enum fields like `status:` cannot break this way, so the damage lands
   precisely on the two fields this template calls REQUIRED. The example above is written
   `resolved_by: <short note>` with no quoting and every author followed it, which is the whole
   cause. Prefer `>-` over quotes: it needs no escaping, so a value carrying `"` or `\` is safe in
   it, and it wraps at the file's column limit without further thought.

   Wrapping a plain scalar onto a second line is legal on its own — YAML folds it — but it fails the
   same way the moment any line carries a colon-space, which is why "it parsed when I wrote it" is
   not evidence that the next sentence will.

6. **`affected_files:` is the grep's output, pasted — not a reading of it.** When the body claims
   "N hits in M files", this list is the file list that produced N and M, transcribed. Do not
   re-derive it from the prose, and do not summarise it: a hit count and a file list that disagree
   are the signal, and there is nothing to notice the disagreement if the list was written from the
   summary. A rename sweep reported "roughly twenty hits in fifteen files" and named fifteen paths;
   the real figure was 35 hits in 20 files, and the shape of the omission is legible in the list
   itself — every named entry was an `identity.md` or a `playbook.md` whose `identity.md` sibling
   was already a hit, so the two agents with no `identity.md` hit fell straight through.

   Scope the grep to the widest tree the claim covers, not to where the defect hurt most. The same
   sweep scoped its gate to `src/agents/` because that is where the prompts are; run over `src/` it
   also found a retired agent name in a test comment, in a file the original rename had edited. A
   retired name is a lie wherever it appears.

   `scripts/check-findings-frontmatter.ts` parses every file in this directory and its suite fails
   on any that does not. That is the enforcement; this rule is how not to trip it. Note what the
   failure looks like from the outside if the scan is not run: Prettier stops recognising an
   unreadable block as frontmatter and reformats it as Markdown, so `format:check` reports a style
   violation — which reads as cosmetic and is not.

   **Also RUNNABLE, and it is the one that catches a list gone stale rather than a list written
   badly.** The same scan reports any two findings sharing `(affected_files, root_cause, date)` with
   no `supersedes:` / `superseded_by:` / `blocked_by:` link between them. It reports rather than
   refuses, deliberately: the tuple names a PAIR, and the frontmatter cannot say which half is
   wrong — one piece of work filed twice, an absent cross-link, or a file list that stopped being
   true. **A cross-linked pair is never reported**, because a discovery and the finding that
   replaced it are two valid filings once the link says which is which.

   The pair on disk that produced this scan was the third case, twice over: two findings from
   2026-04-21 both naming `src/cli/lib/installation/local-installer.ts` alone, both
   `enforcement-gap`, unlinked — and neither was about that file any more, because the module had
   been split and both symbols had moved to `src/cli/lib/config-gate/propagate.ts`. Repairing each
   list against source is what retires such a pair; adding a cross-link to silence it would assert a
   lineage that does not exist. **This is what a stale `affected_files:` costs beyond misleading a
   reader — it manufactures a false positive in a scan that has no way to tell which half to
   distrust.**

KNOWN GAP: status backfill — CLOSED 2026-07-30

  Every finding on disk now declares a `status:`. The backfill was done by opening each of the 36
  status-less files, reading its claim, and VERIFYING it against current source and the changelogs
  — not by defaulting them to `open`. That distinction turned out to be the whole point: the
  "defaults to open" reading was wrong for 30 of the 36. Twenty-one were `partial`, nine were
  already fully `resolved` (three of those `high` severity), and only six were genuinely open.

  Lesson for the next person tempted to skip the verification: a status asserted from a finding's
  prose is the same inference the field exists to replace. Several of the nine `resolved` files
  still READ as open — their "Fix Applied" sections describe work that later releases superseded,
  and only the source tells you the defect is unreachable.

  ALSO FIXED 2026-07-30: one finding carried `type: enforcement-gap`, which rule 2 makes
  invalid; it is now `type: standard-gap` — the value taken by every finding in that class, a
  hygiene rule with no runnable checker, of which
  `2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run.md` is the surviving example.
  Its `root_cause: enforcement-gap` was correct and unchanged — the author's diagnosis was
  right, it was just written into the WHAT field as well as the WHY field. No `type` value now
  appears in both enums.

  FIXED EARLIER 2026-07-30: 7 link defects — one rule-3 violation (a `superseded_by:` written
  with no paired `status: superseded`), two more unpaired `superseded_by:` links, three one-sided
  supersession pairs and two dangling `supersedes:` / `blocked_by:` targets — found by the
  directory's first link-integrity scan.

  STILL OPEN — lifecycle-field pairing, a class nobody has scanned for. Seven files whose `status:`
  was already present carry a mismatched or missing paired field: three `status: resolved` with no
  `resolved_by:`, one `status: open` carrying a `resolved_by:`, and three `status: superseded`
  carrying an extra `resolved_by:` (one also a `partial_note:`) beside a correct `superseded_by:`.
  The last three may be legitimate — recording both the replacement and the underlying fix is
  useful — and this template should decide whether to sanction it. The other four are defects.

  Counts are owned by the tracker (`todo/cli.md`), which re-derives them from disk at each pass.
  Do not restate them here.
-->

<!--
How to resolve a finding:
- Edit this file in place. Do NOT move or rename it (cross-links break silently).
- Add BOTH `status: resolved` AND `resolved_by: <short note>` to the frontmatter — always paired.
- The `resolved_by:` note should cite the mechanism of resolution (commit hash, PR, doc update, standards section, superseding finding).
- See `README.md` → "Resolution Model (authoritative)" for the full rule.
-->

## What Was Wrong

<!-- Describe the anti-pattern, missing standard, or convention drift you discovered -->

## Fix Applied

<!-- Describe what you did to fix it (or "None — discovery only" if you just identified it) -->

## Proposed Standard

<!-- What rule, convention, or documentation update would prevent this in the future? -->
<!-- Be specific: name the doc file and section where the rule should go -->
<!-- This is a PROPOSAL, not an approved instruction. Cross-check it against CLAUDE.md's
     NEVER/ALWAYS rules and the relevant standards/ doc before writing it, and say so
     explicitly if it conflicts. README.md -> "Writing a Finding" is the rule and the
     case that produced it. -->
<!-- Every count in the body says whether it is a census or a sample. Same section. -->
