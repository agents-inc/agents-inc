---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/e2e/pages/constants.ts
  - packages/cli/e2e/commands/doctor-diagnostics.e2e.test.ts
  - packages/cli/e2e/commands/doctor-marketplace-download.e2e.test.ts
  - packages/cli/e2e/commands/doctor.e2e.test.ts
  - packages/cli/e2e/commands/doctor-content.e2e.test.ts
  - packages/cli/e2e/lifecycle/global-config-deleted-under-install.e2e.test.ts
  - packages/cli/e2e/lifecycle/codex-doctor-reads-the-layout.e2e.test.ts
  - packages/cli/e2e/lifecycle/codex-doctor-beside-a-claude-installation.e2e.test.ts
  - packages/cli/e2e/lifecycle/project-config-deleted-under-global-install.e2e.test.ts
  - packages/cli/e2e/lifecycle/codex-doctor-under-a-home-holding-both-global-installations.e2e.test.ts
  - packages/cli/e2e/lifecycle/codex-doctor-in-a-folder-inheriting-the-global-installation.e2e.test.ts
  - packages/cli/e2e/interactive/edit-from-global-reach.e2e.test.ts
  - packages/cli/e2e/interactive/edit-from-adds-to-global-sub-agents.e2e.test.ts
  - packages/cli/e2e/lifecycle/edit-global-propagates-to-every-registered-project.e2e.test.ts
  - packages/cli/src/cli/lib/versioning.test.ts
  - packages/cli/src/cli/lib/content-validator.test.ts
  - packages/cli/src/cli/lib/loading/source-fetcher-revalidation.test.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor-content.test.ts
  - packages/cli/src/cli/lib/__tests__/commands/doctor.test.ts
  - packages/cli/src/cli/lib/seed/external-skills.test.ts
  - packages/cli/src/cli/lib/loading/source-loader.test.ts
  - packages/cli/e2e/commands/init-from-clean-project.e2e.test.ts
  - packages/cli/e2e/handrun-journeys.ts
  - packages/cli/e2e/helpers/test-utils.ts
  - packages/cli/src/cli/lib/__tests__/helpers/matched-as-written.ts
  - packages/cli/src/cli/lib/__tests__/helpers/matched-as-written.test.ts
  - packages/cli/src/cli/lib/seed/config-to-seed.test.ts
  - packages/cli/src/cli/lib/seed/seed-to-selection.test.ts
  - packages/cli/e2e/commands/eject-preserves-exclusive-stack.e2e.test.ts
  - packages/cli/e2e/commands/source-revalidation.e2e.test.ts
  - packages/cli/e2e/interactive/edit-from-project-keeps-global.e2e.test.ts
  - packages/cli/e2e/interactive/edit-from.e2e.test.ts
  - packages/cli/e2e/lifecycle/config-scope-integrity.e2e.test.ts
  - packages/cli/e2e/lifecycle/doctor-dual-scope.e2e.test.ts
  - packages/cli/e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
standards_docs:
  - packages/cli/.ai-docs/standards/e2e/README.md
date: 2026-10-23
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  One tested escaper, `matchedAsWritten` in src/cli/lib/__tests__/helpers/matched-as-written.ts,
  reached by e2e specs through test-utils.ts and used by doctorRow. Every spec that put a path, URL,
  id or mirrored text into a pattern now escapes it with that helper, the hand escapes are gone,
  and the two unit specs that took the skip glyph from the product mirror it instead.
---

## What Was Wrong

Doctor's row patterns were written in each spec, and each spec escaped them itself. Two specs built
the same skipped-row pattern with `STEP_TEXT.DOCTOR_SKILLS_SKIPPED_UNREACHABLE.replace(/[()]/g, "\\$&")`
and a third did the same for `DOCTOR_SKIPPED_CONFIG_INVALID`. That escapes the two characters the
author saw in the message today and nothing else. A `.`, `+`, `?` or `[` added to the wording later
turns into regex syntax: the pattern either stops matching, and fails for a reason that names no
change, or quietly matches more than the row says.

The other half is runtime text interpolated with no escaping at all.
`doctor-marketplace-download.e2e.test.ts` put the marketplace's address into
`new RegExp(... Could not reach ${marketplaceOn(server)}\n)`. Every `.` in `127.0.0.1` matched any
character, so the assertion was looser than the line it names. It still passed, which is why nobody
saw it.

Census of the doctor sites, 2026-10-23, run from the repository root. This catches the single-line
cases. The multi-line `toMatch(` calls were read by hand, file by file:

```
grep -rnE '\\\\?s\+(✓|✗|–|\$\{)' packages/cli/e2e --include='*.e2e.test.ts'
```

Siblings outside doctor (census, same day; lowercase runtime values interpolated into a RegExp in a
spec, `.source` compositions excluded):

```
grep -rnE -A3 'new RegExp\(' packages/cli/e2e packages/cli/src --include='*.test.ts' --include='*.test.tsx' | grep -E '\$\{[a-z][^}]*\}' | grep -vE '\$\{[a-z][A-Za-z]*\.source\}'
```

Every hit was read. Hits holding only numbers, joined skill ids or a marketplace name carry no regex
syntax today and are left out. The ones that can widen or break:

- Paths and URLs, where a `.` matches any character: `realpathSync(...)` in
  `edit-from-global-reach.e2e.test.ts` and `edit-global-propagates-to-every-registered-project.e2e.test.ts`,
  `manifestPath` in `versioning.test.ts`, `marketplace.sourceDir` in `content-validator.test.ts`,
  and `process.env[GITHUB_URL]` in `shared-marketplace-checkout.test.ts`.
- Text escaped by hand: `addedToLine` in `edit-from-adds-to-global-sub-agents.e2e.test.ts` writes
  its `+` marker as `\\+`. It is correct today, and it is the same habit.
- `opening(text)` in `source-fetcher-revalidation.test.ts` interpolates whatever its callers pass.
- `doctor-content.test.ts` (a unit spec) builds a doctor row from `UI_SYMBOLS.SKIPPED`, which it
  imports from the product. That is the binding `packages/cli/CLAUDE.md` forbids for a rendering
  assertion: change the glyph and the expectation moves with it.

## Fix Applied

`doctorRow(name, status, message)` in `e2e/pages/constants.ts` builds a row as name, whitespace,
status mark, whitespace, then the opening of the message, and escapes every part. A message ending
in `"\n"` is held whole, and `.source` drops a row into a longer pattern. `STEP_TEXT` gained
`DOCTOR_STATUS_PASS`, the `Installations` and `Marketplace Repository` row names, and the three
messages more than one spec matched (`DOCTOR_SOURCE_REMOTE`, `DOCTOR_NO_ORPHANED_AGENTS`,
`DOCTOR_INSTALLATIONS_EACH_CHECKED`). All of them are mirrored rather than imported.

Every replaced pattern has the same `.source` as the one it replaced, with two exceptions. A
status-only row ends `\s+` instead of `\s`, which matches the same text when nothing follows it. The
marketplace address is now matched as written, which is stricter.

Each row was checked by breaking it in the built CLI: once by rendering every row's name as
`<name>~`, then by renaming the "Skills Resolved", "Marketplace Reachable" and "Agents Compiled"
labels. Every changed spec went red. Each red came from a row pattern, except where an earlier
whole-line pin in the same test failed first, and in the one negative row assertion, which reddens
through its label guard.

## Second Pass (2026-10-24)

**Fixed.** `doctor.test.ts` built its `No Orphans` skipped row from `UI_SYMBOLS.SKIPPED` as well,
so the binding sat in two unit specs, not one. Both now hold the glyph in a local `STATUS_SKIP`
that mirrors `STEP_TEXT.DOCTOR_STATUS_SKIP`. Checked by rewriting the skip glyph in the built CLI
to `~`: both files went red on every changed positive row, and green again after a rebuild.

**Census, rerun.** Run from `packages/cli`, then read each hit whole:

```
find src e2e \( -name '*.test.ts' -o -name '*.test.tsx' -o -path 'e2e/*.ts' -o -path 'src/*/__tests__/helpers/*.ts' \) -print0 | xargs -0 grep -HnE -A3 '\bRegExp\(|stringMatching\(' | grep -E '\$\{|\\\\[.+()]|RegExp\([A-Za-z_][A-Za-z0-9_.]*[,)]' | grep -vE '\$\{[A-Za-z.]*\.source\}'
```

It reads every `.ts` under `e2e/` and the shared test helpers, not only specs, and also catches a
value passed to `RegExp(` whole, which is how the hand-run's sites read.

The first census kept only `${lowercase…}` interpolations, which drops a composed constant. It
missed these:

- `CONFIG_RELATIVE` (`.agents-inc/claude/config.ts`), interpolated six times in
  `project-config-deleted-under-global-install.e2e.test.ts`, beside a hand-escaped `\\(~/…\\)`.
- `JSON.stringify(PARENT_ESCAPING_ID)` (`"../victim"`) in `external-skills.test.ts`.
- Two more hand escapes: `\\+` in `init-from-clean-project.e2e.test.ts`, and `\\.\\.\\.` in
  `source-loader.test.ts`.
- One outside the specs: `e2e/handrun-journeys.ts` passes `STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION`
  to `new RegExp` whole. Its `(marketplace repository)` becomes a group, so the pattern cannot
  match its own text and that hand-run note always prints `(not found)`.

**Fixed, same day.** The escaper moved to `src/cli/lib/__tests__/helpers/matched-as-written.ts`,
with its own spec. E2E specs reach it through `e2e/helpers/test-utils.ts`, and `doctorRow` imports
it directly, because test-utils already imports `e2e/pages/constants.ts`. Every site above, and
every mirrored text, id or name a spec interpolated, now goes through it.

Left on purpose: interpolations that are pattern syntax (`AGENT_NAME` in
`agent-recompiler-report.test.ts`), counts and quantifiers, and `.source` compositions. Two
source-scanning helpers also interpolate a TypeScript identifier unescaped
(`__tests__/helpers/generated-types.ts`, `source-call-sites.ts`), as do the word alternations in
`agent-partials-are-positively-framed.test.ts` and `spec-filenames.test.ts`. Those match source
text, not anything the CLI prints or writes.

Two of the escaped patterns are negatives, in `project-config-deleted-under-global-install.e2e.test.ts`.
Escaped, they reject only the exact path their message names, where the `.` wildcards used to
reject any lookalike. Each keeps a positive guard on the row label.

## Proposed Standard

`.ai-docs/standards/e2e/README.md`, under "No parser/extractor helpers in test files": **a spec
never escapes rendered text for a regex by hand, and never interpolates a runtime value (a path, a
URL, an id) into `new RegExp` unescaped.** It builds the pattern with a helper that escapes every
part (`doctorRow` is the shape), or asserts with `toContain` where the text needs no pattern.

Checked against `CLAUDE.md`: this does not conflict with "bind a rendering assertion to a mirror,
not the product's constant". The escaping helper takes the mirrored text and adds no meaning of its
own. The census above is the worklist. No lint rule can tell a constant that holds regex syntax on
purpose from one that does not, so the rule stays prose.
