# CLI-923 — remove the wizard

## Rulings (owner)

- **2026-10-01** (session 22d82a6f): the wizard can't author what the editor can (no model, effort, preloading or
  skill-to-sub-agent assignment) and doesn't scale for one maintainer. Every command stays; only the wizard goes. No
  second package and no new repo: the last version published with the wizard stays usable on npm. Older versions get
  `npm deprecate`, and the changelog names the last wizard version.
- **2026-10-03:** wizard-only test failures are disregarded.
- **2026-10-14:** remove it completely. A bare `init` acts as `init --ui`; a bare `edit` acts as `edit --ui`.
- **2026-10-14, Ink stays:**
  - The `edit --from` info table (CLI-908/909) keeps using the wizard's panel (`SummaryPanel` +
    `SkillAgentSummary`), extracted out of the wizard.
  - `init` on an existing installation keeps an Ink dashboard, and one of its options is to edit in the web editor.
  - `init --marketplace` is removed entirely. A custom marketplace is added in the editor, which has a button for it.
- **2026-10-14, spec Q1–Q3 (this supersedes the line above):**
  - The editor's fallback install line stays a bare `npx agents-inc init`.
  - `--marketplace` stays beside `--from`, unchanged.
  - A bare `init --marketplace <ref>` opens the editor and says to add `<ref>` with its Marketplace button (a local
    folder has to be pushed first). Keep it simple; opening the editor with the marketplace already loaded comes later.
  - 0.168.0 is published first, so it is the last version with the wizard.

## Scope

- **Goes:** the interactive flow of `init` and `edit` (stack, domain, skill, source and sub-agent steps).
  `components/wizard/`, `stores/wizard-store.ts`, `lib/wizard/`, the keyboard and scroll hooks, the PTY page objects
  (`e2e/pages/steps`, `e2e/pages/wizards`), the interactive e2e specs and the simulated-terminal setup.
- **Stays:** `init --from`, `edit --from`, `init --ui`, `edit --ui`, `compile`, `list`, `doctor`, `uninstall`,
  `update`, `eject`, `search`, `share`, `build marketplace`, `build plugins`, `new marketplace`, and the install
  engine under all of them (seed, installer, hosts, config, compile, matrix, config gate).

## Known untangles (2026-10-01; re-derive before acting)

- The install pipeline takes the wizard's result type, `WizardResultV2`, as input
  (`grep -rln WizardResultV2 packages/cli/src`). Rename it out of the wizard, and make `seed-to-wizard.ts` a plain
  mapping to it.
- `list` and `uninstall` render with Ink. `ink`, `@inkjs/ui`, `zustand`, `react`, `ink-testing-library`,
  `@lydell/node-pty` and `@xterm/headless` can leave only if both print plain text, and the CLI's own tests stop
  needing a PTY.
- Bare `npx agents-inc init` is the editor's fallback install line when it can't mint an id. Once bare `init` opens
  the editor, that line loops back to the editor.

## Spec

[`CLI-923-spec.md`](./CLI-923-spec.md) (pm, 2026-10-14): lanes L1–L5, and the owner's Q1–Q3 in its §8.

## Open for the spec (superseded by the spec's §8)

- **The editor's fallback install line** (a bare `npx agents-inc init` when no id can be minted) would loop back to
  the editor.
- **Which of the six dependencies can leave** now that Ink stays (`zustand` and the PTY test stack are candidates).
- **Release mechanics:** the last wizard version (0.168.0 if this lands next), `npm deprecate` text, docs pages.
