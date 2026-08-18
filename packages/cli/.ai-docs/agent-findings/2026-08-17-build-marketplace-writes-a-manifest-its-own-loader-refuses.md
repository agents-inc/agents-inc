---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/commands/build/marketplace.ts
  - packages/cli/src/cli/lib/marketplace-generator.ts
  - packages/cli/src/cli/lib/loading/source-loader.ts
  - packages/cli/src/cli/lib/schemas.ts
date: 2026-08-17
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

# `build marketplace` writes a manifest its own loader refuses, and exits 0

## What is wrong

A `package.json` with no `author` produces a `marketplace.json` the CLI cannot read, and the build
reports success.

The chain: `parseAuthor` warns and yields nothing → `generateMarketplace` writes
`owner: { name: "" }` → the build exits 0 and the file lands on disk. But `marketplaceOwnerSchema` is
`pluginAuthorSchema`, which requires `name.min(1)`, so `fetchMarketplace` throws on that same file.
`resolveMarketplaceLabels` catches the throw, logs `Marketplace has no marketplace.json — using its
ref as the label`, and returns no marketplace at all.

One producer and one consumer in the same package disagree about whether a field may be empty, and
the disagreement is resolved by a `catch` that reports the file as absent rather than as invalid.

## Why it is worse than a validation gap

The consumer's first symptom arrives far from the cause. A plugin-mode install dies with:

```
Cannot install plugin skills: marketplace could not be resolved from '<path>'
```

That message names neither `marketplace.json` nor `owner.name`, and the file it is complaining about
exists and looks reasonable. An author reading it has no path back to a missing `author` field in
`package.json` — a file the message does not mention either.

The swallow is what makes it unrecoverable by inspection: "has no marketplace.json" is false, and a
reader who checks will find the file exactly where the message says it is not.

## The posture the same command already takes two functions away

`validateSkillIdNamespace` refuses to write when a skill id is outside its namespace, and the
authoring guide states the rule as **"a refused build writes nothing, so a marketplace that would
break on someone else's machine never gets published in the first place."** An empty owner name is
that same class of defect — a manifest that breaks on the next machine — and it is written anyway.

## Two fixes, and they are not alternatives

1. **`build marketplace` refuses an empty owner name at write time**, in the shape the namespace
   guard already uses: name the field, name the file it comes from (`package.json`'s `author`), write
   nothing.
2. **`resolveMarketplaceLabels` stops reporting a parse failure as an absence.** A
   `marketplace.json` that exists and fails to validate is a different condition from one that is not
   there, and the message must distinguish them. Today every schema violation in that file — not only
   this one — surfaces as "has no marketplace.json".

The first stops this instance being created. The second stops the whole class being undiagnosable,
including manifests this CLI did not write.

## Where it was found

Hand-running `new marketplace`'s scaffold end to end. The scaffold now writes an author derived from
the name the author typed, so a scaffolded marketplace never meets this — the exposure is closed and
the defect is not.
