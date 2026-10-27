---
type: missing-standard
severity: low
affected_files:
  - packages/cli/src/cli/lib/metadata-keys.ts
  - packages/cli/src/cli/consts.ts
  - packages/cli/src/cli/lib/exit-codes.ts
  - packages/cli/src/cli/utils/messages.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-tester
category: dry
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  CLI-942 deleted the four METADATA_KEYS members. The § 9 rule and the sibling tables' unread
  members are still open.
---

## What Was Wrong

`METADATA_KEYS` in `lib/metadata-keys.ts` carries `CLI_DESCRIPTION`, `FORKED_FROM`, `CONTENT_HASH`
and `USAGE_GUIDANCE`, and nothing names any of them (CLI-942). Re-run:
`grep -rnwE 'METADATA_KEYS\.(CLI_DESCRIPTION|FORKED_FROM|CONTENT_HASH|USAGE_GUIDANCE)' src e2e scripts`
from `packages/cli` prints nothing. The table's `satisfies Record<string, MetadataField>` holds each
value to a schema field, which makes the four look deliberate. It says nothing about whether
anything reads them.

No gate can see this. knip reports exports, not members of an exported object. `tsc` and
`no-unused-vars` do not look at object members. `clean-code-standards.md` 9.1 names exported
functions with zero imports and stops there.

Census, 2026-10-26, not a sample: every top-level exported `as const` object in the non-test,
non-generated files under `src/cli`, each member checked with TypeScript's find-references across
`tsconfig.json`, `tsconfig.scripts.json` and `e2e/tsconfig.json`. Members nothing names:

- `consts.ts` `SCHEMA_PATHS`: `agent`, `customMetadata`, `marketplace`, `projectConfig`,
  `projectSourceConfig`, `stacks` (only `metadata` is read; `src/agents/meta/skill-summoner/output.md`
  points readers at "the custom-metadata path beside it").
- `consts.ts` `UI_SYMBOLS`: `SELECTED`, `UNSELECTED`, `CURRENT`, `DISABLED`, `LOCK`, `SCROLL_UP`,
  `SCROLL_DOWN`. CLI-821 tracks five of these; `SELECTED` and `LOCK` are not in it.
- `consts.ts` `YAML_FORMATTING`: `INDENT`, `LINE_WIDTH`.
- `consts.ts` `GITHUB_SOURCE`: `HTTPS_PREFIX`.
- `consts.ts` `CLI_COLORS`: `GRAY_1`, `HOVER_BG`.
- `lib/exit-codes.ts` `EXIT_CODES`: `NETWORK_ERROR`. The www commands reference lists
  `NETWORK_ERROR = 3` as an exit code, so this is a documented code no command raises, not
  simply dead.
- `utils/messages.ts`: `ERROR_MESSAGES` `UNKNOWN_ERROR`, `UNKNOWN_ERROR_SHORT`; `SUCCESS_MESSAGES`
  `PLUGIN_COMPILE_COMPLETE`; `STATUS_MESSAGES` `LOADING_MARKETPLACE_SOURCE`,
  `RESOLVING_MARKETPLACE_SOURCE`, `FETCHING_REPOSITORY`, `COPYING_SKILLS`; `INFO_MESSAGES`
  `RUN_COMPILE`, `NO_PLUGIN_INSTALLATION`, `NO_LOCAL_INSTALLATION`. Their only reader is
  `messages.test.ts` iterating each table with `Object.entries`.

A member with no reader is checked per member with
`grep -rnw '<TABLE>\.<MEMBER>' src e2e scripts`, plus a grep for the table used whole
(`Object.entries(<TABLE>)`, `<TABLE>[`, `...<TABLE>`), because a table read whole can read a
member nothing names.

## Fix Applied

CLI-942 deleted the four `METADATA_KEYS` members. Before the deletion, the compiler showed it was
safe: with the four removed in memory, all three projects type-checked with no new diagnostic,
while the control (removing `CATEGORY`) failed at every reader with TS2339. The sibling tables
above are untouched.

## Proposed Standard

Add to `clean-code-standards.md` § 9, after 9.1: a member of an exported constant table that
nothing names is dead in the same way as an export nothing imports, and no gate reports it. Before
adding a member, grep `<TABLE>.<MEMBER>`. When deleting one, check the docs and the www pages for
the name as well, since a constant can be a published contract (`EXIT_CODES`).

A checker could hold this if it uses TypeScript's find-references rather than grep, since a comment
naming a member would satisfy a grep. It would report on members whose table is read whole instead
of judging them. That would be a new script under `scripts/`, which is the owner's decision. This
proposal does not conflict with either `CLAUDE.md`.
