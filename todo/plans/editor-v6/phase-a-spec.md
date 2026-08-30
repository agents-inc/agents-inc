# Editor v6 — Phase A implementation spec

**Programme:** [`README.md`](./README.md) · **Architecture decisions:** [`decisions.md`](./decisions.md)
**Tracker row:** EDITOR-09 · **Written:** 2026-08-26, re-derived against the live tree the same day.

Six items. Everything lands in `apps/editor` and `packages/ui`. **No new dependencies** —
`@base-ui/react` 1.6.0 is already a dependency and already ships `menu`, which A2 uses.

---

## Before you write a line

Read these, in this order. Every one of them is a pattern this spec tells you to follow, and
three of them contain a comment that this spec tells you to correct.

| #   | File                                                                                          | Why                                                                                 |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `/home/vince/dev/cli/CLAUDE.md` and `/home/vince/dev/cli/packages/cli/CLAUDE.md`              | the repository's rules; they override your defaults                                 |
| 2   | `/home/vince/dev/cli/apps/editor/e2e/README.md`                                               | the eight rules every new spec follows                                              |
| 3   | `/home/vince/dev/cli/packages/ui/src/styles/globals.css`                                      | the whole token vocabulary — A0 edits it, A1 deletes from it                        |
| 4   | `/home/vince/dev/cli/apps/editor/src/features/configure/components/roster-panel.tsx`          | A1, A2 and A4 all land here                                                         |
| 5   | `/home/vince/dev/cli/packages/ui/src/components/divider.tsx`                                  | `Hinge` and `Rule` — A3 and A4 both change it                                       |
| 6   | `/home/vince/dev/cli/packages/ui/src/components/button.tsx`                                   | `buttonVariants` — the cva shape A4 copies, and the `outline` arm A3's hover copies |
| 7   | `/home/vince/dev/cli/apps/editor/src/stores/ui-store.ts` and `stores/persisted-schema.ts`     | the two new persisted fields; read the hazard below first                           |
| 8   | `/home/vince/dev/cli/apps/editor/src/features/configure/lib/derive.ts` — `selectRosterGroups` | A2 changes its signature and its return type                                        |
| 9   | `/home/vince/dev/cli/apps/editor/src/features/configure/components/filter-bar.tsx`            | A5's subject; already shipped, verify before touching                               |

### The unit conversion, stated once

Every design measurement in this spec is quoted in **design px**, exactly as the prototype
declares it. **The editor's mapping is `px ÷ 16 = rem`**, and nothing here is written in px except
borders. Verified against three shipped constants: `--spacing-gutter: 3.75rem` = 60px,
`pl-[1.0625rem]` = 17px, `BAND_REM = 1.625` = 26px. The `:root { font-size: 110% }` knob then
scales the whole result, which is why nothing may be written in px.

### Five rulings that are already made

Do not re-litigate these and do not follow the design file where it contradicts them.

1. **Effort keeps five members spelled `low, medium, high, xhigh, max`.** The design draws four
   and spells the middle one `med`. Narrowing the scale makes `agentEffortSchema` reject a stored
   `xhigh`, which fails the whole `safeParse` in `config-store`'s `merge` and **discards the
   visitor's entire saved configuration**. Renaming `medium` breaks the share-link wire contract in
   both directions. A1 is a meter-to-word change and nothing else. The precedent is `AGENT_MODELS`
   in the same file, which already renders four where the design draws three.
2. The emitted type alias is `AgentName`, not `AgentId`. (Phase B; recorded here so it is not
   re-argued.)
3. The generated types file is `config-types.ts`, not `config.d.ts`. (Phase B.)
4. **The editor deliberately does not focus the search input when the filter bar sticks.**
   `filter-bar.tsx` says why and `sticky-bar.spec.ts` pins it in three tests. The design line
   saying it does is stale.
5. **Adding a persisted UI field is a live hazard.** See the cross-cutting section — every new
   persisted key must be `.catch()`-ed and the store version must NOT be bumped.

---

## Cross-cutting: the two `ui-store` fields, and the two `globals.css` edits

Two items want a field on `ui-store` and two items want an edit to `globals.css`. **Make one edit
to each file, not two.** Do this work first; A1–A5 all depend on it.

### The hazard, written out

`persistedUiSchema` in `apps/editor/src/stores/persisted-schema.ts` is a bare `z.object` with one
required key and **no `.optional()` and no `.catch()` anywhere**:

```ts
export const persistedUiSchema = z.object({
  rosterCollapsed: z.record(z.string(), z.boolean()),
})
```

`ui-store.ts` carries `version: 3` with **no `migrate` function**, and its `merge` is:

```ts
merge: (persisted, current) => {
  const parsed = persistedUiSchema.safeParse(persisted)
  return parsed.success ? { ...current, ...parsed.data } : current
},
```

There is no `reportIssue` on that failure path, unlike `config-store` and `marketplace-store`
which both report their discards. So a **required** new key silently resets every existing
visitor's `rosterCollapsed`, and a **version bump** silently discards it. Nothing pins the `3` —
there is no `ui-store.test.ts` at all.

### What to add

**`stores/persisted-schema.ts`** — one new enum trio, placed immediately after the
`AGENT_SCOPES` / `agentScopeSchema` / `AgentScope` group it mirrors, and two new keys on
`persistedUiSchema`:

```ts
// The two ways the roster can be banded. `domain` is the shipped arrangement
// and stays the default. Declared here, beside AGENT_SCOPES, because the menu
// reads the members and the schema reads the same array.
export const ROSTER_GROUP_BYS = ["domain", "scope"] as const
export const rosterGroupBySchema = z.enum(ROSTER_GROUP_BYS)
export type RosterGroupBy = z.infer<typeof rosterGroupBySchema>
```

```ts
export const persistedUiSchema = z.object({
  // Group key → that roster accordion is shut, sparse. Keyed by id rather than
  // position so a reordered catalog cannot collapse the wrong accordion.
  rosterCollapsed: z.record(z.string(), z.boolean()),
  // Both new keys are `.catch()`-ed rather than required. This schema gates
  // every read of localStorage and `merge` returns `current` on a failed parse
  // WITHOUT reporting — so a required key here would silently reset every
  // existing visitor's collapsed bands. `.catch()` makes an old blob holding
  // only `rosterCollapsed` parse successfully and fall back field by field.
  // For the same reason the store's `version` is NOT bumped: there is no
  // `migrate`, so a bump is an unreported discard of everyone's arrangement.
  rosterGroupBy: rosterGroupBySchema.catch("domain"),
  stackCollapsed: z.boolean().catch(false),
})
```

`.catch()` rather than `.optional()` deliberately: `.catch()` fires on a **missing** key as well as
an invalid one, so the parsed object always carries both keys with a valid value and the
`{ ...current, ...parsed.data }` spread cannot depend on whether Zod omits absent optional keys.

**`stores/ui-store.ts`** — two fields, two actions, two initial values, and both keys added to
`partialize`. The `partialize` comment stays true: all three are _arrangement_, not _transient_.

| Field            | Type            | Initial    | Action                                               |
| ---------------- | --------------- | ---------- | ---------------------------------------------------- |
| `rosterGroupBy`  | `RosterGroupBy` | `"domain"` | `setRosterGroupBy: (groupBy: RosterGroupBy) => void` |
| `stackCollapsed` | `boolean`       | `false`    | `toggleStackCollapsed: () => void`                   |

```ts
partialize: ({ rosterCollapsed, rosterGroupBy, stackCollapsed }) => ({
  rosterCollapsed,
  rosterGroupBy,
  stackCollapsed,
}),
```

**Do not bump `version: 3`.** Say so in a comment where the version sits.

### The collapsed-key namespace — why the two modes do not collide

`rosterCollapsed` is one record and A2 gives it a second key space. The rule:

- **domain mode writes the bare domain id** (`"web"`, `"api"`) — unchanged from today, so no
  existing visitor loses a collapsed band;
- **scope mode writes `"scope:global"` / `"scope:project"`** — prefixed, because a bare `global`
  is a plausible future domain id and a collision would silently collapse an unrelated band.

A domain id can never contain a colon: `DOMAIN_LABELS` in
`packages/matrix/src/read-model/domains.ts` holds nine bare lowercase words
(`web api ai mobile desktop cli infra meta shared`). So the two spaces are disjoint by
construction and neither mode has to reset the other's state — which is **better than the
prototype**, whose `pick` handler does `shut: {}` on every mode change precisely because its keys
do collide. Do not port that reset.

The alternative — namespacing both modes (`domain:web`) — was considered and rejected: it silently
reopens every already-collapsed band for every existing visitor and buys nothing.

### `globals.css` — one edit, two directions

A0 **adds five** tokens and corrects one citation. A1 **deletes two** tokens whose only consumer
it removes. Make both in one pass. Details in each item below.

---

## A0 — Design tokens

**Files:** `packages/ui/src/styles/globals.css` (only).

### Re-derivation

All five hexes verified absent from the token file and from every source file in
`packages/ui/src`, `apps/editor/src` and `apps/www/src`:

```
grep -rniE '#(eeece4|e7e4d9|3d3b33|a19d90|ece9e0)' packages/ui/src apps/editor/src apps/www/src
```

returns nothing. The design's use of each was read from
`.claude-design/design/Configurator v5.dc.html`:

| Hex       | Design selectors                                                            | Needed by        |
| --------- | --------------------------------------------------------------------------- | ---------------- |
| `#eeece4` | `.dseg` (composer segmented track), `.plink` (preview entry-point block)    | Phase B, Phase C |
| `#e7e4d9` | `.plink:hover`                                                              | Phase B          |
| `#3d3b33` | `.plink .pt`, `.dsg:hover`, `.otn`, `.ok`, `.barwrap.stuck .chipsep`        | Phase B, Phase C |
| `#a19d90` | `.bsearch i`, `.sfield i` (the `⌕` glyph), `.dta.ph` (composer placeholder) | Phase C          |
| `#ece9e0` | `.otree` right border (preview file-tree divider)                           | Phase B          |

Only one of the five is named in the design's own palette table
(`.claude-design/README.md` § "Visual language", row `track` = `#eeece4`). The other four are
unnamed there, so their names are derived from this file's grammar below.

### The naming grammar, as the file actually uses it

Read from the live `@theme inline` block:

- **Surfaces** name the thing they are (`page`, `column`, `cell`, `badge`, `code`), take `-hover`
  for the pointer state (`cell-hover`, `row-hover`, `line-hover`) and `-ink` for the text that
  sits on them — `--color-matrix: #f2f0e8` / `--color-matrix-ink: #5f5c52` is the one existing
  surface-and-its-label pair.
- **Ink** is a lightness ramp (`ink`, `ink-2`, `ink-3`, `subtle`, `faint`) with role-named members
  mixed in at their ramp position — `--color-dots` is the precedent.
- **Lines** are `<thing>-border` (`chip-border`, `field-border`, `dialog-border`,
  `matrix-border`) or a bare general-purpose name (`hairline`, `rule`, `divider`).

### What to add

**In `/* Surfaces */`, immediately after `--color-matrix-ink` and before `--color-code`** — the
structural twin of the `matrix` / `matrix-ink` pair directly above it:

```css
/* The recessed block: the composer's segmented track and the roster footer's
     preview entry point. The palette table names this one `track`. */
--color-track: #eeece4;
--color-track-hover: #e7e4d9; /* a recessed block under the pointer */
/* Its label — and, second duty, the preview dialog's tree filenames and its
     syntax-highlighted keys, which sit on no track at all. */
--color-track-ink: #3d3b33;
```

**In `/* Ink */`, between `--color-faint` and `--color-dots`** — which is its position in the ramp
(`#8b8778` → `#a19d90` → `#c4c0b3`):

```css
--color-field-faint: #a19d90; /* a field's own furniture: its ⌕ glyph, and the composer's placeholder */
```

**In `/* Lines */`, after `--color-matrix-border`:**

```css
/* One hex digit from --color-roster-band (#ece8dc), and a different surface:
     that one bands the roster, this one splits the preview dialog's two panes. */
--color-tree-border: #ece9e0;
```

### The citation correction

The `Configurator v5` block in `globals.css` — find it with
`grep -n 'Source of truth' packages/ui/src/styles/globals.css` — reads:

> `Source of truth: .claude-design/README.md § Design tokens, reconciled`

**That section does not exist.** The README's headings are: What's in this folder, Screens,
Layout, Section rules ("hinges"), Visual language, Skill grid, Filter bar, Roster panel, Panel
footer, Skill popup, Info affordance, Natural-language composer (docked), Output preview dialog,
Dialogs, Interaction rules, Data model, Open / not designed. The palette table lives under
**`## Visual language`**.

Change `§ Design tokens` to `§ Visual language`. Nothing else on that line or the next.

Verify with `grep -n '^## \|^### ' /home/vince/dev/cli/.claude-design/README.md`.

**`apps/www/src/styles/site.css` needs no change.** Re-derived — `grep -n 'Configurator v5'
apps/www/src/styles/site.css` — its citation reads
"the Configurator v5 palette" and names no section at all, so it is honest as written. The brief's
row expecting a second broken citation does not describe the tree — see Corrections.

### Success criteria

| Criterion                                                     | How to verify                                                                                                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five tokens exist, each in the block whose grammar it follows | `grep -n 'track\|field-faint\|tree-border' packages/ui/src/styles/globals.css` shows all five inside `@theme inline`                                                                                                   |
| No hex appears twice                                          | `grep -c '#eeece4' packages/ui/src/styles/globals.css` returns `1`; same for each of the five                                                                                                                          |
| The citation names a heading that exists                      | `grep -c '§ Visual language' packages/ui/src/styles/globals.css` returns `1` and `grep -c '§ Design tokens' … ` returns `0`; the named heading is present in `grep -n '^## ' .claude-design/README.md`                 |
| No token is used yet                                          | Phase A consumes none of them; `grep -rn 'bg-track\|text-track-ink\|text-field-faint\|border-tree-border' apps packages --include='*.tsx'` returns nothing. This is expected — four of the five land for Phase B and C |
| Nothing else moved                                            | `git diff --stat packages/ui/src/styles/globals.css` shows only additions plus the two `--color-meter-*` deletions from A1                                                                                             |
| The build still passes its budget                             | `bun run build` in `apps/editor` — the first-paint budget gate runs inside it                                                                                                                                          |

### Open question for the owner, not for the implementer

`#3d3b33` sits 1.5 ΔE from `--color-ink-2` (`#3a382f`) — imperceptible side by side — and
`#ece9e0` sits one hex digit from `--color-roster-band` (`#ece8dc`). Both may be authoring drift in
a hand-written prototype rather than intent. **Keep them distinct for now**: they are five separate
design colours and collapsing two of them is a design call the programme has not delegated.
Revisit when Phase B renders `--color-tree-border` and `--color-roster-band` in the same frame.

`--color-track-ink` is the one name here a reviewer may want to overturn: two of its five design
consumers are ink on the track (`.plink .pt`, `.dsg:hover`) and three are not (`.otn`, `.ok`,
`.chipsep`). It was named for the surface pairing because inserting a step into the numbered ink
ramp would mean renumbering `--color-ink-3` at every site
`grep -rn 'ink-3' apps packages --include='*.tsx' --include='*.ts' --include='*.css' --include='*.astro' | grep -v node_modules | grep -v '/dist/'`
reports, across three workspaces — a rename cascade A0 does not license.

---

## A1 — Effort becomes a cycling word

**Files:** `apps/editor/src/features/configure/components/roster-panel.tsx` (the change),
`packages/ui/src/styles/globals.css` (two token deletions),
`apps/editor/e2e/pages/roster-panel.ts` and `apps/editor/e2e/specs/roster.spec.ts` (the tests),
`apps/editor/e2e/specs/sharing.spec.ts` (one call site).

### What exists today

`EffortMeter` in `roster-panel.tsx` draws five 5px squares — `AGENT_EFFORTS.indexOf(effort) + 1`
filled — inside a `<button aria-label={`Effort for ${agentId}: ${effort}`}>`. Its docblock reads:

> `// Five squares, one per level — the design draws three because its placeholder`
> `// scale had three; the contract's scale has five and the meter follows it.`
> `// Drawn, never written, so the value lives in the accessible name alone.`

**That comment is factually wrong about the design and is deleted with the code, not carried
over.** The design does not draw three squares — it draws a **word**, and `DECISIONS.md` records
the three-square meter as _built and rejected_ ("max effort was unreadable"). Verify:

```
grep -o "EFFORTS *= *\[[^]]*\]" "/home/vince/dev/cli/.claude-design/design/Configurator v5.dc.html"
```

### What to build

Rename `EffortMeter` → `EffortWord` and replace its body. Its props are unchanged
(`{ agentId, effort, on }`). Its call site in `AgentBlock` changes name only — it stays the middle
of the three, between `<ModelWord>` and `<ScopeWord>`.

**Exact visual result.**

| Property                             | Value                                                                               | Token / utility                   |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------- |
| face                                 | IBM Plex Mono 500 at 9.5px, no tracking, no transform                               | `font-mono text-9_5 font-medium`  |
| text                                 | the contract value **verbatim and lowercase** — `low` `medium` `high` `xhigh` `max` | —                                 |
| resting, agent on, at default        | `#5f5c52`                                                                           | `text-matrix-ink`                 |
| resting, agent on, at default, hover | `#161513`                                                                           | `hover:text-roster-ink`           |
| agent on, **off** default            | `#a06a1c`                                                                           | `text-brand-ink`                  |
| agent on, off default, hover         | **`#a06a1c` — no change**                                                           | no hover class on this arm        |
| agent off (recessed)                 | `#b4b0a2`, amber suppressed                                                         | `text-roster-off`, no hover class |
| width                                | a right-aligned floor so the row does not jitter as the word cycles                 | `min-w-[2.25rem] text-right`      |

`min-w-[2.25rem]` is 36px. The widest member is `medium` at 6 characters; IBM Plex Mono's advance
is 0.6em, so 6 × 0.6 × 9.5 = 34.2px. 36px clears it. The design puts `min-width:26px` on `.agef`
for exactly this reason and 26px was sized for its own four-member scale — re-derive rather than
copy the number. The row's other two words have no floor and are allowed to reflow, as today.

**Amber has no hover state, deliberately.** The design's cascade produces this by accident
(`.agef.alt` is declared after `.agef:hover` at equal specificity); here it is explicit, and the
principle is the design's own: amber means "the user chose this", so hover must not mask it. Write
that as the comment.

**When it is amber.** The design says "off the role's default". **The editor has no per-role effort
default and this spec does not invent one.** `persisted-schema.ts` says so in as many words:

> `// Agent metadata carries no effort level yet, so every agent rests on the same`
> `// middle of the scale until the CLI adds one.`
> `const RESTING_EFFORT: AgentEffort = "medium"`

The honest test is therefore against the row's own resting value, **written through the exported
resolver rather than against the literal**:

```ts
const isDefault = effort === restingAgentOptions(agentId).effort
```

`restingAgentOptions` is already exported from `stores/persisted-schema.ts` and is pure. Written
this way the rule is `effort !== "medium"` today and becomes genuinely per-role the day the CLI
adds an effort to agent metadata, with no edit here. Written as `effort !== "medium"` it would not.
Put that reason in the comment.

Compute it inside `EffortWord` rather than adding a field to `RosterAgentRow`: the function is
already exported and pure, the change stays inside A1's named file, and adding a field to the
roster row shape would touch every spec `grep -c 'it(' apps/editor/src/features/configure/lib/derive.test.ts`
counts under its two roster blocks, for a boolean only one word needs. Cite this decision in the comment so a reviewer does not read it as a bypass
of the derive layer.

**Cycle order.** `nextInCycle(AGENT_EFFORTS, effort)` — unchanged. `low → medium → high → xhigh →
max → low`. The helper already lives in this file and both other words use it.

**Accessible name.** `Effort for ${agentId}: ${effort}` — unchanged, so nothing that asserts on it
breaks. The value is now _also_ the visible text, which is what the model word already does.

**Delete from `globals.css`** — the two tokens and the three-line comment above them:

```css
/* The agent row's effort meter: an empty square's outline, and the fill on
       an agent that is switched off. A filled square on a live agent is
       `brand`, so it needs no token of its own. */
--color-meter-border: #d5d0c1;
--color-meter-off: #c8c4b6;
```

Verified: `grep -rn 'meter-border\|meter-off' apps packages --include='*.tsx' --include='*.ts'
--include='*.css'` returns exactly the two declarations and the two uses inside `EffortMeter`.
Nothing else reads them. Pre-1.0, so they go — no shim.

### Tests

**`e2e/pages/roster-panel.ts`** — rename `effortMeter(agentId)` → `effortWord(agentId)`. Its
locator (`/^Effort for ${agentId}:/`) is unchanged. **Correct the comment above the three
methods**: "the model word shows it, the meter only draws it" is no longer true of any of the
three; all three now show their value. Delete the clause rather than rewriting it.

**`e2e/specs/roster.spec.ts`** — the existing
`test("the effort meter rests on medium and cycles upward")` inside
`describe("agent model and effort")` is renamed for the behaviour
(`"the effort word rests on medium and cycles upward"`) and **gains a `toHaveText` assertion
beside its `toHaveAccessibleName`**, mirroring `test("the model word rests on the agent's own catalogue default")` in the same block
exactly:

```ts
await expect(effort).toHaveText(AGENT_OPTIONS.restingEffort)
await expect(effort).toHaveAccessibleName(
  `Effort for web-developer: ${AGENT_OPTIONS.restingEffort}`
)
```

The two-click arithmetic and the `xhigh` expectation are unchanged — they are the five-member scale
and they must stay red-if-narrowed.

**One new test, and it is the one that would catch a regression of the amber rule.** Nothing in the
suite asserts a colour on any of the three words today, so the "off the default" signal has no
channel at all. Add to the same `describe("agent model and effort")` block:

```ts
test("the effort word goes amber once it leaves the resting value", async ({
  configure,
}) => {
  const effort = configure.roster.effortWord("web-developer")

  // The channel first: at rest it is the ordinary word colour, so the
  // assertion below can distinguish a state from a stylesheet.
  await expect(effort).toHaveCSS("color", RESTING_WORD)
  await effort.click()
  await expect(effort).toHaveCSS("color", AMBER_TEXT)
})
```

with `RESTING_WORD = "rgb(95, 92, 82)"` and `AMBER_TEXT = "rgb(160, 106, 28)"` as file-local
constants carrying their hex in a comment — the same shape as `DARK_BAND` in `sticky-bar.spec.ts`.
This satisfies e2e rule 8: the positive is established over the same channel before the change is
asserted.

**`e2e/specs/sharing.spec.ts`** — one call site (`grep -n 'effortMeter' apps/editor/e2e`), rename only.

### Success criteria

| Criterion                                    | How to verify                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The word renders the contract value verbatim | `roster.spec.ts` → `toHaveText("medium")` at rest                                                                                                                                                                              |
| Five members, in contract order              | the two-click test still lands on `xhigh`; `AGENT_EFFORTS` is untouched — `git diff apps/editor/src/stores/persisted-schema.ts` is empty for A1                                                                                |
| Amber marks the non-default                  | the new colour test passes both assertions                                                                                                                                                                                     |
| Amber does not darken on hover               | no `hover:` class on the amber arm — read the diff                                                                                                                                                                             |
| The recessed agent shows no amber            | manual: pin `web-developer` off, set its effort to `max`, the word is `#b4b0a2`                                                                                                                                                |
| No square survives                           | `grep -c 'meter-off\|meter-border' apps/editor/src/features/configure/components/roster-panel.tsx` returns `0`                                                                                                                 |
| The stale docblock is gone, not moved        | `grep -c 'the design draws three' apps/editor/src/features/configure/components/roster-panel.tsx` returns `0`, and `grep -rc 'the design draws three' apps packages --include='*.tsx' --include='*.ts'` returns `0` everywhere |
| The two dead tokens are gone                 | `grep -c 'meter-border' packages/ui/src/styles/globals.css` returns `0`                                                                                                                                                        |
| Nothing else changed in the roster row       | `ModelWord` and `ScopeWord` are byte-identical in the diff                                                                                                                                                                     |
| Types                                        | `npx tsc --noEmit` in `apps/editor`, clean                                                                                                                                                                                     |

### Recorded divergences — do NOT act on these in A1

Both are real and both are outside A1's row. Report them; do not fix them.

1. **`ScopeWord` is not typographically the same word as `ModelWord`.** Model is
   `text-9_5 font-medium`; scope is `text-8 font-medium tracking-[.06em] uppercase`. The design
   gives all three `font:500 9.5px` lowercase. So "styled exactly like the model **and** scope words
   beside it" is not satisfiable as stated — this spec matches `ModelWord`, which is the one that
   already matches the design.
2. **`ScopeWord` has no amber state.** The design says scope is amber whenever it is `global`
   (`.agsc.alt`). The editor renders it in one grey either way. A1 introduces amber to the roster
   words for the first time; bringing scope in line is a second, separate change.

---

## A2 — Roster grouping toggle

**Files:** `apps/editor/src/features/configure/lib/derive.ts`,
`apps/editor/src/features/configure/components/roster-panel.tsx`,
`apps/editor/src/stores/ui-store.ts` + `stores/persisted-schema.ts` (see cross-cutting),
`apps/editor/e2e/pages/roster-panel.ts`, `apps/editor/e2e/specs/roster.spec.ts`,
`apps/editor/src/features/configure/lib/derive.test.ts`.

### The contract question, answered

**`derive.contract.test.ts` cannot break.** Re-derived:
`grep -i 'roster\|effort\|scope\|group' apps/editor/src/features/configure/lib/derive.contract.test.ts`
returns nothing. It imports only `selectDomainViews` and `selectReachability`, and its subject is
selection semantics — `impliedBy()` and `disabledIn()` against `SELECTION_SCENARIOS`. It never
calls `selectRosterGroups`. Its one `it.fails("surfaces a discouraged advisory…")` is a deliberate
`// KNOWN GAP:` on catalogue data; **leave it red**.

### What `selectRosterGroups` must return so one renderer serves both modes

Rename the type and one field, add one parameter. Everything else on the shape stays.

```ts
export type RosterGroup = {
  // Domain mode writes the bare domain id; scope mode writes `scope:<scope>`.
  // One record of collapsed state serves both, and the prefix is what keeps the
  // two key spaces disjoint — a domain id can never contain a colon.
  key: string
  label: string
  onCount: number
  agents: RosterAgentRow[]
}

export const selectRosterGroups = (
  config: ConfigSelection,
  groupBy: RosterGroupBy = "domain"
): RosterGroup[] => { … }
```

`RosterDomainGroup` → `RosterGroup`; `domainId` → `key`. The default parameter keeps every existing
spec inside `describe("selectRosterGroups")` compiling unchanged; the new scope specs pass
`"scope"` explicitly.

**`RosterAgentRow` gains nothing.** The scope-mode prefix is `DOMAIN_LABELS[row.agent.domainId]`,
already reachable, and `roster-panel.tsx` already imports `DOMAIN_LABELS` for `tipName`. Deriving
it in the component follows `tipName`'s shipped precedent in the same file.

|              | domain mode (default)                   | scope mode                                                                                             |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| source       | `SUB_AGENT_GROUPS.map(...)` — unchanged | `AGENT_SCOPES` re-ordered **global first**, each collecting every agent whose resolved `scope` matches |
| `key`        | `group.domainId`                        | `` `scope:${scope}` ``                                                                                 |
| `label`      | `DOMAIN_LABELS[domainId]` — unchanged   | the literal path: `~/.claude · global`, `./.claude · project`                                          |
| `onCount`    | agents in the group that are on         | same rule, recomputed per scope group                                                                  |
| empty groups | none exist by construction              | **omitted**                                                                                            |

Apply `.filter(group => group.agents.length > 0)` in **both** modes. It matches the prototype and
is a no-op for domain mode — `SUB_AGENT_GROUPS` is built by grouping agents, so no group is empty.

The band separator is a space, U+00B7 MIDDLE DOT, a space. The scope's own order in
`AGENT_SCOPES` is `["project", "global"]`; the bands are **global first**, so reverse it at the
band level rather than reordering the exported constant, which is a cycle order the scope word
depends on.

Agent rows, their skills, their three words, `usedBy` and the sticky mechanics are **byte-identical
between modes**. That is the point of the shape: one renderer.

### The header control

Replaces the bare `Sub-agents` heading. A4 gives the header its rule treatment; A2 gives it the
control. Land A4 first or land them together — they are the same three lines of JSX.

**Exact copy.** Label text node is `Sub-agents grouped by` — sentence case in the DOM, uppercased
by the `uppercase` utility. Control text node is the grouping key verbatim (`domain` / `scope`),
then one ASCII space, then **U+25BE** `▾` (bytes `e2 96 be`). No chevron rotation, no second glyph.

**Control styling** (`.grp` in the design):

| Property | Value                                                   | Utility                                                       |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| face     | IBM Plex Mono 400 at 9.5px, `.02em`, **not** uppercased | `font-mono text-9_5 font-normal tracking-[.02em] normal-case` |
| resting  | `#242320`                                               | `text-ink`                                                    |
| hover    | `#161513`                                               | `hover:text-roster-ink`                                       |
| layout   | never shrinks, never wraps                              | `shrink-0 whitespace-nowrap`                                  |

The design gives the control **no** hover and **no** open state — `.grp:hover` and `.grp.open` both
restate `#242320`, which the research flags as "the one interactive element in the roster with no
state styling". Give it a hover step to `text-roster-ink`. It is a one-token change that closes a
flagged defect and matches every other interactive word in the panel.

**Menu.** Use `@base-ui/react/menu` — `Menu.Root` / `Menu.Trigger` / `Menu.Portal` /
`Menu.Positioner` / `Menu.Popup` / `Menu.RadioGroup` / `Menu.RadioItem` /
`Menu.RadioItemIndicator`. Verified present in the installed `@base-ui/react@1.6.0`. The package's
stated convention is that primitives come from per-component `@base-ui/react` subpaths, and the
prototype's hand-rolled version has **no keyboard path at all**, no `role="menu"`, no
`aria-expanded` and no `aria-haspopup` — all of which the primitive supplies, along with Escape
dismissal and outside-click.

Menu surface (`.grpm`), all existing tokens:

| Property  | Design                                 | Utility                                                                                 |
| --------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| surface   | `#f6f4ed`, flat — no border, no shadow | `bg-tip-field`                                                                          |
| padding   | `7px 10px`                             | `px-[0.625rem] py-[0.4375rem]` — identical to `WhereUsedTip`, which is the same surface |
| min width | `86px`                                 | `min-w-[5.375rem]`                                                                      |
| z         | above the sticky bands (`z-[5]`)       | `z-[130]`                                                                               |

Items (`.grpi`), one row per member of `ROSTER_GROUP_BYS`, in declaration order — `domain` then
`scope`, lowercase, no icons, no separator, no header row:

| State          | Design                                                            | Utility                                                     |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| face           | Plex Mono 400, 8.5px, line-height 1.75, no tracking, no transform | `font-mono text-8_5 leading-[1.75] font-normal normal-case` |
| resting        | `#5f5c52`                                                         | `text-matrix-ink`                                           |
| hover          | `#161513`                                                         | `hover:text-roster-ink`                                     |
| active         | `#a06a1c`, text only — no fill, no left edge, no bold             | `text-brand-ink`                                            |
| active + hover | **stays `#a06a1c`**                                               | no hover class on the active arm                            |
| layout         | `display:flex; gap:10px; white-space:nowrap`                      | `flex gap-[0.625rem] whitespace-nowrap`                     |

The tick is **U+2713** `✓` in a `Menu.RadioItemIndicator` with `margin-left:auto` (`ml-auto`).
**The indicator element renders in both states** — empty on the inactive item — so the row height
never changes. The design achieves that with an always-present `<span class="tk">`; base-ui's
`keepMounted` on the indicator is the equivalent, or render the `ml-auto` span unconditionally and
put the glyph inside the indicator.

The active-plus-hover rule reverses the design's cascade accident, which the research measured:
`.grpi:hover` is declared after `.grpi.on` at equal specificity, so **hovering the already-active
item makes it look inactive**. Same principle as A1's amber.

**Anchoring.** `Menu.Positioner side="bottom" align="end"` with a `sideOffset` of `0.25rem` — the
menu opens under the control. The prototype anchors it to the panel's far right edge
(`right:2px; top:19px`), not under the control; that is deliberately **not** adopted, because it is
what floating positioning would have to be fought to reproduce, it is unconventional for a menu,
and the research notes the prototype's menu cannot escape `.roster`'s `overflow` in any case. An
owner-reversible call.

**On pick:** call `setRosterGroupBy(value)` and `setTip(null)`. The menu closes itself. The tip
must close for the same reason collapsing a band closes it — the change can take its anchor away,
and `RosterPanel` already does exactly this in the band's `onClick`. **Do not reset
`rosterCollapsed`**; see the cross-cutting namespace rule.

### Band rendering, per mode

The band `<button>` keeps everything it has: `sticky`, `z-[5]`, `h-[1.625rem]`,
`border-y border-roster-band`, `bg-page`, `pl-[1.0625rem]`, `top: index * BAND_REM`,
`aria-expanded`. Two things change with the mode:

|            | domain mode                                                                                                      | scope mode                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| label span | `text-7_5 font-semibold tracking-[.12em] uppercase text-ink-3`, text `group.label.toLowerCase()` — **unchanged** | `text-8_5 font-semibold tracking-[.02em] normal-case text-ink-3`, text `group.label` **verbatim** — the label is already a literal path and must not be lower-cased |
| count span | `{onCount} of {agents.length}` right-aligned — **unchanged**                                                     | identical, same place, same expression                                                                                                                              |

**The count expression is one expression and lives in the same place in both modes.** Only the
denominator's meaning changes: `4 of 7` reads "enabled Web agents of all Web agents"; `13 of 23`
reads "enabled agents at that destination of all agents at that destination". Do not write two.

**Sticky stacking.** `top: index * BAND_REM` where the index is into the **filtered** list, so it
reflows: move one agent to global and the `global` band takes index 0 while `project` moves to
`1.625rem`. That already falls out of the existing `groups.map((group, index) => …)` — no change.

### The domain prefix on agent rows, scope mode only

The band no longer names the domain, so the row does. Inside the agent's pin `<button>`, before the
role text node:

```tsx
{
  groupBy === "scope" && (
    <span className={prefixClass}>
      {DOMAIN_LABELS[agent.domainId].toLowerCase()} ·{" "}
    </span>
  )
}
{
  agent.label.toLowerCase()
}
```

Separator is space + U+00B7 + space. In domain mode the row renders the bare role, as today.

| Agent state | Prefix colour                                       | Role colour (unchanged)       |
| ----------- | --------------------------------------------------- | ----------------------------- |
| on          | `#8b8778` at weight 400 — `text-faint font-normal`  | `text-roster-ink font-medium` |
| off         | **`text-roster-off`** — the same colour as the role | `text-roster-off font-normal` |

The off row's rule is a **deliberate correction of a prototype defect**: `.fl.noagent .fln` recedes
the role to `#b4b0a2` but `.fln .dpx` targets the prefix directly and is not overridden, so on a
disabled agent the muted prefix renders **darker** than the role it prefixes. Inverted. One colour
for the whole name row when the agent is off. Write the reason as the comment.

The pin button already truncates — keep `truncate`/`min-w-0` behaviour intact so
`web · pattern critique` ellipsizes rather than pushing into the three words. The three words are
`flex-none`; that stays.

### Tests

**`derive.test.ts`** — a new `describe("selectRosterGroups grouped by scope")` beside the existing
block, using the same file-local `scratch` / `live` / `off` / `edit` builders. At minimum:

1. two groups, global first, with `toStrictEqual` on the two `key`s — `["scope:global", "scope:project"]`;
2. the labels are the literal paths, asserted as strings;
3. an agent moved to project scope leaves the global group and joins the project one;
4. **an empty scope is omitted** — with every agent at global, the result has one group;
5. `onCount` is recomputed per scope group, not inherited from the domain grouping;
6. the same agent's `skills`, `model`, `effort`, `scope` and `usedBy` are identical to the domain
   grouping's for the same input — the "one renderer" claim, asserted rather than assumed.

Assert group membership with `toStrictEqual` against named constants, never `toHaveLength`.

**`e2e/pages/roster-panel.ts`** — the existing `domainBand(domainId)` regex
`^${domainId} \d+ of \d+$` does not match a path label. Add, rather than widen:

```ts
// The grouping control in the panel header, and the flat two-item menu it opens.
get groupControl(): Locator
groupOption(value: "domain" | "scope"): Locator
// The scope-mode band, named by its destination path: "~/.claude · global 13 of 23".
scopeBand(scope: "global" | "project"): Locator
```

`groupControl` locates by `getByRole("button", { name: /^Group sub-agents by/ })` — give the
trigger that stable accessible name via `aria-label`, since its visible text is the _value_ and a
name that is only `domain ▾` says nothing about what the control does. `groupOption` uses
`getByRole("menuitemradio", { name })`.

**`e2e/specs/roster.spec.ts`** — a new `test.describe("roster grouping")`:

1. the control rests on `domain` and the domain bands are the ones on screen;
2. picking `scope` replaces them with the two path bands — assert `toHaveText` on the band, not a
   count;
3. the active menu item carries `aria-checked="true"` and the other does not (e2e rule 2: state
   goes on the accessibility tree);
4. in scope mode an agent row's accessible name carries the domain prefix
   (`web · developer`), and in domain mode it does not — **both directions, in one file**, or the
   absence assertion has no channel;
5. cycling an agent's scope word while grouped by scope moves it to the other band;
6. a band collapsed in domain mode is still collapsed after switching to scope and back — this is
   the namespace rule's own test, and it fails if the prototype's `shut: {}` reset is ported.

**`e2e/specs/persistence.spec.ts`** — the mode survives a reload. Copy `storedConfig()`'s shape in
`configure-page.ts` for a `storedUi()` reader against `agents-inc:ui:v1`.

### Success criteria

| Criterion                                                                   | How to verify                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One renderer, two modes                                                     | `derive.test.ts` spec 6 — same rows both ways                                                                                                                                                                        |
| The contract test is untouched and still passes with its one deliberate red | `bun run test` in `apps/editor`; `git diff derive.contract.test.ts` is empty                                                                                                                                         |
| Bands stack in both modes                                                   | manual scroll in scope mode: the `global` band pins at `top:0`, `project` at `1.625rem`                                                                                                                              |
| The count lives in one place                                                | `grep -c 'of {' roster-panel.tsx` — one occurrence in the band                                                                                                                                                       |
| Collapsed state is per mode and survives the flip                           | e2e spec 6                                                                                                                                                                                                           |
| The mode survives a reload                                                  | `persistence.spec.ts`                                                                                                                                                                                                |
| An old saved blob keeps its collapsed bands                                 | `ui-store.test.ts` (below)                                                                                                                                                                                           |
| Types                                                                       | `npx tsc --noEmit` in `apps/editor`; `RosterDomainGroup` no longer resolves anywhere                                                                                                                                 |
| Build                                                                       | `bun run build` in `apps/editor` — the first-paint budget gate must stay green with `@base-ui/react/menu` on the static graph. **If it goes red**, move the menu behind `import()` before touching the budget number |

### Why persisted, deliberately

`ui-store`'s `partialize` comment states the rule: "Everything else is ephemeral — reloading into
an open panel or dialog is never right." The operative distinction on either side of that line is
**arrangement vs transient**. `rosterCollapsed` is arrangement and survives; open panels, open
dialogs, pending confirmations and the decaying flash do not. The grouping mode is arrangement in
exactly the same sense — it is how the panel is laid out, not something the visitor is in the
middle of — so it persists, `.catch()`-ed per the hazard.

---

## A3 — Collapsible stack header

**Files:** `packages/ui/src/components/divider.tsx` (+ `divider.stories.tsx`),
`apps/editor/src/features/configure/components/configure-screen.tsx`,
`apps/editor/src/stores/ui-store.ts` (see cross-cutting), plus a new e2e spec and page-object
accessors.

### Where the button lives: a `Hinge` prop, not a sibling

**A prop.** Two reasons, and the first is not negotiable:

1. **The hinge must be the positioning context.** The trailing rule is `flex-1` and runs to the
   right divider; the button is out of flow, sits on top of it, and its **opaque `#fdfdfc` fill is
   what masks the 24px of rule behind it**. Make it transparent and a line runs through the glyph;
   make it `#fff` and it prints a white patch on the `#fdfdfc` column. A sibling would need its own
   `relative` wrapper and would have to re-derive the hinge's height — which is set by its 10px
   label — to centre on a zero-height rule.
2. **The square is design-system furniture.** Its border, fill, glyph colour and three-way hover
   are the design language, and the package's rule is that `apps/*` must never restyle a primitive
   locally.

So `divider.tsx` grows **two** exports:

```ts
// A slot on the hinge's right end, on the content edge, painted over the rule.
action?: ReactNode
```

and a `HingeButton` — the 24px square, taking ordinary button props and its glyph as children. The
accessible name and the glyph are app copy and app state, so they stay at the call site; the
geometry and the colours cannot be got wrong from outside.

`action` rather than a `collapsed` + `onToggle` + two-label prop group: it is fewer props, not
more, and the caller cannot pass a mismatched pair. This is minimality, not flexibility.

### `Hinge`, with the slot

The root gains `relative` when `action` is present, and the slot renders last:

```tsx
{
  action ? (
    <span className="absolute top-1/2 right-gutter -translate-y-1/2">
      {action}
    </span>
  ) : null
}
```

`right-gutter` puts the button's **right edge on the main column's content edge** — the same x the
skill grid, the filter bar and the add-skill block end on. It derives from `--spacing-gutter`, so
it follows the gutter at every width with no media override. `top-1/2 -translate-y-1/2` centres it
on a zero-height rule, which is the only way to centre against the line itself.

`Hinge`'s props today are `Omit<ComponentProps<"div">, "children">`. Keep the `Omit` — `action` is
a slot, not children.

### `HingeButton`, exactly

```
24 × 24px outer, border-box — the 24 is the OUTSIDE measurement, border included
```

| Property     | Design                                                                                                                                           | Utility                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| box          | `24px` square, `box-sizing:border-box`, flex-centred                                                                                             | `flex size-6 items-center justify-center`                   |
| border       | `1px solid #cfcabb` — **the same token as the rule it interrupts**, so the square reads as a knot in the line rather than a button dropped on it | `border border-rule`                                        |
| fill         | `#fdfdfc` — the main column's own background, **not** white and **not** transparent                                                              | `bg-column`                                                 |
| glyph        | Plex Mono 400 at 12px                                                                                                                            | `font-mono text-12 font-normal`                             |
| glyph colour | `#7a7669`                                                                                                                                        | `text-muted-foreground`                                     |
| hover fill   | `#f4f2ec`                                                                                                                                        | `hover:bg-muted`                                            |
| hover glyph  | `#242320`                                                                                                                                        | `hover:text-ink`                                            |
| hover border | `#a9a292`                                                                                                                                        | `hover:border-dialog-border`                                |
| selection    | a double-click must not select the glyph                                                                                                         | `select-none`                                               |
| focus        | the package's one ring                                                                                                                           | `outline-none focus-visible:ring-1 focus-visible:ring-ring` |

Two of the three hover steps are the `outline` arm of `buttonVariants` verbatim
(`hover:border-dialog-border hover:text-ink`) — cite it. All three move together and **there is no
transition**: nothing in the main column animates except the filter bar's padding.

No active state, no disabled state. `size-6` at the app's 110% root is ~26.4px; the design's 24px
touch target is already below the 44px minimum and this spec does not enlarge it — record it as a
known accessibility gap rather than silently diverging from the design.

### The call site

`configure-screen.tsx`, the first `<Hinge>`:

```tsx
;<Hinge
  label="choose your stack"
  action={
    <HingeButton
      aria-expanded={!stackCollapsed}
      aria-label={stackCollapsed ? "Show stacks" : "Hide stacks"}
      onClick={toggleStackCollapsed}
    >
      {stackCollapsed ? "+" : "−"}
    </HingeButton>
  }
/>
{
  !stackCollapsed && <StackGrid />
}
```

**Glyphs, exactly as the design writes them:** expanded shows **U+2212** MINUS SIGN `−`
(bytes `e2 88 92`); collapsed shows the **ASCII PLUS U+002B** `+`. They are centred in a fixed
square, so their differing advance widths are not visible. (The repo uses U+FF0B `＋` for
`＋ Add skill`; three plus glyphs are now in play across the product, which the research flags as
unresolved. Take the design as written and record it — do not normalise on your own authority.)

**Copy:** `Show stacks` / `Hide stacks` — the design's `title` text, promoted to the accessible
name because a `title` is a hover tooltip and not a label. The name changing with state is what
`shareButton` already does in this app, and it is what gives the suite a stable regex to locate on.

**No `aria-controls`.** The grid is unmounted when collapsed, so an id to point at does not exist.
`aria-expanded` on a button immediately preceding the content it discloses is the pattern the
roster bands already use in `roster-panel.tsx` — same codebase, same shape.

### What collapses, and what must not move

**Collapses:** exactly one element — `<StackGrid />`, the 4-across `Lattice` of stack cells.
Nothing else is inside the condition.

**Does not move:**

- the hinge itself — its rule, its stub, its label and the button all stay put. The hinge's height
  is driven by its 10px label, which does not change, so the button neither moves nor resizes; only
  its glyph and its accessible name swap.
- `stackId`. Collapsing the grid **does not deselect the stack**. The second hinge still names it,
  the roster's counts are unchanged, and Install is unaffected. Assert this.
- the second hinge, the filter bar, every domain section and the whole roster panel — they shift
  **up** by the grid's height and change in no other way.

**The spacing result, which is the thing a reimplementation gets wrong.** `Hinge`'s clearance is
`my-gutter` — a **margin** on both ends. With the grid gone the two hinges become adjacent siblings
and their vertical margins **collapse**: the two rules end up **60px** apart, not 120px. This works
today and must keep working: `<main>` is `block` (it is a grid _item_, not a grid _container_), so
adjacent-sibling collapsing applies normally. A reimplementation that switches `Hinge` to padding,
or that wraps either hinge in an element establishing a new formatting context, produces a 120px
void and looks broken. **Assert the gap.**

**No animation.** The design declares none anywhere on this control, and an instant collapse is
consistent with its "hard edges" posture. Do not add one.

### Stories

`divider.stories.tsx` gains one story per new capability, matching `HingeWithEmphasis`'s shape:

```tsx
export const HingeWithAction: Story = {
  args: { action: <HingeButton>−</HingeButton> },
}
```

The existing decorator (`w-[40rem] px-gutter`) already supplies the gutter the slot positions
against.

### Tests

New `apps/editor/e2e/specs/stack-collapse.spec.ts`, and `configure-page.ts` gains:

```ts
readonly stackToggle: Locator   // getByRole("button", { name: /^(Show|Hide) stacks$/ })
readonly stackGrid: Locator     // getByRole("group", { name: "Stacks" })
```

| Test                                                        | Asserts                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| the grid is open at rest                                    | `stackGrid` visible, `stackToggle` has `aria-expanded="true"`                                                                                                                        |
| clicking the button hides the grid                          | `stackGrid` has count `0`, `aria-expanded="false"`, name becomes `Show stacks`                                                                                                       |
| clicking it again brings the grid back                      | both directions in one file — the negative has a positive over the same channel                                                                                                      |
| **collapsing does not change the selection**                | apply a stack, collapse, then assert the second hinge still names it AND `installButton`'s accessible name is unchanged. Snapshot `storedConfig()` before and assert identical after |
| **the two hinges sit 60px apart when collapsed, not 120px** | two live `boundingBox()` reads — the first hinge's `bottom` against the second's `top` — compared at the app's own scale. A geometry assertion, per e2e rule 6, not a visibility one |
| the state survives a reload                                 | in `persistence.spec.ts`                                                                                                                                                             |

The margin-collapse test is the one that would catch the defect this section exists to prevent, and
nothing else would: every other assertion here passes with a 120px void.

### Success criteria

| Criterion                                                | How to verify                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The button's right edge lands on the content edge        | manual against `.claude-design/screens/03-stack-collapsed.png`; it must share an x with the add-skill block's right edge          |
| The rule passes behind the button, not through the glyph | manual — the fill is `bg-column`, so a screenshot shows an unbroken rule interrupted by a square, with no line crossing the glyph |
| One element collapses                                    | `git diff configure-screen.tsx` — the condition wraps `<StackGrid />` alone                                                       |
| The selection is untouched                               | the config-snapshot test                                                                                                          |
| 60px, not 120px                                          | the geometry test                                                                                                                 |
| Three hover steps, no transition                         | read the diff — no `transition-*` on `HingeButton`                                                                                |
| `apps/www` is unaffected                                 | `grep -rn 'Hinge' apps/www` returns nothing; `action` is optional so the three existing call sites are unchanged                  |
| Types, lint, build                                       | `npx tsc --noEmit`, `bun run lint`, `bun run build`                                                                               |

---

## A4 — Roster header adopts the hinge treatment, with no leading stub

**Files:** `packages/ui/src/components/divider.tsx` (+ stories),
`apps/editor/src/features/configure/components/roster-panel.tsx`,
`apps/editor/e2e/pages/roster-panel.ts`.

### What exists today

In `RosterPanel`, the first child of the `rail-scrollbar` scroller — a bare heading with no rule
and no `Hinge`:

```tsx
<div className="flex items-center gap-2 pr-0.5 pb-3 pl-4 font-mono text-10 font-medium tracking-[.14em] text-muted-foreground uppercase">
  Sub-agents
</div>
```

### Why there is no stub, and why it is load-bearing

Verbatim from `.claude-design/README.md` § "Section rules (hinges)":

> The roster header uses the same rule but no leading stub — the panel has no gutter, and a stub
> would break the 17px flush left edge the roster rows are locked to.

And the edge it protects, § "Roster panel":

> **One flush left edge at 17px** — domain label, agent names and skill bullets all start at the
> same x.

In the live code that edge is `pl-[1.0625rem]` on the band button and on the group body. `Hinge`'s
stub is `-ml-gutter w-gutter` — 60px — so with the 16px flex gap after it the header's first ink
would land 76px in, against rows locked to 17px. **The stub is not a decoration to drop; it is the
one thing that would break the panel's only alignment.**

### The variant

`Hinge` gains `variant?: "column" | "panel"`, default `"column"`, implemented with **cva**.
`divider.tsx` uses plain `cn` today; five of the package's other components (`button`, `chip`,
`badge`, `lattice`, `matrix-grid`) are `cva` + `cn` exporting both the component and its variants,
and the package convention is explicit about it. Export `hingeVariants` alongside `Hinge`.

Three class slots vary; the shared declarations do not. **What makes the two one treatment** — keep
these identical across both arms, in one place:

```
label:  font-mono text-10 font-medium tracking-[.14em] uppercase text-muted-foreground
rule:   h-0 border-t border-rule
```

|               | `column` (today's behaviour, unchanged)                                      | `panel`                                                              |
| ------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| root          | `-mx-gutter my-gutter flex items-center gap-4 pl-gutter`                     | `relative flex items-center gap-1.5 pr-0.5 pb-gutter pl-[1.0625rem]` |
| leading stub  | `<span className="-ml-gutter h-0 w-gutter shrink-0 border-t border-rule" />` | **none**                                                             |
| trailing rule | `h-0 flex-1 border-t border-rule`                                            | `h-0 flex-1 basis-0 min-w-[0.625rem] border-t border-rule`           |
| clearance     | 60px **margin**, both ends                                                   | 60px **padding-bottom** only                                         |

Five differences, no others. Each has a reason and each reason belongs in the code as a comment:

- **(a) no stub** — above.
- **(b) `gap-1.5` (6px) not `gap-4` (16px)** — the panel is 18.75rem (300px design-native, 250px
  below the breakpoint) and cannot afford 16px twice.
- **(c) the rule is floored: `flex-1 basis-0 min-w-[0.625rem]`** — both the label and the control
  are `shrink-0 whitespace-nowrap`, so the rule is the only shrinkable item in the row. Without a
  floor it collapses to zero in a narrow panel and the treatment disappears. **This is the single
  declaration a reimplementation is most likely to drop.**
- **(d) clearance is padding, not margin** — it must not collapse with the sticky bands beneath
  it. There is no top spacing at all, because the `<aside>`'s `pt-gutter` already supplies it.
- **(e) no negative margins** — the panel has nothing to bleed into.

`relative` on the `panel` root is there for A2's menu positioning context and for nothing else.

### The call site

```tsx
<Hinge
  variant="panel"
  label="Sub-agents grouped by"
  action={<GroupControl />}
/>
```

A2 supplies `GroupControl`. **`pl-4` becomes `pl-[1.0625rem]`** — the design's `.pl{padding-left:16px}`
sits 1px left of the 17px edge every other element in the panel is locked to, which the research
calls "almost certainly a typo — pick 17px". This is the flush edge the whole variant exists to
protect, so the header must be on it.

**`pb-3` becomes `pb-gutter`** — 12px to 60px. Consequence, stated so it is not a surprise: the
first sticky band now starts 60px below the header rule, and the scroller absorbs it. That is the
design's "60px clearance below every hinge", uniform across all three.

Note that `action` on the `panel` variant is **not** the absolutely-positioned slot A3 uses. On
`panel` the control is a flow child sitting between the label and the rule, in this order:
label · control · rule. Two behaviours from one prop name is a trap — give `panel` its own
handling, or name A3's slot `action` and A2's control an ordinary child of the panel arm. Pick one
and say which in a comment; do not leave a prop that means two things.

The header stays **inside** the `rail-scrollbar` scroller, so it scrolls away and band 0 pins in
the space it vacates. That is the existing arrangement and the design's — no change.

### Tests

**`e2e/pages/roster-panel.ts`** — `this.heading = this.root.getByText("Sub-agents", { exact: true })`
stops matching. Update to the new label. Every site
`grep -rn 'roster.heading' apps/editor/e2e/specs` reports uses it as a neutral hover/click target;
the label span
is still inert, so they keep working once the locator matches.

Add one test to `roster.spec.ts`: the header carries a rule to the panel edge. Assert on the
element rather than a screenshot — the rule span's `boundingBox().width` is greater than zero at
the fixed 1600px viewport, which is what criterion (c)'s floor exists to guarantee.

### Success criteria

| Criterion                                            | How to verify                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The header's first ink is on the 17px edge           | its computed `padding-left` equals the band button's                                                      |
| No stub renders in the panel arm                     | `panel` produces exactly two flow children plus the control; assert the header's first child is the label |
| The rule never collapses to zero                     | the width assertion above                                                                                 |
| The three hinges share one type treatment            | the label classes are declared once in `hingeVariants` — read the diff                                    |
| The three existing `column` call sites are unchanged | `git diff configure-screen.tsx` shows no `variant` prop added                                             |
| `apps/www` unaffected                                | it does not import `Hinge`                                                                                |
| Stories                                              | `HingePanelVariant` added                                                                                 |

---

## A5 — Sticky add-skill: VERIFICATION FIRST

**Verdict: design 84a is shipped and the add-skill button's resting and stuck treatments are
correct in every declaration. There is no feature to build.** Three measured divergences follow,
and they are the whole of A5's work.

### The verification, declaration by declaration

`filter-bar.tsx` renders `<Button variant="block" onDark={stuck}>＋ Add skill</Button>`;
`buttonVariants` in `packages/ui/src/components/button.tsx` carries the `block` arm and the
`{ variant: "block", onDark: true }` compound arm.

| Design                                                             | Editor                                                                                                                                                                                           |     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| `.bigadd{background:#242320}`                                      | `bg-ink` → `#242320`                                                                                                                                                                             | ✓   |
| `.bigadd{color:#fff}`                                              | `text-primary-foreground` → `#ffffff`                                                                                                                                                            | ✓   |
| `.bigadd{font:600 9.5px 'IBM Plex Mono'}`                          | `font-mono font-semibold text-9_5`                                                                                                                                                               | ✓   |
| `.bigadd{letter-spacing:.1em;text-transform:uppercase}`            | `tracking-[.1em] uppercase`                                                                                                                                                                      | ✓   |
| `.bigadd{padding:0 18px}`                                          | `px-[1.125rem]` = 18px                                                                                                                                                                           | ✓   |
| `.bigadd:hover{background:#3a382f}`                                | `hover:bg-ink-2` → `#3a382f`                                                                                                                                                                     | ✓   |
| `.barrow{align-items:stretch}` + no vertical padding               | `flex items-stretch gap-2.5` on the row                                                                                                                                                          | ✓   |
| `.barwrap.stuck .bigadd{background:transparent}`                   | `bg-transparent`                                                                                                                                                                                 | ✓   |
| `.barwrap.stuck .bigadd{box-shadow:inset 0 0 0 1px #55524a}`       | `shadow-[inset_0_0_0_1px_var(--color-band-edge)]`, `--color-band-edge: #55524a`                                                                                                                  | ✓   |
| `.barwrap.stuck .bigadd:hover{box-shadow:inset 0 0 0 1px #8a8578}` | `hover:shadow-[inset_0_0_0_1px_var(--color-band-edge-hover)]`, `#8a8578`                                                                                                                         | ✓   |
| `.barwrap.stuck .bigadd:hover{background:transparent}`             | `hover:bg-transparent`                                                                                                                                                                           | ✓   |
| glyph `U+FF0B` fullwidth plus                                      | `hexdump` of the JSX text node → `ef bc 8b`                                                                                                                                                      | ✓   |
| the band, the field, the chips and the caret                       | every `--color-band-*` token (`grep -c 'color-band-' packages/ui/src/styles/globals.css`) exists for nothing else and is wired through `Input`'s and `Chip`'s `onDark` arms; every value matches | ✓   |

Two design behaviours are **deliberately not implemented** and must not be "fixed":

- **the compact stuck padding** (`padding:8px 15px` + `.barrow{align-items:center}`). The editor
  holds the height constant in both states, and `filter-bar.tsx` records the measurement: collapsing
  the design's vertical padding "removes 78px of page height exactly as the bar pins, and scroll
  anchoring then un-pins it — measured oscillating at scrollY 590/511."
- **focus-on-stick.** Ruling 4. `sticky-bar.spec.ts` pins it in three tests.

### Gap 1 — a stale claim in `filter-bar.tsx`

The comment above the `flex items-stretch gap-2.5` row says:

> `The gap is constant. The design collapses it to 0 when stuck so the two blocks butt together as one toolbar…`

**The design does not.** Re-derived:

```
grep -o '\.barrow[^}]*}' "/home/vince/dev/cli/.claude-design/design/Configurator v5.dc.html"
```

returns exactly two rules — `.barrow{display:flex;gap:10px;align-items:stretch}` and
`.barwrap.stuck .barrow{align-items:center}`. There is no gap override in either state; the
10px seam survives the pin, and `gap-2.5` already matches it.

Delete the false clause. **Do not rewrite it** — the paragraph's remaining reasoning (three
simultaneous shifts read as a jump) still justifies the surrounding decision, which is the
`align-items` one, and every rewrite is a new claim that can rot.

### Gap 2 — a stale claim in `packages/ui/src/components/input.tsx`

Its docblock says:

> `The bar also moves focus into this field by itself as it sticks, and what receives focus is what has to show it.`

This is the removed behaviour, asserted as current, and it directly contradicts `filter-bar.tsx`
twenty lines away, and every test `grep -n 'focus' apps/editor/e2e/specs/sticky-bar.spec.ts`
reports. Delete that sentence. The focus ring's justification
survives without it: the preceding sentences already explain that the filter bar holds six chips
each drawing this ring, so a `focus-within` on the wrapper would mark the whole row.

### Gap 3 — the resting search value colour

Design: `.bsq{color:#242320}` for the typed value, `.bsq::placeholder{color:#6a675c}`.
Editor: `{ variant: "search", onDark: false }` → `text-subtle placeholder:text-subtle`, i.e.
`#6a675c` for **both**, so typed text renders mid-grey rather than ink.

Change the resting compound arm to `text-ink placeholder:text-subtle`
(`--color-ink: #242320`, `--color-subtle: #6a675c`). The stuck arm already distinguishes the two
correctly (`text-band-ink` / `placeholder:text-band-faint`) and is unchanged. This is the one
user-visible divergence in A5 and it is one token.

### Gap 4 — the stuck treatment has no test at all

`sticky-bar.spec.ts` asserts the band's background flips to `#242320` and that the add-skill button
is _visible_ while stuck. **Nothing asserts the fill→outline flip**, which is the whole of design
84a on this control. A shipped visual contract with no channel to catch its regression.

Add to the existing `test.describe("sticky filter bar")`:

```ts
test("add-skill trades its fill for a hairline once stuck", async ({
  configure,
}) => {
  await expect(configure.addSkillButton).toHaveCSS(
    "background-color",
    DARK_BAND
  )

  await configure.scrollTo(PAST_THE_BAR)
  await expect.poll(() => configure.isBarStuck()).toBe(true)

  await expect(configure.addSkillButton).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  )
  await expect(configure.addSkillButton).toHaveCSS(
    "box-shadow",
    BAND_EDGE_INSET // "rgb(85, 82, 74) 0px 0px 0px 1px inset" — #55524a
  )
})
```

The resting assertion first, deliberately: it establishes the channel before the change is
asserted, per e2e rule 8, and it also pins that the resting fill is the same ink as the band. Reuse
the file's existing `DARK_BAND` constant; add `BAND_EDGE_INSET` beside it with its hex in a
comment.

This is a guard, not a feature — it makes an already-shipped rule mechanically checkable and it
adds no user-facing capability.

### Success criteria

| Criterion                                       | How to verify                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No behavioural change to the bar                | `git diff filter-bar.tsx` is comment-only                                                                                                                      |
| No claim about focus-on-stick survives anywhere | `grep -rn 'focus' apps/editor/src/features/configure/components/filter-bar.tsx packages/ui/src/components/input.tsx` — no sentence asserts the bar takes focus |
| No claim about a collapsing gap survives        | `grep -c 'collapses it to 0' apps/editor/src/features/configure/components/filter-bar.tsx` returns `0`                                                         |
| Typed search text is ink                        | manual: type in the bar at rest; the text is `#242320` while the placeholder was `#6a675c`                                                                     |
| The stuck restyle has a channel                 | the new spec passes, and fails if the `onDark` compound arm is deleted — **drive it red first**                                                                |
| The three focus tests still pass                | `sticky-bar.spec.ts` in full                                                                                                                                   |

### Not A5's work, recorded

The design's filter bar carries a single **`recommended`** chip; the editor ships **`Selected`**.
The programme README parks this as an owner call ("a deliberate divergence or a drift — cannot tell
from either source"). Leave it.

---

## Cross-cutting tests: `ui-store.test.ts`

There is no `ui-store.test.ts` today and nothing pins `version: 3`. Both new persisted fields
depend on `merge` behaving, and the failure mode is silent. Create
`apps/editor/src/stores/ui-store.test.ts`, co-located per the app's convention:

| Test                                                              | Asserts                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| the version is 3                                                  | `it("is 3")`, the shape `persisted-schema.test.ts` uses for `PERSIST_VERSION`                                                       |
| an old blob holding only `rosterCollapsed` keeps it               | parse `{ rosterCollapsed: { web: true } }` → `rosterCollapsed` survives, `rosterGroupBy` is `"domain"`, `stackCollapsed` is `false` |
| an invalid `rosterGroupBy` falls back without discarding the rest | `{ rosterCollapsed: {…}, rosterGroupBy: "nonsense" }` → collapsed survives, mode is `"domain"`                                      |
| a wholly unreadable blob still falls back to defaults             | `merge` returns `current`                                                                                                           |
| `partialize` keeps exactly three keys                             | `toStrictEqual` against a named constant, not `toHaveLength`                                                                        |

The version test is the one that makes the "do not bump" ruling enforceable rather than a sentence
in this file.

---

## Order of work

1. **Cross-cutting first** — the two `persisted-schema.ts` additions, the two `ui-store.ts` fields,
   `ui-store.test.ts`. Nothing else compiles cleanly without them.
2. **A0** — tokens and the citation. Independent; it unblocks nothing in Phase A but lands here.
3. **A1** — self-contained in `roster-panel.tsx`, and it deletes the two `globals.css` tokens A0
   is already editing around.
4. **A4 then A2** — A4 gives the header its shape, A2 puts the control in it. They touch the same
   three lines of JSX; landing A4 first keeps each diff readable.
5. **A3** — `divider.tsx` again. A4 introduces `cva` there, so A3's `action` slot lands on top of
   it rather than under it.
6. **A5** — comment corrections, one token, one test. Independent of everything above.

Every item follows the root `CLAUDE.md` process: **tests red first**, implement until green,
`meta-design-expressive-typescript` only, hand-run the editor, docs through `codex-keeper`, then
`todo/`. **Sub-agents do not edit `todo/`** — the orchestrator does, as each lane lands. **No git
command that writes.**

---

## For the reviewer

Focus on these, in this order:

1. **The persisted-schema hazard.** Both new keys `.catch()`-ed, `version` still `3`, `partialize`
   naming all three. Anything else silently wipes every visitor's arrangement.
2. **The effort scale.** `AGENT_EFFORTS` unchanged, five members, `medium` spelled out. The
   `roster.spec.ts` two-click test still landing on `xhigh` is the proof.
3. **The amber predicate written through `restingAgentOptions`**, not against the literal
   `"medium"`. The difference is invisible today and is the whole value of the line.
4. **`Hinge`'s `panel` arm keeping the rule's `min-w-[0.625rem]` floor**, and the `column` arm's
   three existing call sites unchanged.
5. **The margin-collapse geometry test for A3.** Every other A3 assertion passes with a 120px void.
6. **The collapsed-key namespace.** `scope:` prefix in scope mode, bare id in domain mode, no
   `rosterCollapsed` reset anywhere.
7. **Deleted claims stay deleted.** `grep` for "the design draws three", "collapses it to 0",
   "§ Design tokens" and the input's focus sentence — all four must return nothing, and none may
   have been rewritten into a new claim somewhere else.
