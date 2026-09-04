## Output Format

<output_format>

Write the skill to disk as a directory, then report each file you wrote.

### Directory

**The directory name is the skill id** — the string the config, the matrix and every agent's skill
list refer to. It takes the shape `{domain}-{group}-{technology}` and lands at
`<project>/.claude/skills/<id>/` for a project skill, `~/.claude/skills/<id>/` for a global-scope
one, or `src/skills/<id>/` in a marketplace source repository.

```
<id>/
├── SKILL.md          the decision layer — loaded whole when the skill is invoked
├── metadata.yaml     the catalogue entry
├── reference.md      comparison tables, API lookup and migration notes
└── examples/
    ├── core.md       the essential patterns, in full
    └── {topic}.md    one per topic the technology splits into naturally
```

**The directory is levels of disclosure, and each costs differently.** `metadata.yaml` and
`SKILL.md`'s frontmatter are read to decide whether the skill applies at all. `SKILL.md`'s body is
loaded whole once it does. `reference.md` and `examples/` stay dormant on disk until something
reaches for them by name.

### metadata.yaml

**Every field is stated rather than derived from the directory name.** `desktop-backend-tauri`
carries slug `tauri-backend` and `api-database-drizzle` carries category `api-orm`, so reading a
field off the id gives the wrong answer for a real share of the catalogue. `category`, `slug`,
`author`, `displayName`, `cliDescription` and `usageGuidance` are required by
`packages/cli/src/schemas/metadata.schema.json`, and `domain` is required by the loader. The schema refuses any
key it does not declare, which is why there is no `version` and no `tags` — and why `custom`,
which it does declare, is available below.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas/metadata.schema.json
category: [one of the values enumerated in metadata.schema.json]
slug: [a catalogue slug, or any kebab-case name when custom: true is set]
domain: [ai | api | cli | desktop | infra | meta | mobile | shared | web]
author: "@[handle]"
displayName: [30 characters or fewer]
cliDescription: [60 characters or fewer]
usageGuidance: >-
  [The conditions under which an agent should load this skill, named specifically]
```

**Which schema validates the file depends on one field.** For a technology the public catalogue
already carries, `category` and `slug` are closed enums generated from that catalogue by
`packages/cli/scripts/generate-json-schemas.ts`, and the values have to be the catalogue's own. For a technology
it does not carry, add `custom: true`: `validateSkillMetadata` then judges the file by
`customMetadataValidationSchema`, where `category` is any string and `slug` any kebab-case name up
to 50 characters. Writing a new slug without that field is what gets rejected — the field is the
declaration that this skill is not a catalogue entry.

The `$schema` line is `SCHEMA_PATHS.metadata` in `packages/cli/src/cli/consts.ts` for a catalogue
skill, and the custom-metadata path beside it for one declaring `custom: true`; copy the value from
there rather than typing it, in case the address has moved.

### SKILL.md

````markdown
---
name: [the skill id, matching the directory name]
description: [One line — what the skill covers, then the conditions that should load it]
---

# [Technology] Patterns

> **Quick Guide:** [One paragraph. The decisions this skill settles, and the version-specific facts
> that change the answer.]

**Detailed Resources:**

- [examples/core.md](examples/core.md) — [the patterns it carries]
- [examples/{topic}.md](examples/{topic}.md) — [the patterns it carries]
- [reference.md](reference.md) — comparison tables, API lookup and migration notes

---

## Which path applies

[Include this section only where the technology is used in more than one way. Branch on what the
workspace shows and name the file each branch opens, so the branches not taken stay unread.]

- **[The condition the first branch is for]** — [what changes], then follow
  [examples/{topic}.md](examples/{topic}.md).
- **[The second condition]** — [what changes], then follow
  [examples/{other}.md](examples/{other}.md).

---

<critical_requirements>

## Before writing [Technology] code

[The action to take, and what it buys, in one sentence.]

[The second action, and what it buys.]

[The third.]

</critical_requirements>

---

**Auto-detection:** [comma-separated symbols, import paths and phrases that should load this skill]

**Applies to:**

- [A task this skill answers]
- [Another]

**Handled elsewhere:**

- [Adjacent concern, named as a capability rather than as the skill or package that provides it]

---

<philosophy>

[Optional. Why this technology, and the mental model it asks for — include it where the shape of the
tool is non-obvious, and leave it out where the patterns speak for themselves.]

</philosophy>

---

<decision_framework>

[Optional. Comparative "pick X over Y" guidance, where the technology competes with a named
alternative inside its own domain. Every branch ends inside this skill.]

</decision_framework>

---

<patterns>

## Core patterns

### Pattern 1: [Name]

[One or two sentences: what the pattern is, and when it is the right choice.]

```[language]
[3–10 lines showing the shape — the call, the signature, the arrangement. Not a runnable file.]
```

Full code: [examples/core.md](examples/core.md)

### Pattern 2: [Name]

[Same shape, one entry per pattern the technology turns on.]

</patterns>

---

<red_flags>

## Red flags

**Breaks at runtime:**

- [What gets written] — [what it costs] — [what to write instead]

**Surprising behaviour:**

- [The quirk, and the condition that triggers it]

</red_flags>
````

Name the concern rather than the neighbour in "Handled elsewhere" — a skill that points at a
sibling by name couples the two, so a reader who has a different tool for that concern is sent to
the wrong place and the pair have to be updated together.

The requirements appear once, at the top. A closing block repeating them is paid for on every load
and carries nothing the top block does not.

### examples/core.md

**Every skill has this file.** It carries the full runnable code for the patterns `SKILL.md` names,
each under a heading matching the pattern's name there so a link lands on it, with a line at the
top cross-referencing the sibling example files.

### examples/{topic}.md

Split by the technology's own topics rather than by an imposed scheme, and give a topic its own
file once it has enough focused content to stand alone. Read the `examples/` directory of a
published skill with a comparable surface before choosing the split — `api-framework-hono` in the
skills marketplace repository is one worked example.

### reference.md

What a reader consults once the approach is settled and they need a value, a signature or a
migration step.

### Improve mode — differences for the user to decide

Improve mode's deliverable is the differences — one entry for each item the playbook puts in the
user's column:

```markdown
### [Pattern name]

- **Skill says:** [quote or snippet] — in [file], [section]
- **Research says:** [finding] — [source url]
- **Impact:** [what changes, whether it breaks callers, how hard the migration is]
- **Options:** [keep / adopt / hybrid — one line each]
- **Recommendation:** [which, and why]
```

Where the comparison was against the project's own standards rather than an existing skill, the
same entry reads:

```markdown
### [Pattern name]

- **External practice:** [what the research says] — [source url]
- **This project:** [what the standard says] — [file and section]
- **Trade-off:** [what each buys, and what it costs]
- **Recommendation:** [which, and why]
```

Close with the counts: changes made, decisions asked for, patterns added, patterns removed.

---

<research_sources>

## Sources Used

| Source              | URL/Location | What Was Used             |
| ------------------- | ------------ | ------------------------- |
| Official docs       | [url]        | [specific section]        |
| Codebase pattern    | [file path]  | [what pattern]            |
| Best practice guide | [url]        | [specific recommendation] |

</research_sources>

<skill_relationships>

## Relationship Analysis

Relationships are declared centrally rather than in a skill's own metadata. The shipped set lives
in the CLI's `packages/cli/src/cli/lib/configuration/default-rules.ts`; a marketplace source repository can add
its own `config/skill-rules.ts` to extend or override it, and `agents-inc/skills` carries no such
file today. Report the relationships for whichever of the two the skill belongs to:

The four kinds `RelationshipDefinitions` carries, and no others:

**Requires:** [skill-id] — [why this skill needs that one selected first]

**Conflicts with:** [skill-id] — [why selecting one disables the other]

**Discourages:** [skill-id] — [why the pair warns rather than disables]

**Alternatives:** [skill-id, skill-id] — [the purpose they are interchangeable for]

</skill_relationships>

<completion_gate>

## Completion

Report the three completion checks from the playbook and what each returned — the file roster, the
`<red_flags>` grep and the cross-domain scan. State the result even where it was clean, since a
check reported as nothing is indistinguishable from a check not run.

Then name `npx agents-inc doctor` as the command that validates the written skill against the
schema. It is the user's to run rather than this agent's, and it is what turns "the files look
right" into a checked claim.

Close by naming what makes the skill reachable: a written skill is selectable but carried by no
agent until an agent's `stack` entry in the config names it, which `npx agents-inc edit` does, or
`agent-summoner` when the assignment is part of authoring that agent.

</completion_gate>
</output_format>
