# Phase H — the editor onto the v6 handoff, plus a Save naming dialog

**Design:** `.claude-design/CHANGES-v6.md` (cited `§n`) and the live spec
`.claude-design/design/Configurator v6.dc.html` (cited `v6:NNN`). Screens are
`.claude-design/screens/v6-01…v6-16.png`. They are DOM re-renders at 2×/3×, so measure from the HTML.
**Owner request outside the design:** pressing Save opens a dialog to name the save. Names are
unique, and nothing is overwritten.
**Audit:** four read-only lanes, 2026-10-11. Their change ids (C1–C5, SA1–SA9, S4a, S6a–e,
S2-R1…R5, A1–A6, B1–B5) are reused below.
**Provenance:** a line ref marked `[V]` was re-read for this spec. Every other line ref comes from the
audit, so treat it as a lead and re-derive it before acting (`briefing.md` rules 1 and 6).

Path shorthands: `CF/` = `apps/editor/src/features/configure/`, `ST/` = `apps/editor/src/stores/`,
`E2E/` = `apps/editor/e2e/`, `UI/` = `packages/ui/src/`.

---

## Sequence

| Phase | Lanes                                                                                                                 | Runs                          |
| ----- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1     | **F** foundation                                                                                                      | alone, first                  |
| 2     | **C** provider + Codex, **S** sub-agent cards, **B** skills bar, **R** rail 05, **V** save dialog, **X** Codex models | in parallel, one working tree |
| 3     | **I** integration                                                                                                     | alone, last                   |

## Rules for every lane

- Read the root `CLAUDE.md`, `packages/ui/CLAUDE.md` and `docs/briefing.md`
  first. Git is read-only (`status`/`log`/`show`/`diff`/`blame`). Every write command belongs to the
  user. Never edit `todo/`.
- Work in this order: write the tests and watch them go red, implement, apply the
  `meta-design-expressive-typescript` skill (that skill only), then hand-run it in a browser. Docs
  happen only in lane I, through `codex-keeper`.
- **Edit only files you own.** If you need a change in another lane's file, report the exact change
  instead of making it. Each spec file has one owner. A lane that needs new tests in a file it does
  not own writes them in a new spec file.
- **Never delete an exported symbol or page-object member that another lane's file still reads.**
  List it for lane I.
- **Phase 2 shares a tree.** Red typecheck or test results in files you do not own are another lane
  mid-flight, so report them and leave them. Your gate is your own spec and unit files green, plus
  `tsc` clean in the files you own. The unfiltered gate is lane I's.
- **Colour assertions compare against the resolved token**
  (`getComputedStyle(document.documentElement).getPropertyValue('--color-…')`), never against the
  design hex. The palette merge maps most v6 hexes onto existing cores (see F.5).
- **Units:** design px ÷ 16 → rem. The root is 110% (`UI/styles/globals.css`). Two values that must
  be equal, such as the lattice padding and the `::after` inset, use one unit.
- **No backwards compatibility when in doubt** (owner 2026-10-11): no migrations, shims or dual-version readers; old data may stop loading, with a refusal that names the fix.
- **Comments** (owner 2026-10-11): none unless tricky or needing outside context; trim excessive ones in every file touched.
- **Report:** Corrections (required, write "nothing" if nothing), decisions, gotchas, work left.

## Cross-lane contracts

Each lane writes against these names in parallel. Do not rename them.

| Surface           | Role and accessible name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Built by         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Step titles 01–04 | `button` in `main`, `aria-expanded`. The name is the words only: `choose your provider`, `then your stack`, `then your sub-agents`, `then pick your skills` / `then customise <stack>`. Index and glyph are `aria-hidden`. Wrapper keeps `data-slot="hinge"`                                                                                                                                                                                                                                                                  | F                |
| Step title 05     | text, not a control: index `05` + `then assign skills`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | R (with F's arm) |
| Provider cards    | `radiogroup` "Provider" in `main`, radios "Claude Code" and "Codex"                                                                                                                                                                                                                                                                                                                                                                                                                                                           | C                |
| Sub-agent groups  | `group` "Web sub-agents", "API …", "AI …", "CLI …", "Meta sub-agents" (labels from `SUB_AGENT_GROUPS`)                                                                                                                                                                                                                                                                                                                                                                                                                        | S                |
| Sub-agent card    | `button` (LatticeCellButton) named by the agent label, `aria-pressed`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | S                |
| Card controls     | `radiogroup` "Model for `<agentId>`" / "Effort for `<agentId>`" / "Scope for `<agentId>`". Each radio is named by its contract value. Codex model is a `group` of `aria-pressed` buttons (Q5)                                                                                                                                                                                                                                                                                                                                 | S                |
| Filter pair       | `radiogroup` "Show only selected skills" inside `[data-slot="search-field"]`, radios `all <N>` and `selected <N>` (the space is literal)                                                                                                                                                                                                                                                                                                                                                                                      | B                |
| Domain indicator  | `[data-slot="domain-indicator"]`, `aria-hidden`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | B                |
| Group-by          | `radiogroup` "Group sub-agents by", radios `domain` and `scope`                                                                                                                                                                                                                                                                                                                                                                                                                                                               | R                |
| Roster bands      | `button` named by the bare label (`web`, `~/.claude · global`), `aria-expanded`                                                                                                                                                                                                                                                                                                                                                                                                                                               | R                |
| Codex error mark  | `button` inside the skill cell, name matching `/codex has no project-level plugins/i`                                                                                                                                                                                                                                                                                                                                                                                                                                         | C                |
| Save dialog       | `dialog` titled "Save stack", textbox "Name", buttons "Cancel" and "Save"                                                                                                                                                                                                                                                                                                                                                                                                                                                     | V                |
| `ui-store`        | `dialog` union gains `"save"` (F). The `StackRequest` saved variant is changed by V                                                                                                                                                                                                                                                                                                                                                                                                                                           | F / V            |
| Page objects      | `E2E/pages/sub-agent-cards.ts` → `SubAgentCards`: `group(label)`, `card(groupLabel, agentLabel)`, `modelGroup(id)`, `effortGroup(id)`, `scopeGroup(id)`, `setModel/setEffort/setScope(id, v)`. `E2E/pages/dialogs.ts` → `SaveStackDialog` with `saveAs(name)`. Phase-2 specs construct both directly. Lane I wires them onto `ConfigurePage`                                                                                                                                                                                  | S / V            |
| Codex models      | `ST/persisted-schema.ts` (X): `modelChoicesFor(provider)` → `{ value, label }[]` (Claude: `AGENT_MODELS`, label = value; Codex: `CODEX_MODEL_NAMES` only, per Q5 — was `inherit` first); `chosenModelFor(provider, options)` → the checked value; `modelPatchFor(provider, value)` → the `setAgentOption` patch; `AgentOptions.codexModel` (resting `inherit`). The radio's accessible name is `value`, its visible text `label`. `config-store` `withoutRestingValues` drops a `codexModel` equal to resting, as for `model` | X / S / C        |
| Scaffolds         | F creates `CF/components/provider-grid.tsx` (`ProviderGrid()`), `sub-agent-grid.tsx` (`SubAgentGrid({ config })`) and `save-stack-dialog.tsx` (`SaveStackDialog({ config })`). Each renders nothing, is lint-clean and is mounted by F. From phase 2 they belong to C, S and V. **These are the only files with two writers, and the writes never overlap in time**                                                                                                                                                           | F → C/S/V        |

---

## Lane F — foundation (phase 1, alone)

**Changes:** C1, C2, C4, C5, the segment primitive, tokens, fold state, the step skeleton and the
scaffolds.

**F.1 Titles** (§1; v6:79, 516–531)

- `Hinge` (`UI/components/divider.tsx`) keeps its name and `data-slot="hinge"`.
- New `index` prop: 500 12px mono, brand `#b0762c`.
- Words: 500 13px mono, .13em, uppercase, title ink `#5f5c52`. `emphasis` is `ink-primary` `#161513`
  in both arms. Do not reproduce the `.plw em` cascade accident.
- Delete the leading stub and the trailing rule from both arms (divider.tsx:96-104 [V]).
  `HINGE_RULE` stays for `Rule`.
- Column arm: `mt` = gutter (60), `mb` = 20 design px, `pl` and `pr` = gutter.
- Panel arm (05): gap 10px, `pb` 30px, `pl` stays 17px. Static.
- Toggle arm (01–04): index + words + glyph sit inside a real `<button type="button" aria-expanded>`.
  - `.htl`: inline-flex, gap 16px, padding 4px 8px, `margin-left:-8px`. Hover must not shift the text.
  - Hover fill: title-hover token (`#f1eee6`).
  - Glyph: `Glyph` `minus` when open, `plus` when folded, `size={10}`, `margin-left:-6px`. It is
    `visibility:hidden` at rest and visible in ink `#242320` on hover **and on `focus-visible`**.
  - Focus: `outline-none focus-visible:ring-1 focus-visible:ring-ring`.
- Delete `HingeButton` and the `action` slot. Their only consumer is configure-screen.tsx [V].
- **Keep the `control` slot.** R still passes it, and lane I deletes it.
- Remove `min-h-6` and its comment from the 04 title (configure-screen.tsx:147-155 [V]). Measure
  the result; it should be about 24 design px.
- Rewrite the stale `#dcd7c9` comment at divider.tsx:15-16 [V].

**F.2 Fold** (§1)

- 01 hides the provider cards. 02 hides the stack grid. 03 hides the sub-agent groups. 04 hides
  `FilterBar`, the domain sections and the "No skills match" line.
- `PANEL_ROOM` and the composer dock stay outside the fold.
- Bodies are unmounted, with no `aria-controls` (the pattern at configure-screen.tsx:122-129 [V]).
- `ui-store`:
  - Keep `stackCollapsed`.
  - Add a provider fold and an agents fold. Both are persisted and `.catch(false)` in
    `persistedUiSchema`.
  - The 04 fold is transient (Q2 default).
  - Do not bump `version` (ui-store.ts, comment at `version: 3` [V]).
- Rewrite the comments the design falsifies:
  - configure-screen.tsx:106-112 [V], and persisted-schema.ts:207-212: the scope fix is now on the
    03 card.
  - The `setProvider` comment (ui-store.ts:251-255 [V]): a switch to Codex now moves unselected
    plugin+project skills to global (C implements this).

**F.3 Card outline 138a** (§5; v6:576-584)

- `latticeVariants`: add 1.5 design-px padding.
- `latticeCellVariants`:
  - Drop `-mt-px -ml-px border border-hairline`.
  - Draw the line in `::after`: absolute, inset 1.5 design px, 1px outline at offset −1, `hairline`,
    `pointer-events:none`.
  - Selected: the `::after` outline becomes `brand`. No cell outline, no `z-1`. Fill stays `cell`,
    and a selected cell never takes the hover tint.
  - `disabled` keeps `bg-column`.
- Add the inset focus ring for focusable cells: stack cells are `role=button`, and C's provider cards
  are radios.
- Leave the skill cell's `overflow` / `z-58` alone, and leave `latticeRowVariants` (add-skill rows)
  alone.
- Rewrite the comments at lattice.tsx:8-14 and :130-136 [V].

**F.4 Segment primitive** (`UI/components/button-group.tsx`). This is one new size shared by S, B
and R, plus two new states on `badge` for C.

| Part                                | Value (design → token)                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| Type                                | 500 8px mono, uppercase. Cells butt, with no divider                                       |
| Rest                                | ink `#a19d90` → `field-faint`, fill `#fbfaf7` → `badge` (warm-05)                          |
| Hover                               | ink `#5f5c52` → title ink. No ring, no amber                                               |
| Active                              | ink `brand-ink`, fill `wash`. No hover step                                                |
| Padding / tracking presets          | `.sab` 3px 4px / .02em (S) · `.gsb` 3px 6px / .06em (R) · `.fsb` 4px 7px / .06em (B)       |
| `recede` arm (off card, S)          | rest: fill transparent, ink `#c4c0b2` → warm-13. Active: ink `faint`, fill `#f1eee6`       |
| `onDark` arm (stuck bar, B)         | rest `band-dim` on `band-chip`, hover ink `band-hover`, active `band-brand` on `band-wash` |
| `badge` + `aria-disabled`           | ink `#d9d5ca` → warm-11, `cursor:not-allowed`, no hover ink or ring (§2 rule 1)            |
| `badge` error (active refused cell) | ink `#b5442c`, fill `#f8e8e2`. Both are new cores (§2 rule 3)                              |

Delete the `field` size and its stories. Its only app consumer was the 04 pair [V].

**F.5 Tokens** (`packages/ui/tokens/tokens.json` → `bun run tokens` → `tokens.css`; semantics in
`globals.css`)

- Rule: CIEDE2000 under 2.3 means a new semantic name pointing at an existing core
  (`todo/archive.md:5184`). Anything further away needs a new core with a dark complement.
- Measured 2026-10-11 against `tokens.css` (ΔE2000):

| v6 hex    | Nearest core (ΔE)                                   | Result                                               |
| --------- | --------------------------------------------------- | ---------------------------------------------------- |
| `#5f5c52` | warm-23 (0)                                         | new semantic: title ink                              |
| `#f1eee6` | warm-06 `#f2f0e8` (0.62)                            | new semantics: title hover fill and stuck strip fill |
| `#c4c0b2` | warm-13 (0.43)                                      | new semantic: receded segment ink                    |
| `#d9d5ca` | warm-11 (1.72)                                      | new semantic: unavailable ink                        |
| `#fbfaf7` | warm-05 (0.55)                                      | existing `badge`                                     |
| `#dcd7c9` | merged into `hairline` warm-10 (2.21) on 2026-08-29 | existing `hairline`                                  |
| `#b5442c` | red-01 (4.96)                                       | **new core** + semantic error ink                    |
| `#f8e8e2` | warm-04 (6.93)                                      | **new core** + semantic error wash                   |

- Retire `--tab-index` / `--color-tab-index`. Its only reader is the tab index, which B deletes.
- Delete the colour and name counts in the globals.css comments rather than rewriting them.
- Both themes: `theme.spec.ts` stays green, and the error ink stays legible on the error wash in dark.

**F.6 Skeleton** (`CF/components/configure-screen.tsx`)

- Order: catalogue notice → 01 + `ProviderGrid` → 02 + `StackGrid` → 03 + `SubAgentGrid` → 04 +
  FilterBar/sections.
- The 04 title holds no control. Delete the pair and its imports (configure-screen.tsx:158-196 [V]).
- Mount `<SaveStackDialog config={config} />` beside the other dialogs.
- Copy: `02 then your stack`. The 04 copy is unchanged.

**Owned files:** `UI/components/{divider,lattice,button-group}.tsx` and their `.stories.tsx`;
`packages/ui/tokens/tokens.json`; `UI/styles/{tokens,globals}.css`;
`ST/{ui-store,ui-store.test,persisted-schema,persisted-schema.test}.ts`;
`CF/components/configure-screen.tsx`; the three scaffolds (creation only); `E2E/pages/configure-page.ts`;
`E2E/specs/{stack-collapse (delete),step-collapse (new),step-titles (new),card-outline (new),stacks,filters,persistence,a11y,visual,design-tokens}.spec.ts`.

**Tests first** (each must be red before the change):

| File                                                                     | Assertion                                                                                                                                                                                                                                                                         | Why it is red now         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `step-titles.spec.ts` (new)                                              | `main` buttons named as in the contract contain `01`–`04`                                                                                                                                                                                                                         | no such buttons, no index |
| same                                                                     | no `[data-slot="hinge"]` descendant has a computed `borderTopWidth` other than `0px`                                                                                                                                                                                              | stub and trailing rule    |
| same                                                                     | hinge `marginBottom` ≈ 1.25 × root font size, `marginTop` ≈ 3.75 × root                                                                                                                                                                                                           | mb = mt                   |
| same                                                                     | `searchField` top − 04 title bottom ≈ that title's `marginBottom` (C5)                                                                                                                                                                                                            | 60 design px              |
| same                                                                     | words, emphasis and index colours equal the resolved title-ink, `ink-primary` and `brand`                                                                                                                                                                                         | 10px `#7a7669`, no index  |
| `step-collapse.spec.ts` (new; port then delete `stack-collapse.spec.ts`) | 02 and 04 titles go `aria-expanded` true → false → true, and the content count goes to 0 and back                                                                                                                                                                                 | no title buttons          |
| same                                                                     | `/^(Show\|Hide) stacks$/` has count 0                                                                                                                                                                                                                                             | square exists             |
| same                                                                     | glyph hidden at rest, visible on hover and on keyboard focus. The words' `boundingBox().x` does not change on hover                                                                                                                                                               | no glyph                  |
| same                                                                     | porting stack-collapse.spec.ts:70-86: a fold changes nothing chosen                                                                                                                                                                                                               | —                         |
| same                                                                     | porting :97-110: two adjacent folded titles sit `nextHinge.marginTop` apart                                                                                                                                                                                                       | mb + mt today             |
| same                                                                     | after a reload, the 02 fold persists and the 04 fold does not                                                                                                                                                                                                                     | no 04 fold                |
| `card-outline.spec.ts` (new), stack cell + skill cell                    | cell `borderTopWidth` `0px`                                                                                                                                                                                                                                                       | 1px                       |
| same                                                                     | `getComputedStyle(cell,'::after').content` ≠ `none` and `outlineWidth` `1px`                                                                                                                                                                                                      | `none`                    |
| same                                                                     | lattice `paddingTop` equals the `::after` `top`, and both are > 0                                                                                                                                                                                                                 | 0                         |
| same                                                                     | horizontal neighbours abut: `right.x === left.x + left.width`                                                                                                                                                                                                                     | −1px overlap              |
| same                                                                     | chosen stack (`chooseStack(STACKS.nextjs)`): cell `outlineStyle` `none`. `::after` colour = resolved `--color-brand`, a sibling's = `--color-hairline`. Both `backgroundColor` = `--color-cell`                                                                                   | cell outline today        |
| same                                                                     | hovering a selected cell leaves its background unchanged                                                                                                                                                                                                                          | tints                     |
| same                                                                     | a keyboard-focused stack cell draws the ring                                                                                                                                                                                                                                      | base-layer outline        |
| `ui-store.test.ts`                                                       | `PERSISTED_UI_KEYS` whole-list equality includes the two new folds. Each fold toggles                                                                                                                                                                                             | list differs              |
| `persisted-schema.test.ts`                                               | a stored blob without the new keys parses, and garbage `.catch`es to `false`                                                                                                                                                                                                      | keys absent               |
| `design-tokens.spec.ts`                                                  | `--color-tab-index` is in `RETIRED_TOKENS`, and each new semantic → core pair is pinned                                                                                                                                                                                           | token resolves            |
| Stories                                                                  | `divider`: index rendered, toggle `aria-expanded`, focus ring via `expectVisibleFocusRing`. `button-group`: each preset draws the ring; `aria-disabled` badge resolves the unavailable ink and `not-allowed`; error badge resolves the error tokens; `recede` and `onDark` render | parts absent              |

**Old tests to rewrite:**

- `configure-page.ts`: replace `stackToggle` with `stepTitle(words)`, and rewrite the comments at
  :130-161.
- `persistence.spec.ts:169-183`: change to the stepTitle. **Delete :83-92** (the model word); S
  re-creates it on the card.
- `a11y.spec.ts:98-103`: change to the stepTitle, and delete the comment at :117-127.
- `visual.spec.ts:138-141`: change to the stepTitle, and change :164-165 to `roster.groupBy('scope')`
  (R keeps that verb).
- `filters.spec.ts:122-167`: delete "the search field holds no controls" and "ends on the same
  content edge as the stack accordion". Rewrite "sits on the skills hinge" as "the skills title holds
  no control" (count 0 in the hinge).
- `stacks.spec.ts`: hinge copy if it stops matching. Also rewrite the stories named in the audit
  (LabelledHinge, HingeWithAction, AccordionButton*, HingeWithToggle*, the `field` stories).

**Guards that stay green:** `skill-selection.spec.ts` (ring on selected cells),
`incompatibility.spec.ts` (receded `bg-column`), `theme.spec.ts`.

**Acceptance:** v6-02 shows amber indices, 13px words and no rules. v6-07 shows the grey hover fill
and the `−` glyph with no shift. v6-06 shows 3px of white around every line, amber when selected.

---

## Lane C — provider step + Codex skill rules (phase 2)

**Changes:** C3 and S2-R1…R5.

- **ProviderGrid** (scaffold):
  - `Lattice columns={useLatticeColumns()}`, `role="radiogroup"` "Provider", `onKeyDown` =
    `moveToAdjacentRadio` (`UI/lib/radio-row.ts:27` [V]).
  - Two `LatticeCell` with `role="radio"` and `aria-checked`, a roving `tabIndex`, and Enter/Space.
  - Copy the stack cell's face rather than extracting it (stack-grid.tsx:282-309 [V]; it is three
    class strings, and stack-grid belongs to V).
  - Names: "Claude Code" and "Codex". Lines: "plugins at project or global scope" and
    "plugins install globally only". Keep them in the file, `satisfies Record<Provider, …>`.
  - Pressing a card calls `setProvider`; pressing Codex also applies rule 2.
- **R1:** F's `aria-disabled` badge arm draws the skill-cell door (PairCell already sets
  `aria-disabled`). Style the ••• panel door (the scope `SegmentedItem`) at its call site with F's
  unavailable token: `not-allowed`, no hover.
- **R2:** add a `config-store` action that moves `remembered` entries from plugin+project to global.
  - It never touches `skills` or eject entries.
  - It is called on the press that switches to Codex, and from the deselect path while
    `useUiStore.getState().provider === "codex"`. This follows the v6:1222-1236 invariant, and
    config-store already reads ui-store that way (config-store.ts:492 [V]).
  - Switching back to Claude never moves anything back.
- **For lane X:** `withoutRestingValues` (config-store.ts) gains the `codexModel` arm, same shape as
  `model`. Test in `config-store.test.ts`: `setAgentOption(id, { codexModel: 'gpt-5.6-sol' })` stores
  it; `{ codexModel: 'inherit' }` removes the key, and an entry left empty is dropped.
- **R3:** a selected skill with `!offersPlacement(provider, options)`:
  - Its PROJECT cell takes the error badge.
  - After the name and the `added` tag, add a focusable button (`pointer-events-auto`) holding
    `Glyph name="warning"` at 12px in error ink.
  - The tip opens on hover **and** focus. Its surface is `InfoTip`, extracted from
    skill-options-panel.tsx:58 [V] into an app-local component, with flip in the last column. It is
    196 design px wide.
  - Text: "**Codex has no project-level plugins.** Eject this skill to keep it in the project, or
    install the plugin globally." The bold run is 500 weight in error ink. The copy lives in
    `provider.ts`.
- **R4:** add a pure helper to `provider.ts`: the patch a press produces. On Codex, `{install:'plugin'}`
  becomes `{install:'plugin', scope:'global'}`. Both doors use it (skill-cell `flip` :142-146 [V], and
  the panel pick). Stop refusing the PLUGIN cell. PROJECT stays refused while install is plugin.
- **R5:** Claude gets none of this. Every new test carries a Claude control.
- R removes the rail's `PlacementNotice`; Install's refusal label stays. Rewrite every
  codex-provider.spec assertion on the notice to assert the cell mark instead.

**Owned:** `CF/components/provider-grid.tsx`; `CF/lib/{provider,provider.test}.ts`;
`CF/components/{skill-cell,skill-options-panel}.tsx`; a new `CF/components/info-tip.tsx` (name it as
you like); `ST/{config-store,config-store.test}.ts`;
`E2E/pages/{provider-control,skill-cell,options-panel}.ts`; `E2E/specs/codex-provider.spec.ts`.

**Tests first** (all in `codex-provider.spec.ts` unless noted):

- Provider step:
  - The radiogroup is visible inside `main`.
  - `option('claude')` and `option('codex')` contain their lines.
  - The group holds 2 `[data-slot="lattice-cell"]`.
  - Its `y` is above `configure.stacks` and its `x` equals theirs.
  - A cell's `::after` content is not `none` (138a).
  - Folding the 01 title removes the radiogroup.
  - These are red because the group sits in the rail as ButtonGroupItems.
- R1 cell and panel: the refused PROJECT colour equals the resolved unavailable token, the cursor is
  `not-allowed`, and after `hover()` there is no amber ring. Red: muted ink, pointer.
- R2:
  - An unselected skill set to project on Claude, then switched to Codex, reads `global`; switched
    back to Claude it still reads `global`.
  - Control in the same test: a selected plugin+project skill is untouched.
  - Deselecting an errored skill on Codex leaves it at `global`.
  - `config-store.test.ts`: only remembered plugin+project entries change.
  - Red: they stay project.
- R3:
  - The PROJECT cell's background and colour equal the error tokens.
  - Focusing `skill.cell.getByRole('button',{name:/codex/i})` makes "Codex has no project-level
    plugins." visible.
  - Control on Claude: count 0.
  - Red: no mark exists.
- R4:
  - Eject+project, then plugin, on Codex gives plugin+global, and `installCell('plugin')` is not
    `aria-disabled`.
  - The same through the panel.
  - `provider.test.ts`: on Codex the helper returns global; on Claude it returns project.
  - Red: the press is refused.

**Old tests to rewrite:**

- codex-provider.spec.ts:446-510: narrow the docblock and the "byte-identical" claim to "selected
  skills and payload".
- :656-672: docblock.
- :701-723: becomes R4.
- Every PlacementNotice assertion (`grep -n 'placement' E2E/specs/codex-provider.spec.ts`).
- `pages/provider-control.ts`: scope it to `main`, and fix the false "whole-string match" docblock.
  Playwright's non-exact name match is a substring match.
- `pages/skill-cell.ts`: add `errorMark` and `errorTip`.

**Acceptance:** v6-01 (Codex), v6-04 (greyed PROJECT, marks), v6-08 (tip), v6-16 (Claude: neither).

---

## Lane S — sub-agent cards, step 03 (phase 2)

**Changes:** SA1–SA8, the D18 card treatment, and the Codex model row (Lane X's exports).

- **SubAgentGrid** (scaffold):
  - Build it from `SUB_AGENT_GROUPS` (`@workspace/matrix`), `resolveAgentOptions` / `isAgentOn`
    (persisted-schema.ts:154/:213 [V]) and `compilesAgent` / `leftOutOfCodexReason` (provider.ts,
    read only). **Do not use `derive.ts`**; R is changing `selectRosterGroups`.
  - One named `group` per domain.
  - Header: the skill category label type (domain-section.tsx:44 [V]), 22 design px of top padding,
    and **no tag**.
  - `Lattice columns={useLatticeColumns()}`. No `DOMAIN_ANCHOR`.
- **Card:**
  - `LatticeCell selected={installed}`, where installed is on and `compilesAgent`.
  - Under the controls, a `LatticeCellButton` with aria-label = the agent label,
    `aria-pressed={installed}` and `onClick` → `toggleAgentPin`.
  - Content is `pointer-events-none`; the control groups are `relative z-1 pointer-events-auto`
    (the skill-cell.tsx pattern). Never use `stopPropagation`.
  - Padding 11 12 10 design px.
- **Row 1** (`.sath` gap 10, min-height 16):
  - Name: 600 12px Inter, ellipsis.
  - Effort sits on the right (`.eff` gap 8). First the word (`.effw` 500 8px mono .06em: `brand-ink`
    when installed, `field-faint` when off).
  - Then the track: a radiogroup "Effort for `<id>`" of **5** radios (`AGENT_EFFORTS`), named by
    level, with roving tabindex and `moveToAdjacentRadio`.
  - Each radio is a 16px-tall hit holding a 14×4 bar; gap 5. Index ≤ current means `data-filled`.
  - Bar colours: empty `hairline`, filled `brand`, empty on hover `rule`, filled on an off card
    `field-faint`.
  - Focus ring per the one focus treatment. Writes `setAgentOption(id,{effort})`.
- **Row 2** (gap 6, mt 9, ml −4): ButtonGroup "Model for `<id>`" (`AGENT_MODELS`, 4) and "Scope for
  `<id>`" (`AGENT_SCOPES`, 2) on F's `.sab` preset, with the `recede` arm when not installed.
- **Off card:** white with a grey line. Every control stays live; only the colours recede. The name
  is `faint`.
- **On Codex:** the two `AGENTS_LEFT_OUT_OF_CODEX` cards get the overlay `aria-disabled` with
  `title=leftOutOfCodexReason()`. The press is refused, the card is drawn not installed, the config is
  untouched, and its controls stay live (D18). The model row is X's `modelChoicesFor(provider)`, checked
  at `chosenModelFor(provider, options)`, written with `setAgentOption(id, modelPatchFor(provider,
value))` (Cross-lane contracts).

**Owned:** `CF/components/sub-agent-grid.tsx`; a new `CF/components/sub-agent-card.tsx` (the effort
track stays app-local); a new `E2E/pages/sub-agent-cards.ts` (the contract API); a new
`E2E/specs/sub-agent-cards.spec.ts`; `E2E/specs/{agent-scope,sharing}.spec.ts`.

**Tests first** (`sub-agent-cards.spec.ts`; all red because nothing is in `main` today):

- Groups Web, API, AI, CLI, Meta appear in order. Each holds the agents of its `SUB_AGENT_GROUPS`
  entry: name the members against the e2e catalogue constant, and do not count them
  (`bun -e 'import {SUB_AGENT_GROUPS} from "@workspace/matrix"; …'` prints them). No group header
  contains "multi" or "one of".
- Effort:
  - 5 radios named by `AGENT_OPTIONS.efforts`, with `medium` checked.
  - Pressing the 4th checks `xhigh`, the word reads xhigh, and the shared payload carries
    `effort: 'xhigh'`.
  - 4 radios are `data-filled` at xhigh.
  - The same 5 appear on Codex.
- Model: the radios are `AGENT_OPTIONS.models` with the resting model checked. Picking `haiku`
  survives a reload; this replaces persistence.spec:83-92.
- Codex model: superseded by Lane S2 (toggles, none pressed at rest). Picking `gpt-5.6-terra` puts `codexModel: 'gpt-5.6-terra'` in the payload and leaves `model`
  as it was; on Claude the Claude model is still checked; back on Codex terra is still checked.
- Scope: `project` / `global`, with `global` checked.
- Row 2 wraps rather than clips where model + scope do not fit. **Owner 2026-10-11:** Codex drops the `inherit` segment (see Q5), so at 1684 both providers fit one line.
- Pressing a card toggles `aria-pressed`, and the rail's `agentButton` mirrors it.
- On an off card, pressing haiku, high and project leaves the card unpressed and the Install count
  unchanged.
- An off card keeps working controls. Its background equals an on card's; its name colour differs.
- Applying a stack makes the set of pressed cards equal the set of pressed rail agents.
- A card in "Web" (3 cards) is as wide as one in "Meta", within 2px.
- At the wide size `latticeTracks` is 4, and 3 below the threshold.
- On Codex, the Agent Summoner card is `aria-disabled` with a `/codex/i` title, a forced click
  changes nothing, and a Codex agent's card still toggles. On Claude, neither card is disabled.
- 03 fold removes the groups. The card's `::after` is present (138a).
- a11y: `a11y.spec`'s whole-page axe (owned by F) stays green, which guards `nested-interactive`.

**Old tests to rewrite:**

- `agent-scope.spec.ts` (whole file) moves to the cards.
- `sharing.spec.ts`: model and effort word name assertions move to checked radios. The `domainBand(…)
.toContainText("1 of")` check becomes `agentButton(…)` `aria-pressed`. Worklist:
  `grep -nE 'roster\.(modelWord|effortWord|domainBand)' apps/editor/e2e/specs/sharing.spec.ts`.
- R deletes roster.spec's "agent model and effort" describe, and S re-creates those behaviours here.

**Acceptance:** v6-03 and v6-02 layout. v6-15 for the arrangement only; the model list follows Lane X.

---

## Lane B — skills step bar, tabs and sticky strip (phase 2)

**Changes:** S4a, S6a–e, and removing the "multi" tag.

- **S4a:**
  - The pair moves into `[data-slot="search-field"]`, after the input: `flex-none`, 12 design px
    gap, F's `.fsb` preset, and the `onDark` arm when stuck.
  - The count sits in its own element (`margin-left` 5px, opacity .7). Keep a literal space so the
    name stays `all 238` (configure-page.ts:471-475 matches `^all \d+$`).
  - Show it only when at least one skill is selected. The row never wraps; the input is `min-w-0`.
  - **FilterBar derives the counts itself** from config-store, using `summarize` and
    `catalogueSkillCount` read-only. No new prop (configure-screen belongs to F), and no
    `selectedOnlyOptions` (R deletes it).
  - When stuck, the field is `absolute inset-0` under the add block (filter-bar.tsx:119 [V]). The pair
    therefore needs a right inset equal to the block's width plus the gap, and it needs `relative`.
  - Rewrite the FilterBar docblock that says the field holds only search.
- **S6a:**
  - No index. Equal `flex-1` cells, 46 design-px tabs, an 8px gap, hover label `ink-2`.
  - The count shows only above the repo threshold (`lib/viewport.ts`).
  - Fallback: if any label ellipsizes at 1200 or 1500 wide, go back to `flex:1 1 auto` and report the
    widths.
- **S6b:**
  - One `aria-hidden` `[data-slot="domain-indicator"]`, 2px `brand`, inside a `relative` strip.
  - The active tab keeps only the 1px hairline.
  - Stops and lerp come from a pure module, `CF/lib/domain-stops.ts`: stop = sectionTop − barBottom,
    clamped to [0, max]. Trailing stops that collapse onto max are spread evenly between the last
    reachable stop and max.
  - Write the transform and width straight to the DOM (the `use-pinned.ts` precedent). Update on
    scroll, on resize, after render, and after the pin flips.
  - `scrollToDomain` lands on the domain's own stop, spread or not.
- **S6c:** the active label uses the same stops. More than 0.5 of the way across switches it, and the
  last domain is current at the foot of the page. Keep `aria-current` and `data-active`.
- **S6d:** when stuck, keyed on `group-data-pinned/bar:` (not React `stuck`):
  - The strip goes full-bleed: no gutter padding, no `mt`, the stuck-strip fill, and a 1px hairline
    underneath.
  - Tabs are 26 design px, with no shadow except on hover (warm-14).
  - The band's `mb-3` drops so the strip butts the dark band.
- **S6e:** a zero-height static sentinel sits right before the bar. `isPinned`, `usePinned`,
  `publishPinned` and `usePinnedAttribute` all decide from it: `top <= 0`, or an IntersectionObserver.
- **Tag:** remove the "multi" tag from skill category headers (domain-section.tsx:47-49 [V]).
  "one of" stays (v6:690).

**Owned:** `CF/components/{filter-bar,domain-tabs,domain-section}.tsx`;
`CF/lib/{use-pinned,use-active-domain,use-domain-scroll}.ts`; new `CF/lib/domain-stops.ts` and
`.test.ts`; `E2E/specs/{domain-tabs,sticky-bar,field-hit-area,viewport-threshold}.spec.ts`; new
`E2E/specs/{search-filter,category-header}.spec.ts`.

**Tests first:**

- `domain-stops.test.ts` (red: no module):
  - stops `[0,500,1200,1300]` with max 1000 become `[0,500,750,1000]`;
  - y=250 gives t=0.5;
  - y below the first stop gives index 0;
  - y=max puts it under the last tab.
- `search-filter.spec.ts` (red: the pair is in the title or nowhere):
  - After `chooseStack`, the radiogroup is inside `searchField`.
  - At 1200×1000 the pair's centre-y is inside the input's span and the pair sits to its right.
  - Stuck: the pair's right edge ≤ `addSkillButton.x`, and `all` resolves to `band-dim`.
  - A press left of the pair reaches the input; a press on `selected` switches.
- `domain-tabs.spec.ts`:
  - The tab does not contain `01`. Red: it draws `01`.
  - API width equals AI width within 1px. Red: `flex-auto`.
  - Height ÷ (root/16) ≈ 46. Red: about 35.
  - There is one indicator and the active tab has no `2px` shadow. Red.
  - Halfway between the Web and API stops, the indicator sits at the mean of their lefts.
  - After clicking API, the indicator matches the API tab.
  - At the foot of the page, Shared is current.
  - At 0.6 of the way Web → API, API is current.
  - Clicking Shared makes it current. Red.
- `sticky-bar.spec.ts`:
  - When stuck the strip's background equals the stuck-strip token and its x/width equal the
    filterBar's.
  - Stuck tab height ÷ resting height ≈ 26/46.
  - The strip's top equals the band's bottom.
  - Red: transparent, inset, ratio 1, a 22px gap.
- `sticky-bar.spec.ts`: 30 rAF samples just past the pin are all stuck. This may pass today; it is
  the guard for S6d, so land it with S6d.
- `category-header.spec.ts`: a multi category has no tag, and a one-of category says "one of". Red.

**Old tests to rewrite:**

- domain-tabs.spec.ts:6-11 (`LANDING_WINDOW`), :44-58, :79-91.
- viewport-threshold.spec.ts:39-43 and :64-69 (count only).
- sticky-bar.spec.ts:199-215.
- Keep :146-174 ("does not move the column") green and re-derive its `31px` comments. It guards the
  net-height hazard.
- Argos is lane I's.

**Acceptance:** v6-11 (rest, `selected` on), v6-09 (stuck, indicator halfway, grey full-bleed
strip), v6-10 (under API), and the v6-04 tab strip.

---

## Lane R — rail, step 05 (phase 2)

**Changes:** A1–A6, the footer, and V's requested Save change.

- **A1:** `Hinge variant="panel"` with index `05`, label `then`, emphasis `assign skills`. No rule,
  not a button, 17px inset. Stop passing `control`.
- **A2:** a row of its own.
  - Caption `group by` (500 8px mono .12em uppercase `faint`), then a ButtonGroup "Group sub-agents
    by" (`domain` | `scope`) on F's `.gsb` preset.
  - Row padding 0 2px 12px 17px. Picking still calls `setTip(null)`; there is no collapsed reset.
  - Delete `GroupControl` and its Menu imports.
- **A3:**
  - Replace the count with `Glyph` `minus`/`plus` at size 10, `aria-hidden`, `faint`, ink on band
    hover. The name is the bare label. Delete `RosterGroup.onCount`.
  - `selectRosterGroups(config, groupBy, provider)` labels the scope bands from a
    `Record<Provider, ".claude" | ".codex">` in `derive.ts` (SCOPE_BANDS :613-616 [V]).
  - Leave `provider.ts` alone. The duplicate host-dir copies in install-dialog and output-preview are
    a follow-up to report.
- **A4:**
  - Delete the option words, the panel, `optionsFor` and its effect, `AGENT_OPTION_FIELDS` and
    related code (`grep -nE 'AgentOption|optionsFor|AGENT_OPTION|OPTION_(VARS|TRACKS)|FIELD_NAMES' CF/components/roster-panel.tsx`).
  - Keep: the `flex-1` pin button, `aria-disabled` on Codex-left-out agents, the row pulse, the
    domain prefix in scope mode, and `ScopeErrorMark`.
  - `RosterAgentRow.model/effort/scope` may go (S does not read `derive.ts`).
  - Rewrite the comments at derive.ts:255-268 and :575-577 [V]: the fix is the agent's scope on its
    03 card.
- **A5:** delete `QUIET_AT_REST` (roster-panel.tsx:278 [V]). The grid becomes
  `1rem minmax(0,1fr) 1.875rem` (:350 [V]).
- **A6:**
  - Where-used opens on hover anywhere on the row and on keyboard focus of the row toggle
    (`aria-describedby` the tip). It closes on leave, blur and scroll.
  - It opens when `usedBy.length ≥ 1` and opens nothing at 0.
  - Delete the count button.
  - The tip always sits left of the aside with a 7px gap (`TIP_GAP_PX`); drop the right-opening
    branch.
  - Fix the comment at derive.ts:492-494.
- **Footer:**
  - Remove `<ProviderControl />` and `<PlacementNotice />` (:1240-1241 [V]).
  - Delete `CF/components/provider-control.tsx` and `PlacementNotice`.
  - **Keep Install's refusal label**, which is the write contract.
- **V's request:**
  - Save is `disabled={stats.skillCount === 0}`, `onClick={() => setDialog("save")}`, with the
    label `Save`.
  - Delete `save()`, the `saving`/`refusal` state, `SAVE_NARRATIONS`/`SaveRefusal` (they move to
    V), `SAVE_RESET_DELAY_MS` and its effect, and the saved-stack/account-save imports (:86-101,
    :998-1046, :1103-1111 [V]).
- **derive.ts on behalf of others:** delete `selectedOnlyOptions` and its test, which has no consumer
  after F. **Leave `DomainTab.index`** for lane I.
- **Page object:**
  - `ROSTER_HEADER_LABEL` becomes `then assign skills`. Delete `headerRule`.
  - The group locators become radios; keep `groupBy()`. Band regexes drop `\d+ of \d+`.
  - `whereUsed` opens by row hover.
  - Delete the read-side agent-option members only once
    `grep -rnE 'roster\.(modelWord|effortWord|scopeControl|agentOptions|agentOptionColumn|agentOption|setAgentOption)\(' apps/editor/e2e/specs`
    lists only R's files.
  - **Keep `setModel/setEffort/setScope`**, pointed at the cards by the contract names, without
    importing S's file.

**Owned:** `CF/components/roster-panel.tsx`; `CF/components/provider-control.tsx` (delete);
`CF/lib/{derive,derive.test}.ts`; `E2E/pages/roster-panel.ts`;
`E2E/specs/{roster,skill-options}.spec.ts`.

**Tests first** (`roster.spec.ts` unless noted):

- The header reads `then assign skills` and contains `05`. Red: "Sub-agents grouped by".
- The "Group sub-agents by" radiogroup has `domain` checked and `scope` not. One press on `scope`
  shows `scopeBand('global')` and leaves `domainBand('web')` at count 0. Red: a menu.
- The button named exactly `web` has `aria-expanded="true"` and no digit.
- On Codex, grouped by scope, the band reads `~/.codex · global`.
- `derive.test.ts`: `selectRosterGroups(…, 'scope', 'codex')` gives
  `['~/.codex · global','./.codex · project']`. Red: the labels are fixed.
- `roster.root` has 0 buttons or radiogroups named `/^(Model|Effort|Scope) for /`. In the same test,
  the agent pin, the skill row toggle and the load word still act. Red: three per agent.
- The load word's opacity is 1 with the pointer away. Red: 0.
- Hovering the row opens the where-used list. A single-carrier skill also opens it, and keyboard focus
  opens it. The count button has count 0. Red: only the number opens it.
- The rail has 0 `radiogroup` "Provider" and no placement alert. Control in the same test: on Codex
  with a plugin+project skill, the Install label still names the refusal. Red.

**Old tests to rewrite:**

- roster.spec.ts: the header (rule) tests (`grep -n 'headerRule\|MIN_HEADER_RULE' …`).
- "agent model and effort" (delete; S re-creates it).
- "quiet at rest".
- "hovering the where-used number".
- The grouping menu tests.
- Band `x of` assertions (`grep -nE '(domainBand|scopeBand)\(.*toContainText' E2E/specs/{roster,skill-options}.spec.ts`)
  become `agentButton` `aria-pressed`.
- `derive.test.ts` onCount, labels, and roster model/effort/scope.

**Acceptance:** v6-05, v6-12, v6-13 (Web shut, `+`), v6-14 (the tip left of the rail).

---

## Lane V — Save naming dialog and named saves (phase 2)

**Changes:** B1–B5. Not designed, so it reuses the marketplace dialog's look.

**Form contract**

| Element             | Behaviour                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open                | Rail Save (R wires `setDialog("save")`), enabled when at least one skill is selected                                                                                                                                                                                                                                                          |
| Field               | "Name", `Input variant="dialog"`, empty, placeholder `e.g. client work`, `initialFocus` (marketplace-dialog.tsx:188-197 [V])                                                                                                                                                                                                                  |
| Validation          | Runs on submit, then again on every change after a failed submit. Trim the name. Empty → "Give this stack a name." Over 80 characters (the server's `nameSchema`) → "Keep the name to 80 characters or fewer." A case-insensitive match against any name the stack grid draws → "There's already a stack called “<name>”. Pick another name." |
| Message             | `Note role="alert"` below the field (marketplace-dialog.tsx:113-119 [V]). Extract `Field`/`Note` or reuse them                                                                                                                                                                                                                                |
| Submit              | Enter or Save. Signed out: `save(name, payload)` locally. Signed in: mint, then `saveToAccount(name, id)`                                                                                                                                                                                                                                     |
| Pending (signed in) | Save is disabled and reads "Saving…", Cancel is disabled, the field is read-only                                                                                                                                                                                                                                                              |
| Failure             | The dialog stays open with the name kept. The Note shows the narration (`SAVE_NARRATIONS` words, moved from roster-panel into a V lib file). The rail button no longer narrates                                                                                                                                                               |
| Success             | The dialog closes, focus goes back to Save, and the new cell appears newest-first after Start from scratch                                                                                                                                                                                                                                    |
| Cancel / Esc        | Closes and writes nothing                                                                                                                                                                                                                                                                                                                     |

**Model:**

- `ST/saved-stack-store.ts` holds `saves: { id, name, payload }[]`, newest first.
  - `id` comes from `crypto.randomUUID()` and is never derived from the name (EDITOR-74).
  - `save(name, payload)` refuses a taken name and returns a result.
  - **New storage key, no `migrate`** (owner 2026-10-11: no back-compat). The old
    `agents-inc:saved-stack:v1` slot is not read (its payloads are v5, refused anyway). Delete `SAVED_STACK_NAME`.
  - A `merge` through `readSavedStacks` drops undecodable entries one at a time.
- `ui-store` `StackRequest` saved variant becomes `{ kind: "saved"; saveId; name }`. V is the only
  phase-2 writer of ui-store.ts.
- Grid (`stack-grid.tsx`):
  - One cell per local save, keyed `saved:<id>`, using the existing `keepsLocalSlot` condition.
  - `isApplied` per save via `matchesSavedStack`.
  - The switch dialog names the save, and the apply hook finds it by id.
  - Copy at :139 [V]: "under Sub-agents" becomes "under assign skills".
- Adoption (`account-store.ts`):
  - On the first sign-in with an empty account, every local save is adopted in save order under its
    own name.
  - `unadopted` becomes per-save; the grid keeps drawing refused saves, and the notice states the
    count and the reason.
- Server: no change, no 409, no DB constraint (see Out of scope).

**Owned:** `CF/components/save-stack-dialog.tsx`; new `CF/lib/save-stack.ts` (the save path and the
narrations); new `CF/lib/{save-name,save-name.test}.ts`;
`ST/{saved-stack-store,saved-stack-store.test,account-store,account-store.test}.ts`;
`ST/ui-store.ts` (`StackRequest` only); `CF/components/{stack-grid,stack-switch-dialog}.tsx`;
`CF/lib/use-apply-stack-request.ts`; `CF/components/marketplace-dialog.tsx` (only to extract
`Field`/`Note`); `E2E/pages/dialogs.ts`; `E2E/support/auth.ts` (if needed);
`E2E/specs/{save-stack,saved-stack-applied,saved-stack-apply,accounts,scope-reach,dialog-focus}.spec.ts`.

**Tests first:**

- `save-name.test.ts` (red: no module):
  - `''` and `'   '` are empty.
  - 81 characters is too long.
  - `' weekday '` is taken when `Weekday` exists.
  - `Weekday 2` passes.
- `saved-stack-store.test.ts` (red: single slot):
  - A value under the old v1 key is ignored (starts empty).
  - Reading drops only the entry carrying `v: SEED_VERSION - 1`.
  - `save('A')` then `save('B')` gives two entries; then `save('a')` is refused.
- `account-store.test.ts`: two local saves give two POSTs named `A`, `B`. Red: one POST,
  "Saved stack".
- `save-stack.spec.ts` (red: Save saves at once):
  - Save opens the dialog and storage is still null.
  - `Weekday` appears in the grid.
  - Cancel adds nothing.
  - In one test, a taken name (any case, padded) shows the alert and writes nothing, and a fresh name
    is accepted.
  - Two names give two cells, and the first is kept.
  - Applying `A` asks "Switch to A?" and restores it.
  - A save under the retired single-slot key draws nothing (no migrate, Q4).
- `accounts.spec.ts` (red):
  - Signed in, `created[0].name` is the typed name.
  - A name already among the account's stacks is refused with no POST `/configs`.
  - A refused mint shows in the dialog with the name kept.
- `dialog-focus.spec.ts`: closing the save dialog hands focus back to Save. Red: there is no dialog.

**Old tests to rewrite:**

- Worklist: `grep -rn 'saveButton' apps/editor/e2e/specs`. Every click that expected an immediate
  save gains `SaveStackDialog.saveAs(name)`.
- save-stack.spec "re-saving overwrites the single slot" becomes "a second name adds a second cell".
- Refusal narrations move from the button to the dialog (accounts, scope-reach).
- Single-slot reads in saved-stack-store.test, and the `SAVED_STACK_NAME` expectations in
  account-store.test.

**Acceptance:**

- Light and dark, keyboard only: open, type, Enter, and the cell appears.
- A duplicate is refused in place.
- Signed in with one offline refusal, the dialog stays open with the name intact.

---

## Lane X — Codex models (contract change, phase 2)

**Codex can pin a per-agent model.** A role file's top-level `model` drives the spawned child
(measured on the pinned `@openai/codex` 0.155.1). It is unwritten today only because every
`MODEL_NAMES` member is a Claude selector (`agent-role-toml.ts` `scalarLines` docblock).

**Shape: a second per-agent field, `codexModel`, beside `model`.** Both pins travel and each
provider reads its own, so ruling 3 holds. Widening `model` instead leaves one slot, and a Codex
pick would erase the Claude pin.

| `CODEX_MODEL_NAMES` | Label |                   |
| ------------------- | ----- | ----------------- |
| `gpt-6-astra`       | astra | 0.155.1's default |
| `gpt-5.6-sol`       | sol   |                   |
| `gpt-5.6-terra`     | terra |                   |
| `gpt-5.6-luna`      | luna  | the small slot    |

- **Not offered:** `gpt-5.5`, which refuses `max` and has no spawn tool, and every hidden id.
- **Effort stays one shared field.** Every offered id takes all five `EFFORT_NAMES`, so there is no
  `codexEffort` and no clamp. The smoke test guards this.
- **The list is pinned to the binary.** Re-derive it with
  `HOME=$(mktemp -d) CODEX_HOME=$(mktemp -d) node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex debug models --bundled`.

| Layer                                                    | Absent                                                   | Set                                                                                           | Unknown id                                                       |
| -------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Wire `seedAgentSchema.codexModel` (non-empty **string**) | session model                                            | carried                                                                                       | decodes; each consumer drops it                                  |
| `SEED_VERSION`                                           | 6. The decoder accepts **6 only** (Q4, owner 2026-10-11) |                                                                                               |                                                                  |
| Editor stored entry                                      | `inherit` (resting, never stored)                        | stored                                                                                        | that field drops; the blob survives. `PERSIST_VERSION` unchanged |
| `config.ts` agent row (enum)                             | role inherits                                            | `codexModel` after `model`                                                                    | refused like an invalid `model`                                  |
| Claude frontmatter                                       | —                                                        | ignored; `agent.liquid` untouched                                                             | —                                                                |
| Codex role TOML                                          | no `model` line; effort only if set (today's bytes)      | `model = "<id>"` plus `model_reasoning_effort` = config effort ?? metadata effort ?? `medium` | —                                                                |

- **String on the wire:** Codex retires ids (`gpt-5.4`, 2026-08-31). An enum would turn each
  retirement into a version bump that kills links. Every authoring surface keeps the enum.
- **`medium` with a pin:** a role with no effort inherits the parent's. A parent on `ultra` would hand
  `luna` an effort that luna refuses at spawn; Codex's docs say to set the effort in the file.
  `medium` is accepted by every offered id and is what the card shows at rest.

**Back-compat:**

- **v5 links and saves:** refused, per discard-don't-migrate (Q4). The refusal text must name the fix (re-share / re-save).
- **A stale CLI on a v6 id:** refused by the fetch-seed.ts "not in a format this version" text.
- **A stale worker:** answers a v6 POST with 409. **Deploy the worker first.**
- **Saved editor state:** parses without the field, so there is no persist bump (a bump wipes every save).
- **`config.ts` on disk:** absent behaves as today. A project's emitted `config-types.ts` lacks the key
  until it is regenerated, so only a hand edit hits it. An old CLI strips the key; that cannot be fixed.

**CLI consumption** (no new flag or exit code):

- **Install:** `init --from <id> --provider codex|claude` writes `codexModel` on either provider,
  since `config.ts` is provider-neutral.
- **Unknown wire id:** the key is not written and the exit code is unchanged. The `diagnostics().warn`
  pattern is `reportAbsentSkills` (seed-to-config.ts), and the text is:
  `Sub-agent '<agent>' asks for Codex model '<id>', which this version of the CLI does not offer, so it runs on the session's model. Offered: <inAnEnglishList(CODEX_MODEL_NAMES)>.`
- **Other paths that carry it:**
  - `edit` keeps it (wizard-store `tuningOf`), and `describeTuning` adds `codex model <id>`.
  - `share` carries it (config-to-seed.ts).
  - `restatesAgent` (seed-apply.ts) compares it.

**Copy-by-field sites.** A missed site drops the field with no type error, so each one gets a test.

- **Worklist:**
  `grep -rnE '\b(entry|agent|agentConfig|chosen|named|held|resting)\??\.model\b' packages apps --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
- **Also:** `CANONICAL_AGENT_ENTRY_ORDER`, ordered `name scope model codexModel effort excluded`.
- **Not X's:** `loader.ts` (metadata), `agent-source.ts` (Claude), `derive.ts` and
  `roster-panel.tsx` (R deletes them in A4), and `config-store.ts` (C's "For lane X" bullet).

**X1, `cli-developer`, runs first. X2 starts when step 1 is green.**

1. `packages/cli/src/cli/types/matrix.ts` (`CODEX_MODEL_NAMES`, `CodexModelName`); `types/config.ts`
   (`AgentScopeConfig`, `CompileAgentConfig`); `types/agents.ts` (`AgentConfig` only, never
   `BaseAgentFields`); `bun run generate:matrix`; `packages/matrix/src/{index,seed}.ts`.
2. `packages/compile/src/{seed-to-config,config-source,config-types-source}.ts` and
   `providers/codex/{agent-role-toml,roster}.ts`. Rewrite their "every model is Claude's" docblocks.
3. `packages/cli/src/cli/lib/{schemas,resolver}.ts`, `lib/installation/local-installer.ts`,
   `stores/wizard-store.ts`, `lib/seed/{config-to-seed,seed-apply}.ts`, `commands/edit.tsx`
   (`describeTuning` only); `packages/api-mocks/src/fixtures.ts` if a v6 fixture is needed.
4. New `e2e/commands/init-from-codex-model.e2e.test.ts` (patterns: `init-from-scenarios-tuning`,
   `provider-arrives-on-the-command`), new `e2e/smoke/codex-role-model.smoke.test.ts` (pattern:
   `codex-agent-role-schema.smoke`), and a unit test beside each file.

**X2, `web-developer`:**

- **Files:** `ST/{persisted-schema,persisted-schema.test}.ts` (F's in phase 1, so start after F
  lands; F's edits to the test file are uncommitted now); `CF/lib/{seed,seed.test}.ts`;
  `CF/lib/output-preview.ts`, only to copy `codexModel` beside `model` in the AgentConfig build, plus
  its test; `E2E/support/catalog.ts` (`AGENT_OPTIONS.codexChoices`); new `E2E/specs/codex-model.spec.ts`.
- **Exports:** per Cross-lane contracts. Labels are `CODEX_MODEL_LABELS satisfies
Record<CodexModelName, string>`, so a new id without a label is a type error.

**Off-limits:** `ui-store.ts` (the ruling-3 docblock stays true), `agent.liquid`,
`packages/cli/src/schemas/*.json` (`git diff` empty), and `apps/server` code.

**Tests first** (red before the change, except the two marked guard):

| File                         | Asserts                                                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| init-from-codex-model.e2e    | `--provider codex` with `codexModel: 'gpt-5.6-terra'`, `model: 'haiku'`: the TOML has `model = "gpt-5.6-terra"` and `model_reasoning_effort = "medium"`; `config.ts` keeps both keys                                          |
| ″                            | With `effort: 'high'` too, the TOML effort is `high`                                                                                                                                                                          |
| ″                            | Same id on `--provider claude`: frontmatter `model: haiku`, no `gpt-` under `.claude/`, and `config.ts` still has `codexModel`                                                                                                |
| ″                            | No `codexModel`: the TOML bytes equal today's (guard)                                                                                                                                                                         |
| ″                            | A v5 payload is refused with the version message. `codexModel: 'gpt-4o'` exits 0 with the warning, and no key or `model` line is written                                                                                      |
| ″                            | A hand-written `codexModel: 'nope'` exits with the same code and message shape as `model: 'nope'`. `share` carries a pin                                                                                                      |
| codex-role-model.smoke       | Each offered id is non-hidden in `debug models --bundled`, with efforts ⊇ `EFFORT_NAMES`. A role with `model = <id>` reads "This role's model is set to `<id>`" in the roster (guard: a pin bump that drops an id fails here) |
| compile / matrix / cli units | The emitted `codexModel?:` line is ≤ 100 cols (emission-scenarios). Entry order holds. The "no `MODEL_NAMES` member reaches a role file" test still holds. v6 decodes; v5 and v7 are refused. Every copy site keeps the field |
| persisted-schema.test        | A blob without the field parses. An unknown id drops only that field. `modelChoicesFor('codex')` is the four (S2). `modelPatchFor` / `chosenModelFor` work on both providers                                                  |
| seed.test (editor)           | Round trip. An unknown id is pruned. `inherit` never reaches the payload                                                                                                                                                      |
| codex-model.spec             | A stored pin puts `v: 6` and `codexModel` in the payload. The payload is byte-equal on Claude and Codex (ruling 3). The Codex preview shows `model = "…"`                                                                     |

**Acceptance (step 4) needs the owner's ChatGPT account.** In a real Codex session, spawn a role
pinned to each offered id. Codex does not validate role ids, so only a real plan proves each one is
served.

**Left for lane I:** codex-keeper corrects `model-and-effort.md`, which says the Codex role "passes
`model` through". Then bind `CODEX_MODEL_NAMES` in `check-enumeration-drift.ts`.

---

## Lane S2 — Codex model toggles (Q5, after lane I)

**Owned:** `CF/components/sub-agent-card.tsx`; `ST/{persisted-schema,persisted-schema.test}.ts` (`modelChoicesFor`/`chosenModelFor`/`modelPatchFor` only); `E2E/pages/sub-agent-cards.ts`; `E2E/support/catalog.ts` (`codexChoices`); `E2E/specs/{sub-agent-cards,codex-model}.spec.ts`; any other spec asserting the Codex `inherit` radio (`grep -rn "inherit" apps/editor/e2e`).

**Tests first:**

- On Codex, "Model for `<id>`" is a `group` of four `button`s named by id (`gpt-6-astra` …), visible text the short label, none `aria-pressed` at rest. No `inherit` control anywhere.
- Press terra: pressed; payload `codexModel: 'gpt-5.6-terra'`. Press it again: none pressed; payload has no `codexModel`. Survives a reload.
- Claude unchanged (radiogroup, resting model checked). Switching provider keeps each pin.
- At 1684 on both providers row 2 is one segment tall; at 1200/1500 it wraps, never clips (existing tests).
- `modelChoicesFor('codex')` is the four ids.

## Lane V2 — owed save whose name the account has (Q10, after lane I)

**Owned:** `apps/editor/src/stores/{account-store,saved-stack-store}.ts` (+ tests); `CF/components/save-stack-dialog.tsx`; `CF/lib/{save-name,save-stack}.ts` (+ tests); `E2E/specs/{accounts,save-stack}.spec.ts`; `E2E/pages/dialogs.ts`.

**Behaviour:** an owed save whose name the account lists (`sameName`) is neither carried nor forgotten. It stays owed, and on sign-in the Save dialog opens on it: name prefilled, field in error (`aria-invalid`, message linked by `aria-describedby`). Saving under a unique name renames and carries it. Cancel leaves it owed (asked again next sign-in). Several clash: one dialog at a time, oldest first. The `taken` message says names must be unique (e.g. "Names must be unique. There's already a stack called “X”.").

**Tests first:**

- An owed save "Alpha" (a refused first sign-in); next sign-in to an account listing "alpha": dialog open, field "Alpha", unique-name error on the field, no POST.
- Rename to "Alpha 2", Save: account lists both; `owed` empty.
- Cancel: no POST, still owed; next sign-in reopens the dialog.
- A normal save typing a taken name shows the same message on the field.

## Lane T — stuck domain tabs (Q11, owner 2026-10-11)

**Owned:** `CF/components/domain-tabs.tsx`; `CF/components/filter-bar.tsx` (the pinned spacer calc only); `CF/lib/{use-active-domain,use-domain-scroll,use-scroll-clearance}.ts` only if they hard-code the pinned tab height or strip inset; `E2E/specs/{sticky-bar,domain-tabs}.spec.ts`; their page objects.

**Behaviour (stuck only; at rest unchanged):** each tab cell is `3rem` tall (was `1.625rem`). The strip keeps `px-gutter`: the first tab's text starts and the last tab's ends inside the page padding, at the same x as at rest. Only the strip's background and bottom hairline run the full bar width. The indicator stays under the current tab. Sticking still causes no scroll jump.

**Tests first:**

- Stuck: every tab cell height = 3rem (computed px = 3 × root font size).
- Stuck: first cell left and last cell right equal their at-rest x (inside the gutter); strip background box and hairline span the bar's full width.
- Stuck: indicator left/width equal the current cell's.
- Sticking moves no content (the spacer test, re-derived for 3rem); a tab click still lands its section just below the stuck bar.

## Lane I — integration (phase 3, alone)

1. Migrate the `roster.setModel/setEffort/setScope` callers to `SubAgentCards`, then delete the
   delegates. Worklist: `grep -rnE 'roster\.(setModel|setEffort|setScope)\(' apps/editor/e2e`.
   Optionally wire `subAgents` and `saveStackDialog` onto `ConfigurePage`.
2. Delete `Hinge`'s `control` slot and its story (`grep -rn 'control=' apps/editor/src packages/ui/src`).
3. Delete `DomainTab.index`, its computation and its test once
   `grep -n 'tab.index' apps/editor/src/features/configure/components/domain-tabs.tsx` is empty.
4. Run the unfiltered gates from the repository root, with visible output: `bun run lint`,
   `bun run typecheck`, `bun run test`, `bun run test:e2e`, `bun run build`. Then run
   `bun run test:visual` in `apps/editor`. Report changed Argos and Chromatic baselines for human
   approval; never auto-accept.
5. Hand-run in light and dark, on Claude and Codex, at widths 1200, 1500 and 1684, against every
   lane's named screens.
6. Docs go through `codex-keeper`, changing only the sentences the work made false. Worklist:
   `grep -rn -i -E 'provider row|choose your stack|grouped by|Saved stack|one slot|three words|options panel|of [0-9]+ selected|stack grid is folded|−. button' apps/www/src/content/docs/docs`.
7. Report the corrections. The orchestrator updates `todo/`: a Phase H section in the README and its
   dispatch log, the now-stale ruling 2b paragraph (README:128-131), archive and roadmap.

---

## Rulings applied

| v6 says                                                                               | Ruling or decision                                                                                                                                                                | Built instead                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Provider defaults to Codex (v6:1072)                                                  | Ruling 3 (`todo/plans/CLI-codex-provider-plan.md:209,:419`): provider is transient and never in the payload                                                                       | Defaults to Claude; reload lands on Claude                                                                           |
| Effort `low·med·high·max` / Codex `min·low·med·high`                                  | README "What the design file gets wrong" + the effort hazard                                                                                                                      | 5 levels `low medium high xhigh max` on both providers                                                               |
| Models `sonnet·opus·haiku` / `codex·gpt-5·mini`                                       | Owner ruling 2026-10-11: real Codex models on Codex (Lane X)                                                                                                                      | Claude: `opus fable sonnet haiku`. Codex: `CODEX_MODEL_NAMES` (`gpt-6-astra gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna`) |
| 23-agent roster, per-role defaults (v6:1043-1052, :1237)                              | Contract roster `SUB_AGENT_GROUPS`, `restingAgentOptions`                                                                                                                         | 18 agents, catalogue model / `medium` / `global`                                                                     |
| Card line `#dcd7c9`                                                                   | Palette merge 2026-08-29 (`archive.md:5184`), pinned by design-tokens.spec                                                                                                        | `hairline`                                                                                                           |
| New hexes (§2–§7)                                                                     | Same merge rule (ΔE < 2.3)                                                                                                                                                        | Semantics on existing cores; two new cores (F.5)                                                                     |
| Inactive segments `#a19d90` (2.6:1); DECISIONS.md wanted `#5f5c52` for the filter     | CHANGES-v6 beats DECISIONS; `color-contrast` held out by owner ruling 2026-08-07 (packages/ui/CLAUDE.md)                                                                          | `field-faint` as drawn                                                                                               |
| Card controls `stopPropagation`                                                       | packages/ui/CLAUDE.md "Semantics live in the tree": sibling overlay                                                                                                               | `LatticeCellButton` under the controls                                                                               |
| Titles draw no focus state                                                            | packages/ui/CLAUDE.md "One focus treatment"                                                                                                                                       | Ring, and the glyph shows on `focus-visible`                                                                         |
| Tab click filters (`pickedDom`)                                                       | EDITOR-79 (`archive.md:6632`)                                                                                                                                                     | Click scrolls; the indicator is always scroll-driven                                                                 |
| Search takes focus when the bar sticks (v6:1085)                                      | README "What the design file gets wrong"                                                                                                                                          | No focus grab                                                                                                        |
| `.barwrap −20 / .barband 20` pull                                                     | filter-bar.tsx decision (the pull oscillated)                                                                                                                                     | Delivered by title `mb` 20 alone                                                                                     |
| Rule 2 moves remembered data on switch                                                | Collides only with the `setProvider` comment. D3 (never eject, never rewrite a selected placement) and ruling 3 (`remembered` never travels: seed.ts:121, :196-207 [V]) both hold | Built as the v6:1222-1236 invariant (switch + deselect while on Codex)                                               |
| Codex rule 3 error                                                                    | D3 / no plugin-to-eject fallback                                                                                                                                                  | Selection kept; error drawn on the cell                                                                              |
| Summoners absent from v6 roster                                                       | D18                                                                                                                                                                               | Disabled card with the reason, press refused                                                                         |
| CHANGES §10 "Don't build a naming UI"; README ruling 2b "one slot, no naming surface" | The owner's direct request in this run                                                                                                                                            | The dialog plus named saves (lane V)                                                                                 |
| Equal tabs (`flex:1`)                                                                 | e01fea0a (2026-09-07) was an implementation decision, not an owner ruling, and its cause (the index) is gone in v6                                                                | `flex-1` with the legibility fallback (S6a)                                                                          |
| Stuck strip gains geometry                                                            | Phase G "strip does not gain top padding" (README:294-297) was a repo decision                                                                                                    | v6, guarded by "column does not move" and the no-flip test                                                           |
| `@media ≤1300px` lets the search row wrap (v6:503)                                    | CHANGES §4 "never wraps at every width"; the repo's one threshold is 1500px                                                                                                       | Never wraps                                                                                                          |
| Rail header inset 16px                                                                | Equal-edge pin at 17px (roster.spec)                                                                                                                                              | 17px                                                                                                                 |
| `.plw em` `#242320` in the rail (v6:565)                                              | §7: "the step-title type"                                                                                                                                                         | `#161513` everywhere                                                                                                 |
| "multi" tag (unlisted)                                                                | The v6 spec file renders only "one of" (v6:690; v5:572 rendered both)                                                                                                             | "multi" removed                                                                                                      |
| PlacementNotice (v6 `.pfoot` has none)                                                | Design; the error now sits on the cell                                                                                                                                            | Notice removed; Install refusal kept (write contract)                                                                |

## Open questions for the owner

None of these blocks a lane. Each lane proceeds on the default.

| #   | Question                                                                                                    | Recommended default                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Codex model and effort lists                                                                                | **Ruled 2026-10-11:** real Codex models on Codex, as Lane X. Effort stays the shared five, since every offered model takes all five                                                           |
| Q2  | Which step folds survive a reload? The prototype persists none, and the editor persists 02 today            | Persist 01–03, as with `stackCollapsed`. Never persist 04, so a reload lands on the grid and `?domain=` links work                                                                            |
| Q3  | Save names are unique against what?                                                                         | Trimmed and case-insensitive against every name the stack grid draws (Start from scratch, catalogue stacks, local saves, account stacks). Refuse only, no Replace. No delete or rename UI yet |
| Q4  | **Ruled 2026-10-11 (owner): v6 only.** `SEED_VERSION` 6, `z.literal` kept; v5 links and saves stop decoding | —                                                                                                                                                                                             |

| Q5 | Codex model row wraps (5 segments vs design's 3) | **Ruled 2026-10-11 (owner):** no `inherit` segment. Codex shows `CODEX_MODEL_NAMES` only, as a `group` "Model for `<agentId>`" of toggle buttons (`aria-pressed`); none pressed = session model (stored resting `inherit`, never in the payload); pressing the pressed one clears. Claude keeps its radiogroup. `modelChoicesFor('codex')` loses `inherit`. Lane S2 |
| Q6 | Sub-agent card names truncate (Meta at 1684; most names at 1200/1500) | **Ruled 2026-10-11 (owner):** keep the ellipsis, every width |
| Q7 | Lane V `owed` saves retry into any account next signed in on that browser | **Ruled 2026-10-11 (owner):** keep as built |
| Q8 | Dark mode: step-title emphasis lost; light stuck band keeps dark-band inks | **Ruled 2026-10-11 (owner):** accepted as is (closes EDITOR-94) |
| Q9 | `--tip-field` warm-06 vs warm-02 (near tie) | **Ruled 2026-10-11 (owner):** warm-06 |
| Q10 | An owed save whose name the account already lists is dropped silently | **Ruled 2026-10-11 (owner):** error on the name field saying names must be unique. Lane V2 |
| Q11 | Stuck domain tabs | **Ruled 2026-10-11 (owner):** cells `3rem` tall stuck (not `1.625rem`); tab text stays inside the page padding, only bg + border run full width. Lane T |

## Out of scope

- Live Codex model discovery (app-server `model/list`, per account). X pins the list to the binary.
- Deleting or renaming saves. The worker has `DELETE` and `PATCH`; there is no UI.
- Server-side uniqueness. A `UNIQUE(user_id, name)` constraint would fail on existing duplicate
  "Saved stack" rows.
- EDITOR-74 (the mock's id comes from the name), EDITOR-78 and EDITOR-92.
- Unifying the three host-dir copies (install-dialog, output-preview, derive).
- `latticeRowVariants`, and the output preview, install, add-skill and composer surfaces. README and
  DECISIONS still govern those.
- Heading elements for step titles. Shortening the rail, which still lists every agent (§10).

## Corrections (to the audit lanes, re-derived 2026-10-11)

1. Lane 3 said v6-04…v6-16 are missing. False: `ls .claude-design/screens/v6-*.png` lists all 16.
2. Lane 3 said the nearest core to `#f1eee6` is warm-07. False: warm-06 `#f2f0e8` is at ΔE 0.62,
   and warm-07 is at 1.71.
3. Lane 2 said `#fbfaf7` has no primitive. It folds into warm-05 (`badge`) at ΔE 0.55.
4. Lane 3 said `#b5442c` is "near red-01". It is ΔE 4.96 away, over the 2.3 bar, so it needs a new
   core.
5. Lanes 1 and 3 said rule 2 collides with ruling 3. Ruling 3 is payload and share-id neutrality,
   and `remembered` never enters the payload. The collision is with an implementation comment only.
6. Lane 3 left the "multi" tag as an open question. The spec file settles it (v6:690 against
   v5:572).

Everything else the spec relies on held: the `HingeButton`/`action`/`field` consumers, the
roster-panel footer and save lines, `StackRequest`, `saved-stack-store`, the marketplace-store
migration precedent, `SUB_AGENT_GROUPS`, the persisted-schema exports, `SCOPE_BANDS`,
`selectedOnlyOptions`, the `DomainTab.index` sites and the skill-cell refusal wiring.
