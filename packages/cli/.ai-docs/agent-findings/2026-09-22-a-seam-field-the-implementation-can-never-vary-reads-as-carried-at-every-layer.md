---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/hosts/codex-host.ts
  - src/cli/lib/hosts/plugin-host.ts
  - src/cli/lib/hosts/__tests__/the-codex-host-speaks-codex.test.ts
  - .ai-docs/reference/concepts/plugin-hosts.md
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-09-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code half landed: `runCodex` takes the directory it asks from, `codexListPlugins` asks from
  the project directory, and the write verbs ask from home through `codexPluginCwd`. Neither
  Proposed Standard is written, not the one-field-two-values rule for the Test Assertions section of
  `packages/cli/CLAUDE.md` nor the asked-FROM sentence for the third-party-binary paragraph of
  `standards/e2e/README.md`.
---

## What Was Wrong

**A seam was widened to carry a field, every layer declared it, and the one implementation that
needed it could never produce more than one of its values.**

`PluginHost.listPlugins` answers `{ pluginKey, installPath, enabled }`. `enabled` was added for
Codex: Claude filters a disabled plugin out of its listing, Codex keeps it in `installed[]` with
the switch beside it, so "installed but disabled for this project" has no representation without
the field. A doctor row is planned on top of it.

The Codex host pinned every `codex` call to the home directory. That is right for the write verbs
and is stated at length — `plugin add` run inside a project writes the machine-wide switch and
creates no project file, so following the project there changes another project's installation.
The listing was pinned with them, on a reading of the same evidence: `codex plugin list` takes no
project or scope argument (`-m/--marketplace`, `--available`, `--json` are the whole of it), from
which the first draft concluded that the working directory could not matter.

It matters for exactly one field. Measured on the pinned `@openai/codex` 0.155.1 with `HOME` and
`CODEX_HOME` pinned to a scratch tree and the global `config.toml` deleted first — one
`CODEX_HOME` whose global config says `[plugins."<id>"] enabled = true`, one project whose own
`.codex/config.toml` says `enabled = false`, and only the global `[projects."<abs path>"]
trust_level = "trusted"` entry added between runs:

```
untrusted, asked from the project     -> "enabled": true    # the project file is ignored
TRUSTED,   asked from the project     -> "enabled": false   # the project file wins
TRUSTED,   asked from the home dir    -> "enabled": true    # the project is not in play
TRUSTED,   asked from another project -> "enabled": true    # nor is its file
```

So the field answered the global switch to every caller, always, and the state it exists to report
was unreachable. The membership of the listing really is a function of `CODEX_HOME` alone, which
is what made the wrong half look settled.

**Three layers read as though the field were carried, and none of them could disagree.** The seam
declared it and explained why it was needed; the host returned `plugin.enabled` straight off
Codex's own document, which is the correct field to read; and the unit spec asserted the whole
invocation with `toStrictEqual`, `cwd: HOME` included — so the defect was not merely uncaught, it
was RECORDED as the contract, in a file whose docblock says it exists because the e2e specs cannot
say which command ran from where.

The tell is narrow and worth naming: **a value object gained a field for a second implementation,
and no test anywhere held that implementation to producing both of its values.** The Claude host's
`enabled` varies (its registry and the project's settings are two files), so every shared
assertion about the shape was green. A fake host in the contract spec returned `enabled: true` for
everything and was equally green.

## Fix Applied

`runCodex` takes the directory as a required argument instead of pinning one inside itself, so
every call site states where it asks from. The write verbs pass the home directory through
`codexPluginCwd()`; `codexListPlugins` passes `projectDir`; `isListed`, which classifies a
removal from the machine-wide registry and never reads the switch, passes the home directory and
says why.

The unit spec's `PROJECT` constant now records the four runs above, and the listing case asserts
`cwd: PROJECT` beside the write cases that assert `cwd: HOME` — the pair is in one file, because
either assertion alone reads as a host that pins one directory for everything. Mutation-checked:
reverting the listing to the home directory reddens exactly that case, 1 of 131.

One further measurement, recorded in the host's docblock because it bounds the fix: from a
SUBDIRECTORY of the same trusted project the answer goes back to `true`, unless the project is a
git repository, in which case the subdirectory answers like the root. The seam passes a resolved
project root, so the host is on the safe side of it; a caller that ever passed a cwd would get the
global switch back with nothing to say so.

## Proposed Standard

In `packages/cli/CLAUDE.md`, under **Test Assertions**, beside the rule that forbids encoding a
known gap in an assertion's arity or absence:

> NEVER add a field to a shared type for one implementation without a spec that holds THAT
> implementation to producing more than one of its values. A field whose implementation can only
> ever answer one value is indistinguishable from a field that works: every shape assertion
> passes, every other implementation varies it, and the layer that reads it is green over the one
> state it was added for. The check is per implementation and per field, not per type — name the
> two states in one spec file, the way a refusal is named beside the case it is not.

This does not conflict with the existing pairing rules; it is the same shape one level down —
those pair a REFUSAL with a permitted case, and this pairs a FIELD's two values. It is stated as a
proposal.

A second, narrower one for `.ai-docs/standards/e2e/README.md`'s third-party-binary paragraph,
which already says a spec must pin where a binary keeps its state:

> Pin where the binary is asked FROM as well. A subcommand that takes no project argument may
> still answer per directory, and "no flag for it" is not evidence that the working directory is
> inert — `codex plugin list` has no project flag and reads the project's own config anyway.

## Correction — 2026-09-25

**`status` moved from `resolved` to `partial`: the fix landed and the Proposed Standard did not.**
`README.md` → "Resolution Model (authoritative)" makes that `partial`, and
`grep -rniE 'more than one of its values|asked FROM' CLAUDE.md .ai-docs/standards`, run from
`packages/cli`, answers nothing. The `resolved_by` it carried is recorded here rather than kept
beside a status it no longer pairs with:

```text
resolved_by: >-
  codexListPlugins now asks `codex plugin list --json` from the project directory rather than from
  the home directory, and the unit spec that recorded the home directory as correct changed with
  it. Mutation-checked both ways on 2026-09-22.
```
