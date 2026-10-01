---
type: standard-gap
severity: medium
affected_files:
  - eslint.config.js
  - src/cli/lib/__tests__/host-path-symbols-are-funnelled.test.ts
  - src/cli/lib/__tests__/host-path-literals-are-funnelled.test.ts
  - src/cli/lib/__tests__/source-folder-literals-are-funnelled.test.ts
  - src/cli/lib/__tests__/claude-plugin-imports-are-funnelled.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-09-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  The code half landed: `src/cli/lib/__tests__/host-path-symbols-are-funnelled.test.ts` holds the
  symbol half of the host-path ban against `eslint.config.js`, and no product change was needed. The
  clause proposed for `.ai-docs/standards/clean-code-standards.md` (a ban written in two halves
  needs two specs, the half with no literal spelling first) is written into no standard.
---

## What Was Wrong

The host-path ban is written in two halves under two different rules. The LITERAL half
(`no-restricted-syntax`, "A host path is resolved, not written") had a thorough spec —
`host-path-literals-are-funnelled.test.ts`, which derives the zone roster off the config and
proves the ban both fires and stays silent in each. The SYMBOL half (`no-restricted-imports`,
"A host path is resolved, not composed") had no spec at all:

```
grep -rln 'A host path is resolved, not composed' src e2e --include='*.ts' --include='*.tsx'
```

answered nothing on 2026-09-22 before this file landed.

That is the wrong half to leave unheld. The symbol ban exists precisely because the literal
selectors cannot see the class it guards — `path.join(root, CLAUDE_DIR)` writes no banned
spelling — and two of the four Claude leaks found by driving the Codex lane that day were of
exactly that shape. The guard written for the invisible class was itself the unmeasured one.

Both sibling bans already carry both halves. `source-folder-literals-are-funnelled.test.ts` says
so at :44 and holds its symbol half at :417; `claude-plugin-imports-are-funnelled.test.ts` is a
symbol ban with its own spec. The discipline existed and this ban arrived after it.

The failure mode is not hypothetical. `no-restricted-imports` does not merge its options across
flat-config blocks, so the last block naming the rule for a file owns ALL of them — a zone that
restates the rule for a reason of its own silently drops every group it forgets to restate.
`eslint.config.js` restates that rule in twelve blocks. Nothing could tell a restated group from
a dropped one.

A second, smaller thing the absence hid: the config's rostered backlog of eleven product files
that still compose a host path out of `CLAUDE_DIR` / `LOCAL_SKILLS_PATH` carries the comment "may
only shrink", and nothing held it to that. A twelfth file could join it in silence.

## Fix Applied

`src/cli/lib/__tests__/host-path-symbols-are-funnelled.test.ts`. Seven cases, modelled on the
literal spec beside it: zones derived through `lintZonesIn`, exemptions hand-written with their
reasons, both symbols against both import spellings (the `consts` barrel and `@workspace/compile`
direct), a neighbouring-constant control, the funnel clause in the message, and silence in each
exempt zone.

Mutation-checked, each against the assertion meant to carry it:

| Mutation of `eslint.config.js`             | Reddens                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| drop `importNames`, banning the module     | "leaves a neighbouring constant from the same module alone"             |
| add a twelfth file to the rostered backlog | "still finds each zone the ban is deliberately lifted in"               |
| delete the funnel clause from the message  | "tells an author what to do when no role answers the path it condemned" |

One trap worth recording, because copying the sibling spec's helper is the obvious way to write
this file and it turns the whole thing green having measured nothing.
`no-restricted-imports` renders its OWN sentence first — `'CLAUDE_DIR' import from '…' is
restricted from being used by a pattern.` — and appends the configured message after it. The
literal spec's `startsWith` is correct for `no-restricted-syntax`, which renders the message
verbatim, and answers false for every fixture here. The assertion has to be `includes`. This was
caught only because a probe reported every one of twelve zones silent, which is not a plausible
state for a live ban.

No product change. The ban was correct; what was missing was anything holding it there.

## Proposed Standard

`clean-code-standards.md` already carries the two-halves discipline for the bans themselves. The
clause it does not carry, and the one this cost: **a ban written in two halves needs two specs,
and the half with no literal spelling to match is the one to write first.** The literal half is
the one an author can eyeball; the composed half is invisible by construction, which is both why
it needs the ban and why it needs the spec.

The mechanical corollary, which is a one-line check: for each message string in
`eslint.config.js`, grep the tree for a spec naming it.

```
grep -rn "message: [A-Z_]*MESSAGE" eslint.config.js
```

A message no spec names is a rule nothing holds to any zone.

## Correction — 2026-09-25

**`status` moved from `resolved` to `partial`: the fix landed and the Proposed Standard did not.**
`README.md` → "Resolution Model (authoritative)" makes that `partial`, and
`grep -rniE 'needs two specs|no literal spelling' .ai-docs/standards`, run from `packages/cli`,
answers nothing. The `resolved_by` it carried is recorded here rather than kept beside a status it
no longer pairs with:

```text
resolved_by: >-
  src/cli/lib/__tests__/host-path-symbols-are-funnelled.test.ts holds the symbol half against the
  config, mutation-checked four ways. No product change; the ban itself was already correct.
```

## Correction — 2026-10-01

**The mutation table's first row was deleted, which is why it shows three of the "four ways"
quoted above.** It dropped the group from a `src/gate/**` block of `eslint.config.js`. That block
belonged to an uncommitted lint gate that was reverted out of the tree on 2026-10-01 before it was
ever committed, so no commit carries the zone it mutated:
`git show HEAD:packages/cli/eslint.config.js | grep -c "src/gate"` printed 0 that day.
