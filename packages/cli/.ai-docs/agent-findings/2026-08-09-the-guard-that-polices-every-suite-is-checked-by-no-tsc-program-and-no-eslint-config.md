---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/vitest.global-setup.ts
  - packages/cli/vitest.config.ts
  - packages/cli/tsup.config.ts
  - packages/cli/tsconfig.json
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-09
reporting_agent: cli-developer
category: typescript
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-460 — the scan moved to src/cli/lib/testing/dist-staleness.ts (owner ruling 2026-08-09,
  "Move to src"), where the existing tsc program, eslint config and unit suite all reach it.
  vitest.global-setup.ts is now a three-line caller, and neither candidate mechanism proposed
  below was taken.
---

## What Was Wrong

`packages/cli/tsconfig.json` declares `"include": ["src/**/*"]`. `tsconfig.scripts.json` covers
`scripts/`, `e2e/tsconfig.json` covers `e2e/`. Nothing covers the package-root config files, and
`bun run typecheck` is exactly those three programs — so `vitest.global-setup.ts`,
`vitest.config.ts`, `tsup.config.ts` and their siblings are in **no** tsc program.

ESLint does not reach them either. Measured this session, from `packages/cli`:

```
$ npx eslint vitest.global-setup.ts vitest.config.ts tsup.config.ts
  0:0  warning  File ignored because no matching configuration was supplied   (×3)
```

`bun run lint` (`eslint .`) is clean and always will be for these files — a file matched by no
`files` block is not linted, it is skipped. Prettier is the only gate any of them passes, and
Prettier checks formatting, not meaning.

What makes this worth a finding rather than a shrug is which file it is.
`vitest.global-setup.ts` is the un-bypassable half of the freshness rule (clean-code-standards
6.19) — the thing that stands between the whole suite and a false green. It is written in
TypeScript, it carries types (`BuildInputTree`, `ScannedTree`, an `as const satisfies`), it grew
during CLI-457 and grew again during CLI-458, and a type error in it would surface only at runtime,
if at all: Vitest transpiles it with esbuild, which strips types without checking them. **The one
file whose job is to stop a green that means nothing is itself checked by nothing.**

Verified rather than assumed. Adding a fourth program covering only that file reports zero errors
today, so this is a missing gate and not a hidden defect:

```
$ cat > tsconfig.cli458-check.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["vitest.global-setup.ts"] }
EOF
$ npx tsc -p tsconfig.cli458-check.json --noEmit ; echo $?
0
```

## Fix Applied

None at discovery, and deliberately so. CLI-458's ground was the guard, the turbo config and
`packaging.test.ts`; a fourth tsc program (or an ESLint `files` entry) for every workspace's root
config files is a repository-wide decision with its own blast radius, not a line to slip into an
unrelated change. The temporary config above was deleted immediately after it was measured.

**Resolved on 2026-08-09 by CLI-460, by a third mechanism neither proposal below anticipated: move
the code instead of extending the gates.** The scan, the comparison, `BUILD_INPUT_TREES` and every
message now live in `src/cli/lib/testing/dist-staleness.ts`, whose only export is
`assertDistIsFresh(cliRoot)`; `vitest.global-setup.ts` resolves its own directory as the package
root and calls it. Nothing about the gates changed — `tsconfig.json` still includes `src/**/*` and
`eslint.config.js` still matches `src/**/*.ts`, so the logic simply walked into all three existing
programs, and a new `dist-staleness.test.ts` (14 cases over a fixture tree shaped like the
repository) covers the behaviour the type system cannot state.

Both halves were measured rather than assumed. A deliberate type error in the new module
(`const x: number = DIST_DIR`) fails `tsc --noEmit`; a deliberate unused type-aware violation fails
`eslint` with `no-unused-vars` **and** `no-unnecessary-condition`, which is the type-checked layer
reporting, so the file is in a real program rather than merely parsed. Both were then removed and
both gates re-run clean.

What this does **not** close: the hole itself is unchanged for every other package-root file.
`npx eslint vitest.global-setup.ts` still answers _"File ignored because no matching configuration
was supplied"_, and `vitest.config.ts`, `tsup.config.ts` and their siblings in every workspace are
still in no tsc program. What changed is that no load-bearing logic is standing in that hole here.
The scope note below still applies to anyone who wants the general fix.

## Proposed Standard

Two candidate mechanisms, neither costed here:

1. **A fourth tsc program.** `tsconfig.configs.json` extending `tsconfig.json` with
   `"include": ["*.config.ts", "vitest.global-setup.ts"]`, appended to the `typecheck` script.
   Matches how `scripts/` and `e2e/` were brought in on 2026-08-08 (REPO-33) — the same argument
   applies, and that ruling's reasoning ("make the claim true rather than correct it") applies
   here too. Note the checks in `deps:check` compare each workspace's `tsconfig.json` against the
   shared config; a new sibling program should be considered against that convention first.
2. **An ESLint `files` entry** for package-root configs. Cheaper, but it buys lint rules and not
   type checking, and type checking is what is missing.

Whichever lands, the rule belongs in `.ai-docs/standards/clean-code-standards.md` § 6 beside 6.19,
because it is the same argument one level up: **a gate that is not itself gated is a claim, not an
enforcement.** State it as: any file that polices a suite is source code, and is covered by the same
`typecheck` and `lint` gates as the code it polices.

Scope note for whoever picks this up: the same hole exists in every workspace that keeps a
`vitest.config.ts` or equivalent at its root, so the fix is a monorepo-layout decision rather than a
CLI one. See `reference/monorepo-layout.md` -> "A workspace that stands apart records it in its own
package.json".
