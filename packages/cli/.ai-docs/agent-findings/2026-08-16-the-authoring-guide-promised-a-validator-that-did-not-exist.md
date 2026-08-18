---
type: convention-drift
severity: medium
affected_files:
  - apps/www/src/content/docs/docs/guides/creating-a-marketplace.md
  - packages/cli/src/cli/commands/build/marketplace.ts
  - packages/cli/src/cli/lib/marketplace-generator.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The validator the guide described now exists. `validateSkillIdNamespace` and
  `validateMarketplaceName` in `src/cli/lib/marketplace-generator.ts` are called from
  `build marketplace`, which refuses a foreign skill id naming the id it expected and
  refuses the three reserved names. The guide's third claim (reserved names) is still
  undocumented on the web side and is named under Proposed Standard.
---

## What Was Wrong

`apps/www/src/content/docs/docs/guides/creating-a-marketplace.md` told marketplace authors, in
the present tense, that the tool enforced the namespace rule:

> `build marketplace` enforces this — a skill whose id does not carry the prefix fails the build
> with the id it expected, rather than shipping a marketplace that breaks on someone else's
> machine.

Nothing enforced it. `build marketplace` resolved a kebab-case marketplace name from `package.json`,
ran `validateKebabCaseName` over a `--name` override, and then emitted every plugin manifest it
found under that name without ever comparing the two. An author who read the guide, followed the
convention for most of their skills and slipped on one would get a clean exit 0, a written
`marketplace.json`, and a collision that surfaces on a consumer's machine at install time — the
exact failure the paragraph promised protection from.

The two halves are worth separating. A convention with no validator is a known cost. A convention
with **documentation asserting a validator that does not exist** is worse than an undocumented one,
because it converts the author's correct behaviour (reading the docs, trusting them) into the thing
that hides the defect. The prose is not aspirational in tone; it is indistinguishable from a
description of shipped behaviour, which is what `documentation-bible.md`'s governing rule — a
document describes the current state of the app — exists to guarantee.

Two related gaps found in the same pass:

1. The guide states the `agents-inc` exception ("its skills are unprefixed, so `agents-inc` is the
   implicit namespace and is not available to anyone else") but never mentions `external` or
   `local`, which the same ruling reserves. An author can still read the whole guide and choose a
   name the build now refuses.
2. The public catalogue itself builds with `--name agents-inc` from a `package.json` named
   `@agents-inc/skills`. Enforcing "reserved" and "unprefixed ids" naively would have stopped the
   real catalogue building — so the guide's own exception sentence was the only record that the
   catalogue needs one, and it names no mechanism for granting it.

## Fix Applied

The validator now exists and the guide's claim is true.

- `validateSkillIdNamespace(marketplace)` refuses any plugin whose name does not begin with
  `<marketplace-name>-`, listing each offending id beside the id it should have carried.
- `validateMarketplaceName(marketplaceName, packageName)` refuses `agents-inc`, `external` and
  `local`, with one exemption: the marketplace name `agents-inc` is available to the package
  `@agents-inc/skills` and to nothing else. The prefix rule reads its exemption off the resolved
  name, which is safe only because the name check runs first — the coupling is documented at both
  functions.
- Both refuse before `writeMarketplace`, so a rejected build leaves no `marketplace.json` behind.

Verified against the real catalogue: 238 plugins with unprefixed ids build to exit 0 under
`--name agents-inc`; the same 238 plugin directories with `package.json` renamed to
`@evilcorp/skills` are refused and write no file.

## Proposed Standard

Two rules, both narrow:

1. **`.ai-docs/standards/documentation-bible.md` — the current-state rule needs a stated
   consequence for the consumer-facing docs under `apps/www/src/content/docs/`.** The rule is
   written for `.ai-docs/`, whose readers are agents that will read the source anyway. The web
   guides are read by marketplace authors who cannot check, and a false claim there is a defect in
   the product, not in a note. Suggested wording: a guide sentence asserting that a command
   _refuses_, _validates_ or _enforces_ something must name the command and must be traceable to a
   call site; if the behaviour is intended but unbuilt, the sentence is written in the future tense
   and carries the tracker row.

2. **`apps/www/src/content/docs/docs/guides/creating-a-marketplace.md` — add the reserved names.**
   The "Name your skills for your marketplace" section documents `agents-inc` as an exception but
   not as a refusal, and says nothing about `external` or `local`. An author meets those two only
   as a build error. One sentence beside the existing exception paragraph closes it. Out of scope
   for this pass: the file is in another workspace.
