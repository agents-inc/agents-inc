---
type: standard-gap
severity: low
affected_files:
  - src/cli/commands/doctor.ts
  - src/cli/hooks/init.ts
standards_docs:
  - CLAUDE.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-30
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: CLAUDE.md -> "Code Conventions" -> **Exports** bullet now carries the exception, naming oclif commands (`src/cli/commands/**`), oclif hooks (`src/cli/hooks/**`) and tool configs (`*.config.*`, plus `e2e/global-setup.ts`). Proposed Standard item 2 stays advisory — the rule was deliberately not added to `eslint.config.js`. Item 1's second half (`clean-code-standards.md` § 13.2) is NOT landed; see "Resolution" below.
---

## What Was Wrong

In plain terms: the codebase has a blanket "no default exports" rule, but the CLI framework it is
built on requires default exports in nineteen files. The rule as written cannot be true.

`CLAUDE.md` -> "Code Conventions" and `clean-code-standards.md` § 13.2 both state it without
qualification:

> **Exports:** Named exports only (no default exports).

Measuring the repo against that rule (an ESLint `no-restricted-syntax` selector on
`ExportDefaultDeclaration`, run during the ESLint adoption on 2026-07-30) returns **19 hits — and
every one of them is mandatory**:

| Count | Location                                         | Why the default export is required                                |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 16    | `src/cli/commands/**` (`export default class …`) | oclif discovers commands by importing the module's default export |
| 1     | `src/cli/hooks/init.ts` (`export default hook;`) | oclif's `hooks.init` entry in `package.json` resolves the default |
| 2     | `e2e/vitest.config.ts`, `e2e/global-setup.ts`    | Vitest config and `globalSetup` are default-export contracts      |

There are **zero** discretionary default exports. The rule is 100% obeyed everywhere the author has
a choice, and 0% obeyable everywhere they do not.

Why this matters now rather than in the abstract: `import/no-default-export` (or the equivalent
`no-restricted-syntax` selector) is an obvious candidate for the ESLint config added on 2026-07-30,
and it appears on the shortlist of "CLAUDE.md rules that are mechanically enforceable". Enabling it
repo-wide would produce 19 errors whose only "fix" is to break command discovery — an agent
burning down a lint baseline would convert working oclif commands into commands oclif cannot find,
and the failure surfaces at runtime, not at `tsc`.

## Fix Applied

None — discovery only. The rule was deliberately **not** added to `eslint.config.js`; the initial
rule set was kept to the stock `js.configs.recommended` + `tseslint.configs.recommended` presets.

## Proposed Standard

1. **Qualify the rule where it is stated.** In `CLAUDE.md` -> "Code Conventions" and
   `clean-code-standards.md` § 13.2, change "no default exports" to name the exception explicitly:

   > **Exports:** Named exports only. The sole exceptions are framework contracts that resolve a
   > module's default export — oclif commands (`src/cli/commands/**`), oclif hooks
   > (`src/cli/hooks/**`), and tool config files (`*.config.ts`, Vitest `globalSetup`). Everywhere
   > else, a default export is a defect.

   A rule with an undocumented exception teaches agents that the rule is approximate. Naming the
   exception makes the remaining 100% of cases enforceable.

2. **If the rule is ever added to `eslint.config.js`, scope it**, and scope it by directory rather
   than by per-file `eslint-disable` comments:

   ```js
   {
     files: ["src/**/*.ts", "src/**/*.tsx"],
     ignores: ["src/cli/commands/**", "src/cli/hooks/**"],
     rules: { "no-restricted-syntax": ["error", { selector: "ExportDefaultDeclaration", ... }] },
   }
   ```

   Nineteen disable comments would be nineteen chances to place one on the wrong line — see
   `2026-07-30-eslint-disable-directives-were-never-verified.md` for what that costs.

3. **General principle worth stating once:** before a documented convention is promoted to a lint
   rule, measure it against the repo. A rule whose violations are all framework-mandated is not a
   rule the codebase is failing — it is a rule missing a clause.

## Resolution

Landed in `CLAUDE.md` -> "Code Conventions" -> **Exports**. Two corrections found while verifying the
numbers above, both recorded here rather than silently edited into the table:

1. **19 is the in-scope count, not the repo-wide one.** ESLint only lints
   `["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts"]`, so the selector never saw the
   four root-level tool configs: `vitest.config.ts`, `tsup.config.ts`, `eslint.config.js`,
   `prettier.config.mjs`. Repo-wide the real total is **23** (16 commands + 1 hook + 6 tool configs),
   excluding `export default` occurrences inside template strings (e.g. generated `config.ts` bodies
   in `e2e/fixtures/project-builder.ts`, `src/cli/lib/configuration/config-writer.ts`). The finding's
   central claim is unaffected: all 23 are framework-mandated, zero are discretionary.

2. **"oclif discovers commands by the default export" is overstated for @oclif/core 4.8.0.** With
   `"strategy": "pattern"` (this repo's `package.json` -> `oclif.commands`), `searchForCommandClass`
   in `node_modules/@oclif/core/lib/config/plugin.js` falls through to
   `Object.values(cmd).find((cmd) => typeof cmd.run === 'function')`, and `Config.runHook` has the
   same three-tier search. Probing the built `dist/commands/search.js`, a named-only export still
   resolves. So converting a command to a named export would likely _not_ break today — but the
   fallback is undocumented, scans sibling exports (`src/cli/commands/new/skill.ts` has four
   alongside its default class) and takes the first match, so it is a coincidence to rely on, not a
   contract. The hard requirement is on the tool configs: Vite/Vitest reads the config off
   `module.default` with no fallback at all, so a named export loads as an empty config.

Still open: `clean-code-standards.md` § 13.2 ("No default exports. Use named exports only.") remains
unqualified. `.ai-docs/standards/` is the convention-keeper's domain, so it was deliberately left
untouched — that half of Proposed Standard item 1 needs a separate pass.
