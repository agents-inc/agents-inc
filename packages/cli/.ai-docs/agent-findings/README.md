---
last_validated: 2026-08-19
---

# Standards Feedback Loop

Sub-agents capture anti-pattern findings during refactoring and review work. A `convention-keeper` agent synthesizes them into documentation updates.

## Reading a Finding

**A finding is dated evidence, not a live claim.** Everything in its body describes the tree as it
stood on the `date:` in its frontmatter, and nothing there is maintained afterwards. "What Was
Wrong" says what was wrong that day; "Fix Applied" says what was done that day. Both stay correct as
written however far the code has moved since.

**So a finding that no longer matches today's tree is neither stale nor a defect.** A symbol it names
that nothing declares now, a path in `affected_files:` that is gone, a spec it quotes that was
repointed afterwards — that is the tree moving, which is what trees do. None of it is owed an audit,
a repair or a tracker row. Rows have been opened against findings whose only fault was being older
than the code they describe, and stopping that is what this section is for. **Where a finding and
the tree disagree, believe the tree and leave the finding alone.**

**Do not "correct" a body to match current code.** The body is the only surviving record of what was
observed and what was done; rewriting it deletes that record and puts in its place a fresh claim with
exactly the lifespan of the one it replaced — wrong again within weeks, and with nothing left to
compare it against. The reasoning is the one behind "prefer deleting a claim to rewriting it": every
rewrite is a new claim that can rot. Here the old claim is not even wrong. It is a true statement
about a date.

**One field is live, and it is `status:`.** It is edited in place after the fact, on the same file at
the same path — written `open`, moved to `partial` when half the work lands, to `resolved` or
`superseded` when it closes. `2026-07-17-d227-same-scope-active-tombstone-duplicate.md` has carried
three different values over five weeks against a body that never moved. `partial_note:` travels with
it and is live for the same reason: "Resolution Model (authoritative)" below binds it to be
re-derived by any pass that opens the file at all. Everything else in the frontmatter is dated like
the body — `affected_files:` names the tree the finding was written against, and `resolved_by:`
records the mechanism that closed it on the day it closed.

`scripts/check-findings-frontmatter.ts` reports dangling `affected_files:` entries and lifecycle
notes naming symbols the tree no longer declares, and its suite holds both to the set already on
disk. A red there means a NEW one arrived. It is not a worklist against the ones already pinned.

**When the LIVE half is wrong, correct the field and append — never edit the body in place.** Set the
status the tree supports, re-derive the note beside it, and where the old claim would have misled a
reader, add a short correction at the END of the body naming what it asserted and what is actually
true. The same d227 file is the worked example: a false supersession was replaced in the frontmatter
and answered in a `## Correction` section, with the original body left exactly as written.

**Reading a finding is safe; following one is not.** Re-derive before acting on a Proposed Standard —
`.ai-docs/standards/documentation-bible.md` → "Agent Findings" carries that rule, and "Writing a
Finding" below carries the different one for a proposal that was wrong the day it was written. This
section covers the third case, which is the common one: a finding that was right, and is old.

## Pipeline

```
Sub-Agent Work → Structured Findings → Convention Keeper → Doc Updates
     (capture)      (accumulate)         (synthesize)        (apply)
```

### Stage 1: Capture

When a sub-agent (cli-developer, cli-tester, cli-reviewer, etc.) fixes an anti-pattern or discovers a gap in documented standards, it writes a finding here.

**Who writes findings:**

- Sub-agents write raw findings during work (they have the full context)
- The orchestrator writes findings when synthesizing across multiple agent results

**When to write a finding:**

- You fixed duplicated code/constants that should have been shared
- You found a missing or weak assertion pattern
- You discovered a convention that isn't documented
- You noticed drift between documented standards and actual practice
- You applied a fix that would benefit from a preventive rule

### Stage 2: Accumulate

Findings pile up in this directory across sessions. Each review/refactor session typically produces 3-8 findings. No processing needed — they're just markdown files.

### Stage 3: Synthesize

Invoke the `convention-keeper` agent to:

1. Read findings (`.md` files in this directory — filter open vs resolved by frontmatter `status:`, NOT by directory)
2. Group by theme (DRY, typescript, testing, complexity)
3. Cross-reference against `.ai-docs/standards/` and `CLAUDE.md`
4. Determine: existing rule violated (enforcement gap) or missing rule (documentation gap)?
5. Propose targeted additions to specific docs
6. Mark processed findings resolved in place (`status: resolved` + `resolved_by:`) — do NOT move files

## Finding Format

See `TEMPLATE.md` for the structure. Each finding is a small markdown file (~15-25 lines) with YAML frontmatter containing: `type` (anti-pattern, standard-gap, convention-drift, audit, missing-standard, architectural-drift), `severity` (high, medium, low), `affected_files`, `standards_docs`, `date`, `reporting_agent` (which sub-agent discovered the issue -- tells us whose instructions may need updating to prevent recurrence), `category` (dry, typescript, testing, complexity, performance, architecture), `domain` (e2e, cli, web, api, shared, infra), and `root_cause` (missing-rule, rule-not-visible, rule-not-specific-enough, convention-undocumented, enforcement-gap, scope-discipline-deferred).

**The `root_cause` list above is a courtesy copy. `TEMPLATE.md`'s own frontmatter line is the definition**, and `scripts/check-findings-frontmatter.ts` reads it from there — so widening the enum is a single edit to that line and the scan widens with it. Do not add a value here and stop; a value this file offers and the template does not is reported as outside the enum. That checker also refuses any finding whose frontmatter a parser cannot read, and reports two findings sharing `(affected_files, root_cause, date)` with no cross-link between them — which is usually a stale file list rather than a duplicate filing. `TEMPLATE.md` schema rules 2, 4 and 6 carry the detail.

### Writing a Finding

Three rules about the body. They exist because a finding is written mid-task by a sub-agent and read later as if authoritative, and because the tracker rows and the implementations that follow are scoped from its sentences.

**A Proposed Standard is a proposal, not an approved instruction.** Before writing one, cross-check it against `CLAUDE.md`'s NEVER/ALWAYS rules and the relevant `standards/` doc. If the proposal conflicts with an existing rule, say so explicitly and argue the exception — never state it as a bare recommendation. Before IMPLEMENTING a proposal from an existing finding, re-run the same cross-check: the finding may predate the rule, or may never have been checked against it. One in this corpus correctly diagnosed a path-normalization split and then prescribed "realpath, falling back to `path.resolve` only if the path no longer exists on disk" — a two-tier resolution chain CLAUDE.md bans outright, inside the very helper meant to unify the rule, and invisible in review because the implementer could cite an approved finding as justification. A finding's diagnosis and its prescription carry the same apparent weight, and only the diagnosis is grounded in observed code.

**Say whether a count is a census or a sample.** "Two specs" reads as the whole population, and the tracker row written from it will be scoped as if it were. When you grepped, write the grep and its hit count; when you only opened what you happened to be reading, say so — "at least two, not a full sweep" costs four words and stops the next agent sizing a task from a sample. A finding naming the two specs it had open led to a row scoped at two, and the one-line change turned seventeen assertions red across two files, thirteen of them in the producer's own unit spec, the first file anyone would grep. The narrower rule for that class: **a vacuous assertion is never local** — a field constant by construction is asserted wherever the producer is asserted, so the population is "every spec that calls the producer", countable with one grep, and worth running before the count goes in.

**A verification command is evidence only when it was run.** Same standard on the discovery side as on `resolved_by:`; see `TEMPLATE.md` schema rule 6 for what that means for `affected_files:`.

### Resolution Model (authoritative)

Frontmatter IS the status. The `status:` field is an enum with four values:

- **`open`** (default when `status:` is absent) — the finding has not been acted on, or fix work is not yet underway.
- **`partial`** — one half of the finding has landed and the other has not. **It covers BOTH directions**, and the `partial_note:` MUST name which: docs / standards landed with the code-side fix pending, or the code fix shipped with the Proposed Standard never written. The inverse direction is the common one, not the exception — `grep -l '^status: partial' *.md | xargs grep -lEi 'no standard was written|standard is not written|standard.*not (yet )?written|not written into any standards|DOCS side did not|the general rule is NOT written|Proposed Standard (below )?is NOT landed'` returns 22 files, and that phrasing-dependent grep is a floor rather than a census. A definition admitting only one direction made a third of the directory ambiguous at a glance and invited exactly the mis-reading it existed to prevent.
- **`resolved`** — the anti-pattern has been fixed or the standard has been fully updated. Requires a `resolved_by:` field (always paired with `status: resolved`).
- **`superseded`** — the finding has been replaced by a newer/authoritative one. Pair with `superseded_by:` pointing to the replacement finding's filename.

Without explicit `status: resolved` or `status: superseded`, the finding is open or partial — regardless of directory location.

- **Never move files** to mark resolution. Resolution is a frontmatter edit on the existing file, at its existing path. Cross-links from standards docs, other findings (`supersedes:` / `superseded_by:`), and commit messages reference findings by filename; moving a file breaks every such link silently.
- **No `done/` subdirectory workflow.** The directory-as-status model was never adopted (as of iter 83, 45 findings use `status: resolved`, 0 were ever moved). `done/` remains available as an OPTIONAL cold archive for very old resolved findings (e.g., >6 months) if volume ever makes the flat directory unwieldy — but using it is never required, and current practice does not use it.
- **Filter by frontmatter, not directory.** Consumers (convention-keeper, dashboards, greps) distinguish open/partial/resolved by reading `status:`, not by path.

#### Closing a finding sweeps its class, or says why it did not

**When a finding names a file as an instance of a class, the fix sweeps the class — or the finding
states what happened to the rest.** Write the sweep as a command and its result: "the class is
`<grep or glob>`, N members, all N corrected", or "N members, M corrected, the rest are `<reason>`".

The reason this needs saying is that `affected_files:` reads as the population when it is only the
instance. A finding names a file, describes a class in the prose beside it, and the sentences
describing the class are the ones a reader remembers — so the file list quietly becomes the
worklist, and nobody is asked the one question that separates the two. The case that produced this
rule is as small as the class can get: a manual mock was fixed, written up as a class, and the
directory it came from held exactly TWO files. The second was also partial. Opening it cost one
`ls`.

This is the same demand "Say whether a count is a census or a sample" above makes of a DISCOVERY,
applied to the FIX. Where the class is small enough to enumerate, enumerating it is cheaper than the
sentence explaining why it was not.

#### A `resolved_by` that adds an affordance records the call-site sweep

**"The affordance now exists" is a claim about the toolbox, not about the callers**, and a reader of
the frontmatter cannot tell which one was meant.

> When a fix adds a page-object method, helper or matcher that existing sites are meant to adopt,
> `resolved_by:` must state the sweep result — "converted N sites, grep for `<pattern>` returns
> nothing" — or list the sites deliberately left alone. Where the deferral is deliberate, the
> finding stays `partial` until the deferred sites are converted or recorded as not needing
> conversion; otherwise `resolved` absorbs a known gap.

The case: a sweep converted four sites to a new raw-wait affordance and correctly declined to add an
agent-side counterpart nothing yet needed. The counterpart arrived later with a different spec. The
already-existing site covering the OTHER arm of the same guard, emitting the same toast constant,
was never revisited — and stayed green throughout, because the shape it kept fails only when it
loses a render race.

**This one now has a runnable form**, which is the argument for the rule rather than a substitute
for it: `src/cli/lib/__tests__/toast-assertion-surface.test.ts` scans the whole E2E tree for a
processed-buffer read within a few lines of a toast constant, and holds the result at empty. Note
what it cannot do, because its own comment says so: its roster of toast constants is hand-named, so
a NEW toast is invisible to it until someone adds it — the gate checks that every name in the roster
still exists, which stops the roster silently emptying, but cannot know what is missing from it. A
sweep gate is evidence about the sites it can see, and a `resolved_by` citing one still owes the
reader its scope.

#### `partial_note` is re-derived by EDITING a finding, not only by closing one

The rules above bind the re-read to the act of RESOLVING. Bind it to the act of EDITING as well:
**any pass that opens a finding for any reason — a citation repair, a rename sweep, a frontmatter
fix — re-reads its `partial_note` against source before it closes the file, and either corrects it
or records that it was checked.** The cost is one grep for the symbols the note names.

Nothing else can do this. Every check over this directory is per-file and structural: the frontmatter
scan asserts the YAML parses, the link-integrity scan asserts the filename-valued keys resolve, the
lifecycle-pairing check asserts `status:` has its partner field. None of them reads a `partial_note`
and asks whether the source still agrees, because a `partial_note` is prose about code and no scanner
can evaluate it. And `partial_note` is the one field a reader takes as current state —
`TEMPLATE.md` says so in as many words.

The specimen is `2026-04-21-propagation-skipped-observability-gap.md`, whose note recorded an
always-visible `warn()` on skipped propagation as pending. It had shipped, under a different task and
in a different module: `compile.ts` → `reportPropagation` and `uninstall.tsx` →
`updateRegisteredProjects` each loop `report.propagated.skipped` and call
`registeredProjectUpdateSkipped` from `utils/messages.ts`, which is not gated on `--verbose` — the
whole substance of the gap. The same note pins its claim to `writeScopedConfigs`, which no production
module declares: `writeScopedFromWizard` in `lib/config-gate/index.ts` replaced it, and the old name
is so thoroughly gone that `lib/__tests__/config-gate-enforcement.test.ts` holds it as the constant
`A_NAME_NOTHING_DECLARES`, the self-test for a guard whose job is catching list rows that name
nothing. It read as an open observability gap for four months.

**This is the single-finding form of a failure mode the directory already knows in its pairwise
form.** The familiar one is two findings over one defect, one closed and one not — and a reader
comparing siblings catches it. Here there was one finding, describing work that landed elsewhere,
with nothing anywhere to disagree with it.

### Optional Lifecycle Fields

- `status: partial` + `partial_note: <what's landed vs pending>` — set when either half has landed and the other has not, in either direction. Always pair the two fields, and always name the direction in the note. Intermediate state between `open` and `resolved`.
- `status: resolved` + `resolved_by: <short note>` — set on a finding once the anti-pattern has been fixed or the standard has been updated. Always pair the two fields. This is the authoritative resolution marker.
- `supersedes: <filename>` / `superseded_by: <filename>` — cross-link duplicate or re-scoped findings. The older/narrower finding gets `superseded_by:`; the authoritative one gets `supersedes:`. Preserves the discovery lineage without deleting context.
- `blocked_by: <filename>` — cross-link to an upstream finding whose unresolved code-side fix prevents this finding from being closed (or prevents the test/repro described in this finding from exercising the path it claims to cover). Use when the finding is `open` or `partial` and a separate tracked finding must resolve first.

`root_cause: scope-discipline-deferred` covers the case where an anti-pattern was consciously left in place to respect task-scope boundaries (distinct from `enforcement-gap`, which implies the rule should have caught it).

## File Naming

Use descriptive kebab-case names with date prefix:

- `2026-03-21-duplicated-skillspath-helper.md`
- `2026-03-21-toequal-vs-tostrictequal.md`
- `2026-03-21-missing-cleanup-in-smoke-tests.md`

**Preserving API identifiers in slugs:** when a slug references a specific exported function, type, or module name from `src/cli/` or `e2e/`, the identifier MAY retain its original casing (camelCase / PascalCase). Everything else must be kebab-case. Rationale: identifier legibility > strict lowercasing.

- Acceptable: `2026-04-21-toBeDefined-vs-toBe-assertion-drift.md`, `2026-04-21-mergeConfigs-mutates-input.md`, `2026-04-21-registerProjectPath-missing-scope-check.md`
- Not acceptable: `2026-04-21-Some-Rule-Name.md` (domain prose, not an API identifier)

## Audit Reports vs Findings

Two document classes coexist in this directory, distinguished by frontmatter `type:`.

- **Regular findings** — single issue, single root cause, proposed standard. The default shape described by `TEMPLATE.md`.
- **Audit reports** — sweeps across multiple files or findings that report outcomes (files changed, findings landed, follow-ups). Example: `2026-08-18-half-the-health-check-routing-table-cannot-be-reached-through-a-source-on-disk.md`. Audits use `type: audit` in frontmatter to mark the document class, so the live set is `grep -l '^type: audit' *.md` rather than any list written here.

An optional `audits/` subdirectory MAY host future sweep reports if the flat directory becomes noisy. It is not mandatory — audits can live at the root as long as the `type: audit` marker is present. Consumers filter by frontmatter, not path.

## Pre-Flight Lint Check

`convention-keeper` / `codex-keeper` MUST verify every unprocessed finding has YAML frontmatter (opening `---` on line 1, fields per `TEMPLATE.md`) before accepting it into the pipeline. Findings using ad-hoc `**Date:**` body lines instead of frontmatter must be backfilled before synthesis — the frontmatter fields (`type`, `severity`, `category`, `domain`, `root_cause`) drive grouping.
