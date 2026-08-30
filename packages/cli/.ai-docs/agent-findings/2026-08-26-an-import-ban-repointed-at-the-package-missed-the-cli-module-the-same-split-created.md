---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/eslint.config.js
  - packages/cli/src/cli/lib/configuration/config-types-io.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-26
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `**/config-types-io` and `**/config-types-io.js` added to the second
  `CONFIG_WRITER_IMPORTS` group in `packages/cli/eslint.config.js`, with a
  comment stating that the group names the DECLARING module and not only the
  ones re-exporting it. Reproduced before and after with `eslint --stdin`;
  `npx eslint .` clean in both `packages/cli` and `packages/compile`.
---

## What Was Wrong

`CONFIG_WRITER_IMPORTS` in `packages/cli/eslint.config.js` refuses four renderer symbols outside
`config-gate/**` and `configuration/**`. Its second group named
`**/config-types-writer`, `**/config-types-writer.js` and
`@workspace/compile/config-types-source`, and banned three names from them, one of which is
`regenerateConfigTypes`.

The `@workspace/compile` extraction moved that function's DECLARATION to a module none of those
three patterns match:

```
$ grep -rn 'export async function regenerateConfigTypes' packages/cli/src packages/compile/src
packages/cli/src/cli/lib/configuration/config-types-io.ts:99:export async function regenerateConfigTypes(
```

So an arbitrary CLI module could reach the writer by importing it from where it lives. Reproduced
from `packages/cli`, before the fix — the ban does not fire:

```
$ printf 'import { regenerateConfigTypes } from "./configuration/config-types-io.js";\nexport const x = regenerateConfigTypes;\n' \
  | npx eslint --stdin --stdin-filename src/cli/lib/exit-codes.ts
(no output)
```

The same probe naming the facade instead is refused, which is what makes the hole invisible — the
rule looks like it is working:

```
$ printf 'import { regenerateConfigTypes } from "./configuration/config-types-writer.js";\n...' | npx eslint --stdin ...
  1:10  error  'regenerateConfigTypes' import from './configuration/config-types-writer.js' is restricted ...
```

**The sharp part is who created the gap.** `config-types-io.ts` exists BECAUSE of
`2026-08-26-a-re-export-facade-unbinds-every-gate-keyed-on-a-modules-path.md`: that finding
diagnosed the class exactly — _"a gate keyed on a module's PATH is keyed on where a symbol is
declared, not on where it is read from"_ — and the split was made so a documentation binder could
bind to a PURE facade again. The finding names `config-types-io.ts` in its own prose, in the
paragraph proposing a census command that would have found this, and the ban was not run through
it. A remedy that moves a declaration is itself an instance of the class it is remedying.

No production site used the hole, so it was silent in exactly the way that finding warns about:
a `group` that matches nothing reports nothing, and `linterOptions.reportUnusedDisableDirectives`
sees only directives, never patterns.

## Fix Applied

Both spellings of the declaring module added to the group, beside the two facade spellings and the
package subpath, with the reason on the line. Keeping the facade patterns is deliberate and was
already B1.5's stated principle: a re-export must not become the bypass, so the ban names every
specifier the symbol is reachable through, not only the one it is declared in.

Census of the other three banned names, run rather than assumed — each is declared in a module the
group already matches, so this was exact at one:

```
$ for s in generateConfigSource generateConfigTypesSource assembleConfigTypesSource regenerateConfigTypes; do
    grep -rn "export \(async \)\?function $s" packages/cli/src packages/compile/src --include='*.ts' | grep -v test
  done
packages/compile/src/config-source.ts:325:export function generateConfigSource(
packages/compile/src/config-types-source.ts:313:export function generateConfigTypesSource(
packages/compile/src/config-types-source.ts:147:export function assembleConfigTypesSource(
packages/cli/src/cli/lib/configuration/config-types-io.ts:99:export async function regenerateConfigTypes(
```

## Proposed Standard

The predecessor's census command is the right remedy and is still unlanded; this finding adds one
line to it rather than a new rule. Into `.ai-docs/standards/briefing.md`, beside "name the files
each lane owns":

> **A path-keyed gate is repointed at the module that DECLARES the symbol, and the old paths stay.**
> When a change moves a declaration — an extraction, a facade, a split — run the census before
> landing it, and run it for the module the change CREATES as well as the one it empties. The
> emptied module is the one everybody remembers; the new one has no history to prompt anybody.

Two things this does not propose. Not a checker: the predecessor already argued the seven gates
share a path string rather than a construct, and nothing here changes that. And not a rule against
keeping the facade patterns — an import ban is a list of specifiers, and dropping a stale-looking
one is how a re-export becomes the bypass.

**What would catch a regression of this specific instance:**
`src/cli/lib/configuration/__tests__/config-writer-import-ban.test.ts` drives `eslint --stdin`
over probe sources and already covers the package subpath and the CLI facade for
`generateConfigSource`. It has no probe for `config-types-io`, so nothing mechanically holds the
line this finding restored. That spec is a test file and was not edited here; the change wanted in
it is stated in the developer's report.
