---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/e2e/lifecycle/dual-scope-same-source-plugin.e2e.test.ts
  - packages/cli/e2e/fixtures/project-builder.ts
  - packages/cli/e2e/assertions/phase-assertions.ts
  - packages/cli/e2e/matchers/project-matchers.ts
  - packages/cli/src/cli/lib/__tests__/assertions/config-assertions.ts
  - packages/cli/src/cli/lib/__tests__/helpers/config-source-sections.test.ts
  - packages/cli/e2e/lifecycle/config-scope-integrity.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The two assertion regressions and the two stale test-data sites are fixed. The prose sweep
  (about thirty comments and JSDoc blocks still naming the pre-rename fields) and the helper
  option names (`source` on four fixture and assertion helpers) are documented here and not
  patched, per the document-first rule for sweeps.
---

# The rename was complete everywhere the compiler could see it, and nowhere else

## What Was Wrong

CLI-501 renamed `SkillConfig.source` to `origin`, `ProjectConfig.source` to `marketplace`, and
`ProjectConfig.marketplace` to `marketplaceName`. `tsc -p e2e/tsconfig.json --noEmit` and
`tsc --noEmit` both pass, and the Zod loader now hard-refuses a config carrying either old key
(`RENAMED_CONFIG_FIELDS` / `RENAMED_SKILL_ENTRY_FIELDS` in `src/cli/lib/schemas.ts`). Between them
those two gates caught every stale key in a position either one could see.

Neither gate can see three positions, and all three still carried the old names:

**1. Untyped object literals inside an assertion.** `toStrictEqual({ ...before, source: EJECT_SOURCE })`
is checked against no declared type, so the spread produced `{ id, scope, origin }` and the literal
added a fourth key that no longer exists. A four-key expectation against a three-key actual — the
only two E2E failures the rename caused, at `dual-scope-same-source-plugin.e2e.test.ts:433` and
`:560`. Both were in the same file, in the same shape, and neither was reachable by grepping for a
type name.

**2. Fixture text that impersonates generated output.** `config-source-sections.test.ts` builds a
config.ts as a template string to feed a section extractor. Nothing types it, and the extractor
keys only off `const skills:` / `];` / `// global` / `// project`, so the six skill entries inside
it kept `source: "eject"` and every assertion stayed green. The fixture now models a config.ts that
the writer does not emit and the loader would refuse.

**3. Prose and option names.** About thirty comments, JSDoc blocks and one assertion message still
name `source` as a field of `SkillConfig` or `ProjectConfig` — including
`mixed-mode-skill-ref-format.e2e.test.ts:35`, which documents "the canonical `s.source !== "eject"`
predicate" that production spells `s.origin`. Four helpers keep an option literally named `source`
that now writes or reads a differently-named field:

| Helper                                                                                          | Option   | What it actually does                 |
| ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------- |
| `ProjectBuilder.editable` / `pluginProject` / `localProjectWithMarketplace` / `withCustomSkill` | `source` | writes `config.marketplace`           |
| `expectPhaseSuccess` / `expectFullInstallation`                                                 | `source` | forwards to `toHaveConfig`            |
| `toHaveConfig`                                                                                  | `source` | substring-searches the config.ts text |
| `expectFullConfig` (unit)                                                                       | `source` | asserts `config.marketplace`          |

`PluginProjectOptions` is the sharp edge: it takes BOTH `marketplace` (which becomes
`config.marketplaceName` and each skill's `origin`) and `source` (which becomes
`config.marketplace`). A reader who trusts the option names gets both fields exactly backwards.

Separately and predating the rename, `toHaveConfig`'s `source` check is
`content.includes(expectations.source)` — a substring scan of config.ts text with no key. Roughly
sixty specs reach it, through `expectPhaseSuccess` and directly. `toHaveConfig({ source: "eject" })`
passes if the seven characters appear anywhere in the file, including inside a comment or another
field's value. The rename did not degrade it, but it means the largest surviving family of
`source:` occurrences in `e2e/` proves considerably less than its name suggests.

## Fix Applied

- `dual-scope-same-source-plugin.e2e.test.ts:433` and `:560` — `source: EJECT_SOURCE` corrected to
  `origin: EJECT_SOURCE`. The product was right and the expectation was wrong; the file's other
  assertions in the same tests already read `.origin`.
- `config-source-sections.test.ts` — the six fixture skill entries now spell `origin`, matching what
  `generateConfigSource` emits. The extractor ignores the key, so nothing about what the eight
  specs prove changed; the fixture is simply no longer a config the loader would reject.
- `config-scope-integrity.e2e.test.ts:145` — the assertion message read
  `` `skill  must keep source "eject"` `` while asserting `entry.origin`. Now
  `` `skill ${entry.id} must keep origin "eject"` ``. The double space was a lost interpolation
  that predates the rename; restoring the id makes a failure name which entry failed.

Not fixed, deliberately: the prose sweep and the helper option names. Thirty-odd comment edits
across twenty-five files is a sweep, and the standing instruction is to compile sweep findings and
root-cause them with the owner rather than patch first. The option renames are a larger call still
— see below.

## Proposed Standard

**Rename procedure.** `CLAUDE.md` already says "ALWAYS grep for the old value when changing test
data or renaming anything". The gap is that it does not say what to grep, and a field rename has
four distinct surfaces, only two of which any tool checks:

1. typed positions — `tsc` finds these;
2. persisted-key positions — the Zod rename guard finds these;
3. untyped assertion literals (`toStrictEqual({ ...x, key: v })`), fixture template strings, and
   assertion messages — nothing finds these, and they are the ones that broke;
4. prose and helper option names — nothing finds these, and they are the ones still wrong.

The rule that would have caught this pass: after a field rename, grep the OLD name across
`e2e/` and `src/` and account for every hit, because a green `tsc` proves only that surface 1 is
done. Worth stating in `.ai-docs/standards/clean-code-standards.md`.

**Assertion honesty.** Two rules for `.ai-docs/standards/e2e/assertions.md`:

- A helper option that carries a config field's value is named for the field it writes or reads.
  An option named `source` that sets `marketplace` is a lie the type checker cannot catch, and it
  is what makes surface 4 above accumulate. Renaming `ProjectBuilder`'s `source` to `marketplace`
  and `PluginProjectOptions.marketplace` to `marketplaceName` would touch roughly twenty-five e2e
  files, all mechanically; `expectPhaseSuccess` / `toHaveConfig` / `expectFullConfig` would touch
  about sixty call sites. That is a real cost and the reason this is a proposal rather than a diff,
  but the two option sets currently disagree with the config in opposite directions, which is worse
  than either name alone.
- A matcher that claims to check a config field checks the field, not the file. `toHaveConfig`
  already receives a directory it could load structurally — `loadProjectConfigFromDir` is what
  `e2e/fixtures/dual-scope-helpers.ts` uses, and its `.origin` assertions are typechecked precisely
  because it does. A substring scan cannot distinguish `marketplace`, `marketplaceName` and a
  skill's `origin` when all three hold the same marketplace name, which is exactly the case in every
  plugin-mode spec that calls it.
