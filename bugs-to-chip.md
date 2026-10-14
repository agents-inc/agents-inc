# Bugs to chip away at

## CLI-908 + CLI-909: `edit --from` doesn't say what it overwrites (minor, not now)

The behaviour is intended: an editor-added skill's files are rewritten, and Local skills switched to plugins lose their
local copies. The plan just doesn't say so.

Fix: before confirming, `edit --from` shows the info table: the wizard's `I` panel (`SummaryPanel` plus
`SkillAgentSummary`), with one new row marker, `↻` = will be overwritten. It replaces the plain lists and
stretches the full terminal width, as it does in the wizard.

```
┌───────────────────────────────────────────────────────────┐
│  Marketplace  Agents Inc                                  │
│  Stack        none                                        │
│  ───────────────────────────────────────────────────────  │
│  Skills                                │ Agents           │
│                                        │                  │
│   Project                              │  Project         │
│  + React         ↻ my-house-style ⏏    │  + web-developer │
│  ↻ Zustand       - Redux               │  • api-developer │
│                                        │                  │
│   Global                               │  Global          │
│  + Vitest        • TypeScript          │  • pm            │
└───────────────────────────────────────────────────────────┘
? Apply this configuration?
```

Markers: `+` added, `-` removed, `•` unchanged, `⏏` local copy, and the new `↻` overwritten (an editor-added skill
rewritten, or a local copy replaced by its plugin).

Catch: the panel lives in `components/wizard/` and reads the wizard store, so it has to move out of the wizard (which
is being removed) and take its data as props.

## CLI-914: `CLAUDE_CONFIG_DIR` (not now, edge case)

Not mechanical. The global `.claude` path is built in several places (`install-layout.ts`, `installation.ts`,
`plugin-finder.ts`, `layout-findings.ts`), and the "is this the home directory?" checks would need the same split.
Codex already does this for `CODEX_HOME`, so there's a pattern to follow, but it's medium work. Left for later.
