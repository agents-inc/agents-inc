---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/.ai-docs/agent-findings/TEMPLATE.md
  - packages/cli/.ai-docs/agent-findings/2026-04-21-agent-findings-frontmatter-drift-iter45.md
  - packages/cli/.ai-docs/agent-findings/2026-04-21-task-ids-in-test-names-sweep-needed.md
  - packages/cli/.ai-docs/agent-findings/2026-04-22-agent-toggle-checkbox-ignores-excluded-tombstone.md
  - packages/cli/.ai-docs/agent-findings/2026-04-22-plugin-uninstall-bare-id-asymmetry-with-install.md
  - packages/cli/.ai-docs/agent-findings/2026-07-20-structural-config-load-erases-writer-compaction.md
  - packages/cli/.ai-docs/agent-findings/2026-07-20-two-config-normalisers-sorted-vs-order-preserving.md
  - packages/cli/.ai-docs/agent-findings/2026-08-05-skill-summoner-partials-self-wrap-tags-the-template-already-adds.md
  - packages/cli/.ai-docs/agent-findings/2026-08-07-apps-server-restates-the-shared-vitest-config-by-hand-with-no-recorded-reason.md
  - packages/cli/.ai-docs/agent-findings/2026-08-07-no-craft-less-meta-skill-is-left-to-pin-the-row-is-the-whole-reach-rule-on.md
  - packages/cli/.ai-docs/agent-findings/2026-08-07-the-planning-breadth-invariant-is-one-directional-for-the-two-ai-categories.md
standards_docs:
  - .ai-docs/agent-findings/TEMPLATE.md
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-436(a). Eleven files repaired, not ten — the scan was re-run rather than the table trusted,
  and `2026-08-08-six-docs-place-the-cross-scope-masking-helpers-in-the-module-they-left.md` had
  joined the class since this was written, on the same `resolved_by:` field. Every offending scalar
  is now a `>-` block scalar rather than double quotes, because several carry `"` or `\` and a
  folded block needs no escaping. All three of the Proposed Standard landed: `TEMPLATE.md` gained
  schema rule 5 at the point of authorship, `documentation-bible.md` -> "Agent Findings
  Frontmatter" gained requirement 5 and a defect class `g` that is stated to run BEFORE the six
  count-based scans, and the loop itself became `scripts/check-findings-frontmatter.ts` with a
  suite beside it — fixtures for both failure modes and both fixes, plus a repository-level
  assertion. The whole directory now parses; that assertion was shown to fail first, by restoring
  one repaired scalar to its plain form and watching it name that file and nothing else.
---

## What Was Wrong

Ten of the 259 findings on disk carry frontmatter that no YAML parser will read. Every status
rollup, link-integrity scan and lifecycle-pairing check described in `TEMPLATE.md` is defined over
these fields, and for these ten files those fields do not exist as data — only as text that happens
to look like them.

**The cause is one character sequence: a bare `: ` inside an unquoted value.** In YAML a plain
scalar cannot contain colon-space; the parser reads it as a nested key and gives up. Nine of the
ten fail exactly this way (`BLOCK_AS_IMPLICIT_KEY`), and the tenth fails the adjacent way — a
plain scalar wrapped onto a second line (`Implicit keys need to be on a single line`).

| Finding                                                                                       | Field that breaks it |
| --------------------------------------------------------------------------------------------- | -------------------- |
| `2026-04-21-agent-findings-frontmatter-drift-iter45.md`                                       | line 20              |
| `2026-04-21-task-ids-in-test-names-sweep-needed.md`                                           | line 25              |
| `2026-04-22-agent-toggle-checkbox-ignores-excluded-tombstone.md`                              | line 14              |
| `2026-04-22-plugin-uninstall-bare-id-asymmetry-with-install.md`                               | line 17              |
| `2026-07-20-structural-config-load-erases-writer-compaction.md`                               | line 17              |
| `2026-07-20-two-config-normalisers-sorted-vs-order-preserving.md`                             | line 16              |
| `2026-08-05-skill-summoner-partials-self-wrap-tags-the-template-already-adds.md`              | line 16              |
| `2026-08-07-apps-server-restates-the-shared-vitest-config-by-hand-with-no-recorded-reason.md` | line 21              |
| `2026-08-07-no-craft-less-meta-skill-is-left-to-pin-the-row-is-the-whole-reach-rule-on.md`    | line 16              |
| `2026-08-07-the-planning-breadth-invariant-is-one-directional-for-the-two-ai-categories.md`   | line 15              |

**The line numbers are the tell.** In every case the offender is the last field in the block — the
`resolved_by:` or `partial_note:` lifecycle note. Those are the only fields that carry a paragraph
of prose, and prose is where a colon turns up: a ratio, a time, a `key: value` quoted from source,
an "and then this happened: that". Short enum fields like `status:` and `domain:` cannot break this
way. So the damage is concentrated precisely on the fields `TEMPLATE.md` calls REQUIRED and whose
absence it treats as a schema defect.

There is a second-order symptom worth naming because it is what surfaced this. Prettier does not
merely leave an unreadable frontmatter alone — it stops recognising the block as frontmatter at all
and reformats it as Markdown, re-indenting the `affected_files` list under the wrong parent. So
`format:check` reports these files as style violations, which reads as a cosmetic problem and is
not one.

## Fix Applied

None — discovery only, and deliberately so. The ten files span four other work areas and repairing
them is a sweep, not a side effect of this pass. Nothing was made worse: a note appended to
`2026-08-07-apps-server-restates-...` today was worded to avoid adding a colon to a scalar that was
already unparseable before it.

The scan is one command from the findings directory, and re-running it is how this gets verified
rather than believed:

```
bun -e 'import { readdirSync, readFileSync } from "fs"; import { parse } from "yaml";
  for (const f of readdirSync(".").filter((f) => f.endsWith(".md"))) {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(f, "utf8"));
    if (!m) { console.log("NO FRONTMATTER", f); continue; }
    try { parse(m[1]) } catch (e) { console.log(f, "-", e.message.split("\n")[0]) }
  }'
```

## Proposed Standard

1. **`TEMPLATE.md` must state that any multi-sentence value is quoted or written as a block
   scalar.** The template shows `resolved_by: <short note describing the fix>` with no quoting, and
   every author has followed the example — which is why the defect clusters on exactly that field.
   One added line beside the lifecycle-field rules ("prose values contain colons; wrap them in
   double quotes or use `>-`") removes the whole class at the point of authorship.

2. **The parse should be the first step of whatever reads this directory.** `TEMPLATE.md` already
   describes a "convention-keeper / codex-keeper pre-processing scan" and a link-integrity scan.
   Both are defined over parsed frontmatter, so both are silently skipping these ten today, and a
   status rollup that cannot read a `status:` field has no way to say so. A scan that fails loudly
   on an unreadable file is worth more than one that reports a count over the files it could read.

3. **This belongs in `.ai-docs/standards/documentation-bible.md` -> "Agent Findings Frontmatter"**,
   which is the section `TEMPLATE.md` names as the enforcing authority.
