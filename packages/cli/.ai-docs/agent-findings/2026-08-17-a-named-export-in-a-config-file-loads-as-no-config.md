---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/configuration/config-loader.ts
  - packages/cli/src/cli/lib/source-validator.ts
  - apps/www/src/content/docs/docs/guides/creating-a-marketplace.md
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  `loadConfig` now imports the module NAMESPACE rather than asking jiti to unwrap it, so the fact
  the diagnostic needed survives the load. An ES module carrying exports but no `default` raises
  `ConfigDefaultExportError`; a file exporting nothing at all still returns `null`.
  `validateTsConfig` reports the two apart — "Config has no default export" and "Config is empty" —
  and the spec that could not tell them apart now asserts each message by name, with a third case
  pinning that a real default export with a bad shape still names the field. The requirement is
  stated beside the filenames in `reference/features/skills-and-matrix.md`.
---

# A named export in a marketplace config file loads as no config, and the error blames the wrong field

## What is wrong

`loadConfig` calls `jiti.import(path, { default: true })`. A config module that exports a named
binding instead of a default yields the module NAMESPACE — `{ skillRules: {...} }`, not the config
— which then fails the schema on whichever field it names first. So the loader reports the file as
failing validation rather than as having no default export. (The mechanism is jiti's
`interopDefault`; see "What remains" for the verification.)

For `config/skill-rules.ts` the result is:

```
[ERROR] config/skill-rules.ts: Failed to load config/skill-rules.ts: Config validation
  failed at '.../config/skill-rules.ts': version: Invalid input: expected string, received undefined
```

The file has a `version`. The author is told it does not, in a file where they can see it, so the
search starts in the wrong place and the actual requirement — `export default` — is never mentioned.

## Why it reaches authors

The default-export requirement is real and load-bearing, and it is stated nowhere an author looks.
It is not in the authoring guide's file list, not in the error, and not in any standard describing a
marketplace's config files. It is visible only in `config-loader.ts`'s call.

The published authoring guide instructed the broken form directly — `export const skillRules = …` —
so an author following the documentation correctly produced a marketplace that would not load, and
the diagnostic pointed away from the cause. That is the shape recorded in
[`2026-08-16-the-authoring-guide-promised-a-validator-that-did-not-exist.md`](./2026-08-16-the-authoring-guide-promised-a-validator-that-did-not-exist.md):
documentation that misleads is worse than none, because it turns reading the docs into the thing that
hides the defect.

## What has been fixed

The guide now shows `export default { version: "1.0.0" }`, and `new marketplace` scaffolds all three
`config/` files as default exports, with an e2e spec pinning that. A scaffolded marketplace cannot
meet this.

## What was left, and how it closed

The three halves below were open when this finding was written. Each is described as it was found;
the mechanism that closed them is in `resolved_by`. The jiti behaviour recorded here is the reason
the fix had to move into the loader — it is not something `source-validator.ts` could ask on its own
without a second evaluation of the file.

One correction to the verification below, established by re-running it against jiti 2.4.2: a
CommonJS config (`module.exports = {...}`) also arrives as an object with no `default` key, so
"namespace with no default" alone would refuse a file that loads correctly today. The `__esModule`
marker jiti's transform emits is what separates the two, and it is what the loader tests.

## What remained

**The diagnostic still misattributes, and the branch written to fix it cannot fire.**
`source-validator.ts`'s `validateTsConfig` returns `"Config has no default export"` when
`loadConfig` returns `null`, on a JSDoc claim that "a returned `null` means the module has no
default export (named-only modules surface here)". That claim is false, and so the branch is dead
for the case it names.

**`loadConfig` does not know which case it is in.** It asks jiti for `{ default: true }` with
`interopDefault: true`, and **jiti returns the whole module namespace when there is no default
export** — not `undefined`. Verified directly against the installed jiti with a named-export-only
module:

```
import { createJiti } from "jiti"
createJiti(cwd, { interopDefault: true })
  .import("<file exporting only `export const skillRules = {...}`>", { default: true })
// -> { skillRules: { version: "1.0.0" } }   // an object, not undefined
```

So `raw` is non-null and non-empty, `loadConfig`'s `raw == null || Object.keys(raw).length === 0`
guard passes it through, and the module namespace is handed to `schema.safeParse` — which reports
whichever field the schema names first as missing. That is the original message, unchanged. The
`null` return is reachable only for an EMPTY file, which is what the guard's own comment describes.

**The test that covers this cannot tell the two messages apart.** `source-validator.test.ts` →
"should report error when config/stacks.ts has no default export" writes
`export const stacks = {};` and asserts `stacksErrors.length > 0`. Both the intended message and
the misattributing one satisfy that, so the spec is green either way and reads as a guard for a
behaviour it does not pin.

**Nothing states the requirement.** Wherever a marketplace's config files are described — the
authoring guide's file list, and `.ai-docs/reference/features/skills-and-matrix.md`, which is the
reference doc that owns marketplace structure and names all three `config/` files without
mentioning it — the sentence "each of these exports its value as the module's default" belongs
beside the filename. A rule enforced by a loader flag and documented nowhere is a rule an author
meets only by failing.
