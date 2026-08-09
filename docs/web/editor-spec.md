# Editor — Implementation Spec

Scope: the **Configure** screen. Docs, Share and Settings get a route + empty shell.
Design source of truth: `.claude-design/README.md` + `.claude-design/design/Configurator v5.dc.html`,
with `.claude-design/screens/*.png` (2–4× captures at a 1741px viewport) as the visual reference
every §8 adaptation below is measured against.

> **v5 supersedes v2.** The earlier warm-paper, rounded, sliding-highlight language is gone. This
> document describes what is built now; §8 records where the implementation deliberately departs
> from the design files.

---

## 1. Architecture

### Package layout

| Package                      | Owns                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `packages/matrix`            | Vendored CLI catalog, zod schemas, the read model, stack expansion. Pure TS — no React. |
| `packages/ui`                | The design system: tokens + 11 primitives. No app knowledge.                            |
| `packages/typescript-config` | `base` / `react-library` / `vite-app` / `node` tsconfigs.                               |
| `packages/eslint-config`     | `base` / `react-library` / `react-app` flat configs.                                    |
| `packages/prettier-config`   | The single Prettier config, declared once in the root `package.json`.                   |
| `apps/editor`                | Routes, stores, feature components, derivations, the GitHub API seam.                   |

`noUnusedLocals` / `noUnusedParameters` stay unset everywhere — every workspace holds code it does
not author (vendored CLI types, generated icon map), and tsc has no per-directory escape. ESLint's
`no-unused-vars` covers it and can scope.

### Data flow

```
BUILT_IN_MATRIX + AGENT_DEFINITIONS   (packages/matrix/src/{vendor,generated})
  └─ packages/matrix/src/schema           zod safeParse at module init
      └─ packages/matrix/src/read-model   domain → category → skill tree, sub-agents, stacks
          └─ export { CATALOG, SUB_AGENT_GROUPS, STACKS, expandStack } from "@workspace/matrix"
              ├─ apps/editor/stores/config-store          user configuration  (persisted)
              ├─ apps/editor/stores/added-skills-store    session skills      (NOT persisted)
              ├─ router search params                  view state
              └─ apps/editor/features/configure/lib/derive.ts → view data
                  └─ components
```

`apps/editor` imports **only** from `@workspace/matrix`. The package validates once at its own
boundary, so the app performs no second parse.

### Decisions

| Question     | Decision                                                                                | Rationale                                                                                     |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Router       | `@tanstack/react-router` v1, code-based routes                                          | `validateSearch` + zod gives a typed, validated URL boundary.                                 |
| Table        | **Removed.** `@tanstack/react-table` is gone.                                           | v5 renders skills as grid cells; there is no table left to build.                             |
| Server state | No react-query. `hc<AppType>` behind `lib/api/configs.ts` and `lib/api/skill-index.ts`. | Nothing is shared to cache: a config id is immutable, the index has its own freshness header. |
| Icons        | `simple-icons` (raw path data) + hand-checked map                                       | Drawn in `currentColor`, never brand colour — see §4 rule 4.                                  |

---

## 2. Design language

Five rules generate almost everything, and every primitive in `packages/ui` exists to serve one:

1. **No border radius anywhere.** `--radius: 0px`, so the whole derived shadcn ladder is 0.
2. **Borders only where they mean something.** Cell hairlines collapse into a shared lattice; the
   only real border in a group is the selected cell's amber outline.
3. **Two typefaces, strictly divided.** Inter for human names and descriptions; IBM Plex Mono for
   every label, id, badge, count and command, uppercase with wide tracking.
4. **One accent colour.** Amber marks what the user deliberately chose or changed. Hover states stay
   neutral, and skill logos render in `currentColor` rather than their brand colour. There is no
   second signal colour: a skill the selection has ruled out is dimmed, not reddened — see §7.
5. **Whitespace, not rules, separates content.** Two kinds of horizontal rule exist: the full-bleed
   section divider and the collapsed cell lattice.

**The app must never restyle a primitive locally.** shadcn's semantic vars are remapped onto the v5
palette in `:root`, so generated components inherit the language without per-component overrides.

---

## 3. State

### Config store — `apps/editor/src/stores/config-store.ts` (persisted, v2)

```ts
type Assignment = {
  load: "lazy" | "preloaded"
  enabled: boolean // a roster row switched off keeps its load mode and its row
}

type SkillEntry = {
  install: "plugin" | "eject"
  scope: "project" | "global"
  assignments: Record<AgentId, Assignment>
}

// Every decision about one sub-agent, all of it optional. `on` is tri-state:
// true pins on, false pins off, absent means "ask the assignments" — so an
// entry holding only a model must not pin.
type AgentEntry = {
  on?: boolean
  model?: "opus" | "fable" | "sonnet" | "haiku"
  effort?: "low" | "medium" | "high" | "xhigh" | "max"
}

type ConfigState = {
  stackId: string | null // null = "Start from scratch"
  skills: Partial<Record<SkillId, SkillEntry>> // SPARSE — presence *is* selection
  remembered: Partial<Record<SkillId, SkillEntry>> // deselected, not discarded
  agents: Partial<Record<AgentId, AgentEntry>> // SPARSE — only what was decided
}
```

**Model and effort belong to the sub-agent** (v7). A skill is a plugin from someone else's repo:
in plugin mode its `SKILL.md` frontmatter belongs to the marketplace and any edit we write is undone
by the next update, so a per-skill model would have worked in eject mode and silently done nothing
in plugin mode. The agent file we always generate. They widened `pins` rather than adding a second
agent-keyed map, because two parallel agent-keyed records drift.

**The agents map holds choices, not state.** There is no single default model: an agent rests on the
one its own `metadata.yaml` names (`SubAgent.model`, falling back to `sonnet` when that is not one
of the four the web offers), and effort rests at `medium` for everyone until agent metadata carries
one. `resolveAgentOptions` is where a row's displayed value comes from; setting a field back to its
resting value removes the key, and a record left with nothing in it is dropped.

**Selecting assigns automatically.** A fresh selection arrives with the rule's assignments
(`lib/default-assignments.ts`), and the whole answer comes from the matrix's shared resolver —
`resolveAssignment` (`packages/matrix/src/read-model/assignment-defaults.ts`), the same one the
CLI's config generator reads, so a pick lands on the same agents from either surface. Its
relevance rule: a domain skill reaches its own domain's core roles (developer · pm · researcher
· tester) plus the cross-domain `reviewer`; a `shared` skill reaches every implementation-flavor
agent — all four domains and the reviewer, never the meta agents; a `meta` skill reaches exactly
the flavors its authored mapping row names, plus the craft reaches (the reviewing and design
categories to the reviewer, the methodology category to every PM, each `meta-planning` playbook
to its own domain's PM); an id the catalog does not carry — added from GitHub this session, or
stale — reaches nobody, and finds a home through the ••• panel instead. Each reached agent loads
the skill as the same table says — `resolveLoadState` over `PRELOAD_DEFAULTS`
(`packages/matrix/src/read-model/preload-defaults.ts`), where a skill's row names the role
flavors that carry it eagerly, absence means lazy, and the verdict is domain-gated so a
cross-domain role match arrives lazy; a craft reach targets without preloading, so a craft the
rows never name for that flavor arrives lazy too. An agent is **on** when a pin says so, else
when it holds ≥ 1 enabled skill (`isAgentOn`) — selecting a skill is what switches its agents
on, and the roster flashes the agents a selection just reached.

**Deselecting is not destructive.** One click removes a skill; the configuration behind it can be a
dozen — nine sub-agent assignments, an install mode, a scope — and the cell gives no warning, because
deselect reads as "not included" rather than "erase my work". A deselected entry moves to
`remembered` and is restored if the skill is selected again.

One rule covers both cases, with no special case per category: _a skill remembers how you configured
it; a skill you have never configured starts blank._ An exclusive swap evicts the sibling, which is
a deselection the user did not click, so it keeps the same promise — pick Vue over React and React
returns configured when you pick it back, while Vue starts blank because it has never been
configured.

Two boundaries stop this becoming a leak. `isWorthRemembering` drops entries that carry no
information at all — default options, no assignments — which is what a blank skill selected and
immediately deselected looks like; note that a stack-applied skill arrives _with_ assignments and so
is always remembered. v7 cost it two of its four signals (model and effort left the skill), so
deselect-remembers-your-work is deliberately less sensitive than it was: an entry now says something
only through its assignments or its install options. And `applyStack` clears the map, because it is
the explicit start-over action and already confirms first when edits would be lost.

Derivations take `ConfigSelection` (`stackId` + `skills` + `agents`), never `PersistedConfig`. A remembered
skill must not appear in a grid, a roster line, a count or the install inventory, and excluding it
at the type level means that cannot happen by accident.

`assignments` is the **single source of truth**. Per-cell agent counts, the roster panel and the
install inventory are all derived and none of them stores a copy — the prototype duplicated these
and they drifted.

There is no `selected` boolean (presence in the map means selected) and no `targetAgentIds`
(assignment is per-skill in the options panel, not a global target set).

### Added-skills store — `apps/editor/src/stores/added-skills-store.ts` (**not** persisted)

Session-only skills pulled in from GitHub. `config-store`'s `partialize` strips any selection
referencing one, so nothing reaches localStorage that the next session could not describe. Selecting
one is allowed because `toggleSkill`'s catalog guard widens to "catalog **or** session".

`AddedSkill.categoryId` places the cell in the grid and does nothing else: it is resolved from the
catalog when the repo's name matches a known slug, `null` renders under Uncategorized, and the
assignment rule never reads it — a `github:` id is unknown to the catalog, so the shared resolver
returns nobody and the skill's agents are chosen by hand in the ••• panel.

### UI store — `apps/editor/src/stores/ui-store.ts`

`openPanelSkillId` · `pendingStackId` · `dialog` · `rosterCollapsed` (per-domain accordion
map, the only persisted field) · `flashedAgentIds` (the roster pulse, decays after 2.6s).

`stuck` is deliberately **not** here — see §6.

### Persistence

| Concern    | Approach                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key        | `agents-inc:config:v1` / `agents-inc:ui:v1`                                                                                                              |
| Validation | `merge` → `safeParse`; on failure **return current** (silent reset, log in dev)                                                                          |
| Stale ids  | `pruneUnknownIds` drops skill/stack/agent ids absent from the regenerated catalog (the `agents` map included)                                            |
| Migration  | `PERSIST_VERSION = 7` (v7 moves model/effort off the skill and widens `pins` to `agents`). Pre-release policy: no migrations — older blobs are discarded |

### URL search params — `/`

| Param    | Zod                                      | Default | Note                                                     |
| -------- | ---------------------------------------- | ------- | -------------------------------------------------------- |
| `domain` | `z.enum(DOMAINS).nullable().catch(null)` | `null`  | `null` renders every domain — the design's resting state |
| `q`      | `z.string().trim().max(64).catch("")`    | `""`    |                                                          |
| `sel`    | `z.boolean().catch(false)`               | `false` | Narrow to what you have actually chosen                  |

---

## 4. Component tree

### `packages/ui` — the design system

| File                 | Provides                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| `styles/globals.css` | Tokens: surfaces, ink, amber, lines, `--spacing-gutter`, type scale             |
| `lattice.tsx`        | `Lattice` / `LatticeCell` / `LatticeRows` / `LatticeRow` — rule 2               |
| `badge.tsx`          | `state` (install/scope, `alt` = amber) · `tag` (`added`) · `outline` (`one of`) |
| `chip.tsx`           | Bordered mono toggle at two sizes: `filter`, `segment`                          |
| `segmented.tsx`      | `Segmented` / `SegmentedItem` / `FieldLabel`                                    |
| `matrix-grid.tsx`    | Tri-state assignment matrix, tolerates gaps                                     |
| `divider.tsx`        | `Hinge` (labelled) / `Rule` — the page's only two rules                         |
| `button.tsx`         | `outline` · `primary` · `block` · `full`                                        |
| `input.tsx`          | Borderless mono field: `search`, `dialog`                                       |
| `command-block.tsx`  | `$`-prefixed shell command                                                      |
| `dialog.tsx`         | The shared square shell + panes                                                 |
| `alert-dialog.tsx`   | Confirm shell (stack switch)                                                    |

**Removed in v5** (superseded, no consumers): `accordion`, `table`, `sliding-toggle-group`, `toggle`,
`toggle-group`, `hover-card`, `input-group`, `scroll-area`, `separator`, `textarea`, `tooltip`,
`empty`.

### `apps/editor`

| File                          | Renders                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/route-components.tsx` | 3-column grid shell (152px / fluid / 260px)                                                                                                                                  |
| `components/nav-rail.tsx`     | Logo, words-only nav, GitHub mark                                                                                                                                            |
| `components/skill-icon.tsx`   | 26px logo slot: brand mark in `currentColor`, else monogram                                                                                                                  |
| `.../configure-screen.tsx`    | Hinges, stack grid, filter bar, domain sections, dialogs, scroll observer                                                                                                    |
| `.../stack-grid.tsx`          | 4-across stack lattice                                                                                                                                                       |
| `.../filter-bar.tsx`          | Sticky/stuck bar + chips + `＋ add skill`                                                                                                                                    |
| `.../domain-section.tsx`      | Sticky domain title + category groups + skill lattice                                                                                                                        |
| `.../skill-cell.tsx`          | The core cell                                                                                                                                                                |
| `.../skill-options-panel.tsx` | The `•••` popover: install mode, install scope, the sub-agent matrix, the source-code link                                                                                   |
| `.../roster-panel.tsx`        | Domain accordions (stacking sticky bands), agent pins with their model word + effort meter, per-agent skill rows with load words and the where-used tooltip, Share + Install |
| `.../install-dialog.tsx`      | Inventory panes + numbered steps                                                                                                                                             |
| `.../add-skill-dialog.tsx`    | Staged tray, GitHub search, result lattice                                                                                                                                   |
| `.../stack-switch-dialog.tsx` | Confirm discard                                                                                                                                                              |
| `lib/api/configs.ts`          | Share links: store a seed payload, read one back                                                                                                                             |
| `lib/api/skill-index.ts`      | The federated skill index the add-skill dialog filters                                                                                                                       |

---

## 5. Sizing

**Every dimension is `rem`, and `:root { font-size }` in `globals.css` is the single knob that
scales the whole design.** It is currently `110%` — the design's native size, 10% larger. The type
scale, the arbitrary metrics and Tailwind's own spacing utilities all resolve against it, so nothing
scales independently.

Two things stay in `px` on purpose:

- **Borders and the 1px lattice hairlines.** At 1.1px they render as blurry sub-pixel lines, and the
  collapsed grid is the entire visual language.
- **Viewport units**, so the sticky rails stay exactly one screen tall.

This is also why the app is not simply CSS `zoom`, which would scale both.

`60px` is the page's structural constant — main-column padding, the air above and below every
divider, and the roster's top padding — exposed as `--spacing-gutter` so `-mx-gutter` bleeds a rule
out to touch both vertical dividers.

### Where logic lives

Four layers, in order of preference. Nothing that could sit lower sits higher.

| Layer              | Holds                                                             | Files                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure functions** | Every derivation and transform. No React, independently testable. | `features/configure/lib/derive.ts`, `stores/persisted-schema.ts`, `lib/api/skill-index.ts`, the helpers exported from `added-skills-store.ts` |
| **Stores**         | Shared mutable state and the actions that write it.               | `config-store`, `ui-store`, `added-skills-store`                                                                                              |
| **Hooks**          | Reusable _behaviour_ — the only thing hooks are for here.         | `lib/use-pinned.ts`                                                                                                                           |
| **Components**     | Composition and event wiring only.                                | everything in `features/configure/components/`                                                                                                |

Only three components hold a `useEffect` at all: the add-skill dialog (debounced search), the filter
bar (publishing pinned state), and the skill cell (outside-press / Escape dismissal). Each is
genuinely local to that component.

**Styling variants live in `packages/ui` as exported CVAs**, never re-typed at a call site. Where a
call site needs the look but not the semantics — the add-skill stage marker sits inside an
already-clickable row, so it must not nest a button — it consumes `chipVariants` directly rather
than duplicating the class list. Same for `matrixCellVariants`, which the options panel's ragged
sub-agent list reuses so the tri-state colours cannot drift from the matrix above them.

---

## 6. Sticky behaviour

The **page** scrolls, not the middle column: both side columns are `sticky top-0 h-svh`, which is
what makes their dividers read as continuous. `items-start` on the grid is what allows that.

`use-pinned.ts` reports whether a sticky element is _currently_ pinned — CSS has no selector for it.
It ships two forms, and which one to use is a performance decision, not a style one:

- **`usePinned`** returns React state. Only for elements whose own markup changes — the filter bar.
- **`usePinnedAttribute`** writes `data-pinned` straight to the DOM and never renders. For the
  domain headers, whose pinned state only drives a border but which each own a grid of skill cells.

The filter bar publishes its own state to a `data-bar-stuck` attribute on the document root, and the
headers re-pin beneath it (87px → 51px) in pure CSS — the design's own `.app.stuck .dom{top:51px}`.

**None of this may live in a store.** A shared `stuck` field puts every subscriber into the render
path for a value only a `top` offset and a border depend on. Measured with the full catalogue on
screen: an **88ms blocking task** at 240 cells (39ms at 97, none at 18), which is what made the
sticky transition read as a jump rather than an ease. Attribute-driven, it is 0ms and 60fps at every
cell count.

**The stuck state must not change the bar's height.** The design collapses a 60px top padding when
the bar sticks, which removes 78px of document height at the exact moment it pins; the browser's
scroll anchoring then compensates by moving the scroll position, un-pinning the bar and restoring
the padding — a measured oscillation (`scrollY` jumped 590 → 511). The 60px of air above the bar
therefore comes from the preceding hinge's bottom margin, only horizontal padding changes, and the
border is made transparent rather than removed. Geometry is identical; the feedback loop is gone.

**Stuck goes dark (84a).** Only the colour bleeds: the wrapper takes `#242320` full width while its
contents keep the 60px gutters, so search still starts on the content edge and `＋ add skill` still
ends on it, and the dark/white seam is what separates the bar from the domain header pinning
beneath it. Every control on the band inverts with it — the search field loses its box, the chips
lose their borders and lift on a translucent white wash (amber on `rgba(176,118,44,.22)` when
chosen), and add-skill drops its fill for a `#55524a` hairline, leaving it the only bordered thing
on the band.

The inverted styling lives **inside** the primitives (`Input`, `Chip`, `Button`), never in the bar:
§2's rule is that the app must not restyle a primitive locally. It arrives as an `onDark` variant
the bar passes, named for the surface rather than for the bar's own state — the primitive has no
business knowing what "stuck" means, and a prop cannot leak onto the chips and inputs inside the
dialogs the way a root-attribute selector could.

**Sticking moves focus nowhere.** It used to hand the caret to the search input on the false → true
transition, on the theory that reaching the top of the grid is when searching becomes obvious.
Removed by owner ruling 2026-08-09, because focus can cause the scroll: a Tab to a control below
the fold scrolls it into view, and a scroll that crossed the pin took the caret off the control the
keyboard was moving to — throwing a keyboard user back to the top of the page by the act of moving
down it. `sticky-bar.spec.ts` now asserts the inverse of what it used to.

Domain headers re-pin from `top: 87px` to `top: 51px` to follow the bar. The horizontal padding and
the background are the **only** animations in the design.

---

## 7. Resolved decisions

Where the catalog and the design disagree, the catalog wins — the design was drawn against a smaller
snapshot of it.

| #   | Question               | Decision                                                                                                                                                        |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Domain set**         | Render all catalog domains as sections; chip only the five the design shows.                                                                                    |
| 2   | **Sub-agent taxonomy** | Real agents from the catalog (23, ragged), not the design's clean 4 × 4 of 16.                                                                                  |
| 3   | **Domain hierarchy**   | Ship `hierarchy: b` — 25px Inter title + amber `skills` suffix. The README prose describes the base rule; the prototype's default and every screenshot are `b`. |
| 4   | **Skill logos**        | Render the real mark where one exists, in `currentColor`; monogram otherwise.                                                                                   |
| 5   | **Domain colours**     | **Removed.** v5 has one accent; nine coloured dots would break rule 4.                                                                                          |

### Incompatibility

A skill is **out of reach** when the current selection makes it unusable, and the grid draws that by
dimming it to 40% and setting `aria-disabled`, never by hiding it. `selectReachability` in
`derive.ts` is the whole rule; it returns both what the selection has **reached** (chosen, plus what
that necessarily brings with it) and what is consequently out.

Where it comes from matters, because the obvious sources are both wrong:

| Field            | Why it is not the answer                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `conflictsWith`  | Never leaves its own category — React lists only Vue/Angular/Solid/Svelte. It cannot express React ↔ SvelteKit at all.              |
| `compatibleWith` | Lists whole neighbourhoods rather than genuine pairings; it claims React **is** compatible with SvelteKit. Nothing derives from it. |
| `requires`       | **The real source.** Authored per skill with a reason — "SvelteKit is built on Svelte", "Pinia is Vue only".                        |

The rule runs in both directions, and needs both:

- **Forward** — a skill whose requirements can no longer be met goes with them:
  `SvelteKit → requires Svelte → conflicts with React`. Transitive (Pinia needs Vue _or_ Nuxt; Nuxt
  needs Vue; Vue is gone), so it runs to a fixpoint rather than one hop. Picking React puts 14 skills
  out of reach, only 4 of them by direct conflict.
- **Backward** — what the selection implies counts as selected. Choosing Next.js is choosing React
  whether or not React was clicked, so Angular, Vue, Svelte and SolidJS all go, even though Next.js
  names none of them. Only unambiguous groups propagate: "needs Vue _or_ Nuxt" cannot name which, so
  it implies neither.

Two exemptions keep it from trapping the user:

- **A selected skill is never disabled.** Clicking it off is the way out of a bad combination.
- **An exclusive sibling is never disabled** for conflicting with something _actually selected_ in
  its own category — picking one swaps rather than adds, so Vue stays live once React is chosen.
  Two things are deliberately outside that exemption, because in neither case would the swap help:
  a sibling whose own `requires` is unsatisfiable, and a sibling conflicting with a merely **implied**
  skill — clicking Angular would not evict Next.js, so the invalid pair would survive.

The cell keeps pointer events (it is `interactive={false}` + guarded handlers rather than
`pointer-events-none`) so the reason can still be read on hover; `title` carries it, which is also
the accessible description.

---

## 8. Adaptations — where the implementation departs from the design files

Each of these is a place the design could not be followed literally, with the reason.

| Area                                 | Design                                                                                                                                        | Built                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sub-agent matrix**                 | dev · pm · rev · test over Web/API/AI/CLI/Infra, `Meta ＋` folded beneath                                                                     | The same, and nothing else — verified against `screens/04-skill-panel.png`                                              | The design draws INFRA straight into META, and the roster was unified onto these four roles plus researcher on 2026-08-05 (CLI-351 in `todo/archive.md`), deleting the three off-grid extras entirely. That leaves the four researchers off the grid: they still take skills from a stack and appear in the roster, where they can be switched off, but are **not** hand-assignable here until the grid gains the fifth role (EDITOR-10 in `todo/editor.md`). Meta expands to its four agents — the design draws the row but leaves it static.    |
| **Matrix gap cells**                 | A plain 5 × 4 field; slots with no agent (AI pm/test, CLI pm, Infra dev/pm/test) look identical to unassigned ones                            | The same, but inert — no pointer cursor, no click                                                                       | Fidelity to `04-skill-panel.png`, which shows uniform cells. Marking them (the earlier dashed treatment) invented a distinction the design does not draw.                                                                                                                                                                                                                                                                                                                                                                                         |
| **Incompatible cell**                | `.skc.dis{opacity:.4}` — dimmed, and nothing else                                                                                             | The same 40% dim, plus `aria-disabled` and a reason on `title`                                                          | The dimming matches the design exactly. What the design has no answer for is _why_ a cell is out, and that a mouse-only signal leaves the state unreadable to anything else — hence the reason and the ARIA state. A red outline was tried and pulled; see the todo.                                                                                                                                                                                                                                                                              |
| **Roster footer**                    | A single Install button carrying the counts                                                                                                   | Share above Install                                                                                                     | Sharing is a shipped feature (Cloudflare KV round trip) with no other surface yet; the design's SHARE nav destination is still an empty shell.                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Where-used count/tooltip**         | Prototype counts every row of an installed agent — a switched-off row still appears in other rows' counts and lists (`offs` only recesses it) | Only enabled rows on on-agents count (`liveUsesBySkill`)                                                                | The number answers "where else will this actually install"; counting a switched-off copy would contradict the install inventory and summary, which skip it too.                                                                                                                                                                                                                                                                                                                                                                                   |
| **Model / effort on the agent row**  | Model word cycling `sonnet · opus · haiku`; a **3**-square effort meter cycling `med · low · high`                                            | Model word cycling `opus · fable · sonnet · haiku`; a **5**-square meter cycling `low · medium · high · xhigh · max`    | The design's scales are placeholders; these are the CLI contract's (`packages/matrix/src/seed.ts`, and `packages/cli/.ai-docs/reference/features/model-and-effort.md`), and the real scale wins over a placeholder exactly as it does for the segments this replaced. Five levels means five squares — a 3-square meter cannot draw `xhigh` apart from `max`. Neither control has an off state: an agent rests on its own `metadata.yaml` model and on `medium`, and cycling back to that resting value clears the choice rather than storing it. |
| **Both controls sit beside the pin** | The agent's name row is one click target, with both controls inside it                                                                        | Both are **siblings** of the pin button, not children                                                                   | Nested, they would swallow the click that pins and bury their own values inside the pin's accessible name (`developer` would read as `developer opus effort…`). As siblings each is its own control with its own name, and a click on one cannot reach the pin at all.                                                                                                                                                                                                                                                                            |
| **Info affordance on Install scope** | A hinted glyph beside the section label (89a), tip opening right of the glyph (90j)                                                           | A real `<button aria-label="About install scope">`; the tip opens right of the **panel**, mirrored when the panel flips | A hinted span is pointer-only; a button is what makes the explanation reachable by keyboard, and the same accessible name serves both. The tip is positioned off the panel rather than the glyph for the same reason the panel itself flips in the last column — anchored to the glyph it would open over the panel's own controls. Revealed on `:focus` rather than `:focus-visible`, so asking for it with the keyboard works whether or not the browser decides a focus ring is warranted.                                                     |
| **Quiet at rest (87a)**              | `pre` / `lazy` and the where-used count fade in while the pointer is over the agent block                                                     | The same, plus focus anywhere inside the block                                                                          | Keyboard equivalence: the load word is a real button, so it can be tabbed to — and without the focus half it would be reached while still invisible. Opacity, not display, so revealing one cannot reflow the rows beneath it.                                                                                                                                                                                                                                                                                                                    |
| **`•••` on an unselected skill**     | Panel opens                                                                                                                                   | Panel opens, and the skill stays unselected                                                                             | As the design has it. Configuring is not choosing: the `•••` and both badges never select. What they set on an unselected skill goes to `remembered` — the same place a deselected skill's setup goes — so it survives and `select` restores it verbatim. The panel shows `entry ?? remembered ?? freshEntry`, the same three fallbacks the store writes through, so it can never display one thing and save another.                                                                                                                             |
| **Agent count opens on hover**       | "Hover/click"                                                                                                                                 | Click only                                                                                                              | A hover-opened panel containing interactive controls is hostile to reach. Click is listed in the design too.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Panel dismissal**                  | Click `•••` again                                                                                                                             | Also outside press and Escape                                                                                           | The design does not say, and a popover with no escape hatch is a trap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Panel overflow**                   | Always opens to the right                                                                                                                     | Flips left in the last column                                                                                           | At `left: calc(100% + 5px)` a last-column panel escapes the main column.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Source code link**                 | Nothing — the panel is entirely about installing                                                                                              | A `Source code ↗` link at the panel's foot, opening the skill's own directory in a new tab                              | A skill is somebody else's repository, and the panel described everything about installing one and nothing about where it comes from. Both kinds already carry the address — the catalogue is generated from the marketplace repo, and an added skill arrived through the index carrying its own — so neither needs a fallback. `HEAD` rather than a branch name, which is the one thing neither source knows; a new tab rather than a navigation, because added skills live for this session only and leaving the page would take them with it.  |
| **Uncategorized added skills**       | "lands in Uncategorized" — never mocked                                                                                                       | Own trailing `Added` section                                                                                            | Appending to a real domain would imply membership of it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Cell lattice**                     | Border + white background on the _grid container_                                                                                             | Border + background on each **cell**, pulled back 1px so shared edges coincide                                          | Equivalent only while every row is full. The mock never shows a partial row; ours do constantly, and there the container approach paints white across the empty columns and runs a rule out past the last cell.                                                                                                                                                                                                                                                                                                                                   |
| **Domain chips**                     | Static markup, no behaviour                                                                                                                   | Toggle filter; active chip clears                                                                                       | Chips are hardcoded in the prototype; the README lists filter behaviour as a gap to fill.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Skill descriptions**               | ~25 chars describing the _library_                                                                                                            | The catalog's skill description                                                                                         | The catalog describes the skill, not the library. Needs new upstream data, not a UI change.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 9. Testing

Two layers, split by what each is good at.

| Layer                            | Covers                                                                     | Cost  |
| -------------------------------- | -------------------------------------------------------------------------- | ----- |
| **Unit** (`vitest`, 94 tests)    | Pure logic: derivations, the persisted-schema boundary, the read model     | ~20ms |
| **E2E** (`playwright`, 88 tests) | Behaviour through a real browser: wiring, interaction, layout, persistence | ~16s  |

The split is not "units are better", it is **where a case is reachable**. Three things make a case
belong in a unit test:

- **The input space is combinatorial.** `isStackCustom` has six independent ways to flip and
  `selectDomainViews` crosses four filters with two provenances of skill. Each case is one browser
  round-trip end-to-end and microseconds in-process.
- **The path is a boundary against untrusted or legacy data.** `migrateConfig` and `pruneUnknownIds`
  read whatever localStorage happens to hold. This is the only place in the app where a bug is
  _silent_ — a broken migration does not throw, it quietly returns a configuration missing someone's
  afternoon of work. Reaching it end-to-end means hand-seeding a legacy blob and reloading.
- **Failure needs localising.** An E2E failure says the roster shows the wrong count; a unit failure
  says `summarize` counted an assignment where it should have counted an agent.

Everything else belongs in the browser, where a jsdom approximation would only be a weaker version
of the same assertion. `packages/vitest-config` ships a node preset for that reason: nothing under
unit test needs a DOM.

Both suites are verified non-vacuous by injecting regressions and checking that exactly the tests
naming the broken behaviour fail — see the tracker.

---

## 10. Deferred

| Item                    | State                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| Added-skill persistence | Session-only by explicit instruction. Needs a real marketplace entry to persist. |
| GitHub proxy            | `apps/server`. Unauthenticated search is 10 req/min, hence the 350ms debounce.   |
| Docs / Share / Settings | Route + centred heading only.                                                    |
| Empty / loading / error | Only the filter's no-match line and the dialog's error line exist. Undesigned.   |
| Responsive < 1324px     | Hard `min-w`; the page scrolls horizontally. Undesigned.                         |
| Dark mode               | Undesigned. The `.dark` block was removed rather than left stale.                |
