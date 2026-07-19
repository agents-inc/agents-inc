---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/plugins/plugin-manifest.ts
  - src/cli/lib/marketplace-generator.ts
  - src/cli/lib/skills/generators.ts
standards_docs: []
date: 2026-07-19
reporting_agent: main-session (expressive-typescript Pass 6)
category: complexity
domain: cli
root_cause: missing-rule
status: resolved
---

# Post-construction conditional mutation on objects that get serialized

## What happened

Three independent builders constructed a base object literal and then appended
optional fields by mutation (`if (options.description) manifest.description = …`,
`entry.domain = domain`, `marketplace.owner.email = …`). The shape recurred in
`generateSkillPluginManifest`/`generateAgentPluginManifest`/`generateStackPluginManifest`
(+ `buildAuthor`), `generateMarketplace`, and `buildCategoryEntry` — all of whose
outputs are serialized verbatim (`JSON.stringify`) into `plugin.json`,
`marketplace.json`, and `skill-categories.ts`.

## The anti-pattern

Trailing conditional mutation hides two things: (1) the object's complete final
shape — a reader must scan every subsequent statement to know what fields can
exist; (2) the serialized key order — for emitted files, insertion order IS the
file's byte layout, and mutation order encodes it invisibly at a distance.

## The fix

Single object literal with positioned conditional spreads:

```ts
return {
  name,
  version: options.version ?? DEFAULT_VERSION,
  skills: "./skills/",
  ...(options.description ? { description: options.description } : {}),
  ...(author ? { author } : {}),
  ...(options.keywords?.length ? { keywords: options.keywords } : {}),
};
```

The spread's position in the literal preserves the exact key order the old
mutation sequence produced (verified byte-identical for the emitted files; the
established idiom already used by `ensureMinimalConfig` and
`generateProjectConfigFromSkills`).

## Rule to extract

When a function returns an object that is (or may be) serialized, build it as
ONE literal with conditional spreads at the position the field must serialize
at — never construct-then-mutate. If a conditional field must serialize after
unconditional ones, the spread goes there; the literal is the file layout.
