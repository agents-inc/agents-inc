---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/configuration/config-loader.ts
standards_docs: []
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  `unwrapDefaultExport` now asks whether the module has a `default` key rather than whether its
  value is defined. Pinned by config-loader.test.ts ("returns null for a default export of
  undefined/void 0", "reads no named export as the config when the default export is undefined"),
  and by the build marketplace refusal in marketplace.test.ts and build.e2e.test.ts.
---

## What Was Wrong

`unwrapDefaultExport` in `config-loader.ts` took the default export only when
`namespace.default !== undefined`, and otherwise returned the whole module namespace. A config
reading `export default undefined;` or `export default void 0;` evaluates to `{ default: undefined }`
(plus a non-enumerable `__esModule`). The namespace has one key, so `exportsNothing` said no;
`'default' in namespace` is true, so `declaresNoDefaultExport` said no; and the schema parsed the
namespace itself. `projectSourceConfigSchema` strips unknown keys, so the result was a declared
empty config `{}`, and `build marketplace` built silently over a file that declares nothing. With a
named export beside it (`export const skillsDir = …; export default undefined;`) the named binding
was read as the config's field.

Every reader of `loadConfig` shared it. After the fix each treats the file as it already treats an
empty one: the build refuses with the marketplace refusal, an installation config is refused as
"the file has no valid default export", `loadStacks` reads no stacks, the skill-categories and
skill-rules loaders refuse, and doctor's source validation reports "Config is empty".

## Fix Applied

`"default" in namespace` replaces `namespace.default !== undefined`. Measured with jiti under node
and under bun, a module with only named exports has no `default` key and CommonJS
`module.exports = {…}` has none under node, so neither path changes.

## Proposed Standard

None. A presence question asked of a value is the defect; `in` (or `Object.hasOwn`) asks the
question the comment above the function states.
