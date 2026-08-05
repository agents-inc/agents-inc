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
root_cause: missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred
status: open | partial | resolved | superseded # REQUIRED — see "Lifecycle fields" below
# Conditionally required lifecycle fields:
# partial_note: <what's landed (docs/standards) vs what's pending (code)>  # REQUIRED when status: partial
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
   `.ai-docs/the tracker (todo/cli.md)`, per documentation-bible.md's
   "A Count Lives in Exactly One Document".

2. `type:` and `root_cause:` are SEPARATE enums. They are not interchangeable.
     type:       WHAT KIND OF DOCUMENT this is / what was observed.
                 anti-pattern | standard-gap | convention-drift | audit |
                 missing-standard | architectural-drift
     root_cause: WHY IT HAPPENED — which property of the rule system let it through.
                 missing-rule | rule-not-visible | rule-not-specific-enough |
                 convention-undocumented | enforcement-gap | scope-discipline-deferred
   `enforcement-gap` is a `root_cause` value ONLY. It is NOT a valid `type`. The two enums are
   disjoint — no value is legal in both fields. If a value seems to fit both, you have picked the
   wrong field for one of them.

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
      in that case. (`2026-07-30-d277-global-immutability-collapses-tombstone-provenance.md`
      supersedes three.) A scalar silently drops the other links.

   If a target legitimately no longer exists, do NOT just delete the key: record in the referring
   file's body what the link asserted and what evidence establishes the target once existed. The
   link is the only surviving record of the lineage once the file is gone.

4. Widening an enum: if an authentic value does not fit, widen the enum HERE in TEMPLATE.md
   rather than inventing an ad-hoc value in a single finding.

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

  ALSO FIXED 2026-07-30: `2026-07-20-e2e-spec-files-accumulate-unused-imports-unenforced.md`
  carried `type: enforcement-gap`, which rule 2 makes invalid. It is now `type: standard-gap`,
  matching the two sibling findings in the identical class (a hygiene rule with no runnable
  checker): `2026-07-17-d167-task-id-recurrence-no-lint-guard.md` and
  `2026-07-30-eslint-precommit-gate-has-no-config-and-cannot-run.md`. Its `root_cause:
  enforcement-gap` is correct and unchanged — the author's diagnosis was right, it was just
  written into the WHAT field as well as the WHY field. No `type` value now appears in both enums.

  FIXED EARLIER 2026-07-30: 7 link defects — the rule-3 violation on
  `2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse.md` (`superseded_by:` with no
  `status:`), two more unpaired `superseded_by:` links, three one-sided supersession pairs and two
  dangling `supersedes:` / `blocked_by:` targets — found by the directory's first link-integrity
  scan.

  STILL OPEN — lifecycle-field pairing, a class nobody has scanned for. Seven files whose `status:`
  was already present carry a mismatched or missing paired field: three `status: resolved` with no
  `resolved_by:`, one `status: open` carrying a `resolved_by:`, and three `status: superseded`
  carrying an extra `resolved_by:` (one also a `partial_note:`) beside a correct `superseded_by:`.
  The last three may be legitimate — recording both the replacement and the underlying fix is
  useful — and this template should decide whether to sanction it. The other four are defects.

  OPEN QUESTION for this template's owner — `partial` has only one documented direction.
  README.md defines it as "docs/standards landed, code-side fix pending". The backfill found the
  INVERSE to be far more common: the code fix shipped and the Proposed Standard was never written.
  Twenty of the 21 new `partial` files are that shape and say so in their `partial_note:`. Either
  widen the enum, or state here that `partial` covers both directions and the `partial_note:` MUST
  name which — otherwise the field is ambiguous at a glance in a third of the directory.

  Counts are owned by `.ai-docs/the tracker (todo/cli.md)`, which re-derives them from
  disk at each pass. Do not restate them here.
  Source: `2026-07-30-findings-rollup-has-no-snapshot-rule-and-schema-drifted.md`.
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
