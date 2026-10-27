---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/src/cli/lib/source-validator.ts
  - packages/cli/src/cli/lib/plugins/plugin-validator.ts
  - packages/cli/src/cli/lib/schema-validator.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`2026-10-22-a-sanitiser-that-keeps-line-breaks-let-a-label-print-a-line-of-its-own` found its
siblings with a census of `stripTerminalControls(` call sites. That census can only find a site
that sanitises the wrong way. A site that sanitises nothing never calls the sanitiser, so the grep
cannot see it.

Three validator messages quote a marketplace's own documents and sanitise nothing. `doctor` prints
each one, in a marketplace repository and for every local marketplace a project registers. Its
detail printer splits on line feeds and indents each piece, so the document's next words become a
detail line of their own:

- `checkSnakeCaseKeys` in `source-validator.ts`: `Key '${key}' uses snake_case`, for any
  `metadata.yaml` key matching `/[a-z]_[a-z]/`.
- `checkDirNameMatchesSkillId` in `source-validator.ts`: `... skill id '${skillId}'`, where the id
  is the name in the `SKILL.md` frontmatter.
- `plugin-validator.ts`: `name must be kebab-case: "${manifest.name}"` and `"${fm.name}"`. Only
  the code was read here; nothing was run against them.

Reproduced on 2026-10-26 by calling `validateSource` on a throwaway marketplace. Its
`metadata.yaml` had the key `"bad_key\e[2K\nForged key."`, and its `SKILL.md` name was
`"web-framework-react\e[2K\nForged id."`. The messages it returned:

```
"Key 'bad_key\u001b[2K\nForged key.' uses snake_case — use camelCase instead"
"Unrecognized key: \"bad_key\nForged key.\""
"Directory name 'web-framework-react' does not match skill id 'web-framework-react\u001b[2K\nForged id.'"
```

The first and third messages keep the erase-line escape as well as the line feed. The second
message is `formatZodIssue`. It strips the escape and keeps the line feed, which is CLI-988.

## Fix Applied

None. This is discovery only. CLI-988 sends `formatZodIssue`'s values through `inertLine`, with
specs in `schema-validator.test.ts` and `e2e/commands/doctor-quotes-a-document-on-one-line.e2e.test.ts`.
The three sites above are outside that lane.

## Proposed Standard

The census in the 2026-10-22 finding cannot be reused for this. A grep for unsanitised sites has
to search from the print side instead: every template literal in a validator that interpolates a
value read from a document. Here is a starting point. It is a sample, not a census:

```
grep -nE 'message: `|push\(`' src/cli/lib/source-validator.ts src/cli/lib/plugins/plugin-validator.ts | grep -F '${'
```

That 2026-10-22 finding also proposes splitting rule 5.8 by where a value lands. Once that split is
made, `clean-code-standards.md` 5.8 should say that a diagnostic which quotes a document's key, id
or name is a value printed inside a line, so it goes through `inertLine`. No checker exists, and a
cheap honest one is not obvious. The interpolated value's type is `string` whether or not it came
from a document.
