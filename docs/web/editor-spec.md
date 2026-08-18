# Editor — Implementation Spec

Scope: the **Configure** screen. Docs and Settings get a route + empty shell.
Design source of truth: `.claude-design/README.md` + `.claude-design/design/Configurator v5.dc.html`,
with `.claude-design/screens/*.png` as the visual reference every §10 adaptation below is measured
against. §10 is also where the implementation deliberately departs from those files, with the reason.

---

## 1. Architecture

### Package layout

| Package                      | Owns                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/matrix`            | Vendored CLI catalog, zod schemas, the read models, stack expansion, the selection semantics. Pure TS — no React. |
| `packages/ui`                | The design system: tokens + 11 primitives. No app knowledge.                                                      |
| `packages/api-mocks`         | One mock of the worker's HTTP surface, shared by the unit suite and the Playwright fixtures.                      |
| `packages/typescript-config` | `base` / `react-library` / `vite-app` / `node` tsconfigs.                                                         |
| `packages/eslint-config`     | `base` / `react-library` / `react-app` flat configs.                                                              |
| `packages/prettier-config`   | The single Prettier config, declared once in the root `package.json`.                                             |
| `packages/vitest-config`     | The `node` preset the editor's unit suite merges — nothing under unit test here needs a DOM.                      |
| `apps/editor`                | Routes, stores, feature components, derivations, the worker and GitHub seams.                                     |

`noUnusedLocals` / `noUnusedParameters` stay unset everywhere — every workspace holds code it does
not author (vendored CLI types, generated icon map), and tsc has no per-directory escape. ESLint's
`no-unused-vars` covers it and can scope.

### Data flow

```
BUILT_IN_MATRIX + AGENT_DEFINITIONS       (packages/matrix/src/{vendor,generated})
  └─ packages/matrix/src/schema              MatrixSchema.parse once, in read-model/source.ts
      └─ packages/matrix/src/read-model      catalog · stacks · sub-agents · selection semantics
          │                                  · assignment defaults · preload defaults
          └─ export from "@workspace/matrix"
              └─ apps/editor/src/stores/catalog-store   THE SEAT — one Matrix and everything built from it
                  ├─ stores/config-store         the selection           (persisted, read on demand)
                  ├─ stores/saved-stack-store    one snapshot payload    (persisted)
                  ├─ stores/marketplace-store    saved catalogues + tokens (persisted)
                  ├─ stores/ui-store             panels, dialogs, flash  (rosterCollapsed persisted)
                  ├─ router search params        view state, and which configuration is on screen
                  └─ features/configure/lib/derive.ts → view data
                      └─ components
```

Two things reach the seat from outside the vendored catalogue, and each is parsed at the app's own
boundary on the way in: a marketplace's `catalog.json`, through `matrixSchema.safeParse` in
`lib/api/catalog.ts`, and an added skill's directory, through `lib/api/skill-contents.ts`. Both are
described in §5.

`apps/editor` imports from `@workspace/matrix` and its declared subpaths only —
`@workspace/matrix/matrix-schema` and `@workspace/matrix/skill-index`, which exist so a module whose
whole job is one fetch does not pull the barrel and pay for its import-time parse of the vendored
matrix.

### Decisions

| Question     | Decision                                                                                | Rationale                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router       | `@tanstack/react-router` v1, code-based routes                                          | `validateSearch` + zod gives a typed, validated URL boundary.                                                                                       |
| Table        | **Removed.** `@tanstack/react-table` is gone.                                           | v5 renders skills as grid cells; there is no table left to build.                                                                                   |
| Worker calls | No react-query. `hc<AppType>` behind `lib/api/configs.ts` and `lib/api/skill-index.ts`. | Nothing is shared to cache: a config id is content-addressed and immutable, and the index carries its own freshness header.                         |
| GitHub calls | Plain `fetch`, browser-direct, in `lib/api/catalog.ts` and `lib/api/skill-contents.ts`  | An org's catalogue and a third party's files pass through nothing of ours, and the token that reads a private marketplace never leaves the browser. |
| Icons        | `simple-icons` (raw path data) + hand-checked map                                       | Drawn in `currentColor`, never brand colour — see §2 rule 4.                                                                                        |

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
   second signal colour: a skill the selection has ruled out is dimmed, not reddened — see §9.
5. **Whitespace, not rules, separates content.** Two kinds of horizontal rule exist: the full-bleed
   section divider and the collapsed cell lattice.

**The app must never restyle a primitive locally.** shadcn's semantic vars are remapped onto the v5
palette in `:root`, so generated components inherit the language without per-component overrides.

---

## 3. State

Five Zustand stores. Every one but the catalogue seat persists, and each owns its own slot — a
version bump in one must not discard the others.

### Catalogue seat — `apps/editor/src/stores/catalog-store.ts` (**not** persisted)

The one place the app reads a catalogue from. Everything derived from a catalogue lives here,
because they must all move together: a grid showing one marketplace's skills while the semantics
judge them by another's is not a state worth being able to represent.

```ts
type CatalogSeat = {
  catalog: Catalog // domains → categories → skills, plus both indexes
  stacks: CatalogStack[] // the stack rail's cells, this catalogue's own
  version: string // stamped into every payload
  marketplace: string | null // null = the vendored public catalogue
  skillById: (skillId: string) => CatalogSkill | undefined
  expandStack: (stackId: string) => StackExpansion | undefined
  judgeSelection: SelectionSemantics
  // The skills above that answer to no marketplace, with their bytes.
  external: Record<string, ExternalSkill>
}
```

| Action                      | Meaning                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load(matrix, marketplace)` | Wholesale — never merged. Two marketplaces' ids cannot collide by construction, so a merge would have no conflicts to resolve and would still be a catalogue nobody published. External skills go with it: a category id belongs to the catalogue that declared it. |
| `reset()`                   | Back to the vendored public catalogue, external skills included.                                                                                                                                                                                                    |
| `addExternal(skills)`       | Idempotent and additive: an id already seated is left as it is, so re-importing a payload that names a skill this browser already added adds nothing twice.                                                                                                         |
| `removeExternal(skillId)`   | The inverse.                                                                                                                                                                                                                                                        |

The seat is rebuilt, never spliced. `seatFor` merges the external skills into the source `Matrix`
(`matrixWith`) and runs `buildCatalog` / `buildStacks` / `createSkillLookup` / `createStackExpander`
/ `createSelectionSemantics` over the result, which is why the source `Matrix` is held rather than
only the built `Catalog`.

**An added skill is a real catalogue entry.** It is placed, sorted, judged, filtered and looked up by
exactly the rules every other skill is, and nothing downstream branches on provenance. `added` is a
flag on `GridSkill` and `InventorySkill` for the tag and the contents affordance — never a branch in
a derivation. It declares no relationships and is named by none, which is honest: nothing outside the
catalogue can say what it conflicts with, and nothing inside knows it exists.

Components subscribe with a selector and re-render on a swap; the stores and pure derivations that
are not components read through the non-React accessors — `activeCatalog`, `activeStacks`,
`activeVersion`, `activeMarketplace`, `activeSkillById`, `activeExternalSkill`, `expandActiveStack`,
`judgeActiveSelection`. All of them read per call: a binding taken at module scope would be the
vendored catalogue forever, which is the bug the seat exists to make unrepresentable.

### Config store — `apps/editor/src/stores/config-store.ts` (persisted)

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
  scope?: "project" | "global"
}

type ConfigState = {
  stackId: string | null // null = "Start from scratch"
  skills: Partial<Record<SkillId, SkillEntry>> // SPARSE — presence *is* selection
  remembered: Partial<Record<SkillId, SkillEntry>> // deselected, not discarded
  agents: Partial<Record<AgentId, AgentEntry>> // SPARSE — only what was decided
}
```

**Model, effort and scope belong to the sub-agent.** A skill is a plugin from someone else's repo:
in plugin mode its `SKILL.md` frontmatter belongs to the marketplace and any edit we write is undone
by the next update, so a per-skill model would work in eject mode and silently do nothing in plugin
mode. The agent file we always generate. One agent-keyed map holds all three, because two parallel
agent-keyed records drift.

**The agents map holds choices, not state.** There is no single default model: an agent rests on the
one its own `metadata.yaml` names (`SubAgent.model`, falling back to `sonnet` when that is not one of
the four the web offers), effort rests at `medium` for everyone until agent metadata carries one, and
scope rests on `DEFAULT_SELECTION_OPTIONS.scope`. `resolveAgentOptions` is where a row's displayed
value comes from; setting a field back to its resting value removes the key, and a record left with
nothing in it is dropped. `on` is exempt from that rule — pinning to the state the assignments
already imply is still a decision, and the pin is what holds it there as skills come and go.

**Selecting assigns automatically.** A fresh selection arrives with the rule's assignments
(`lib/default-assignments.ts`), and the whole answer comes from the matrix's shared resolver —
`resolveAssignment` (`packages/matrix/src/read-model/assignment-defaults.ts`), the same one the CLI's
config generator reads, so a pick lands on the same agents from either surface. The skill is handed
over as a **taxonomy** rather than a bare id, which is what makes a loaded marketplace and an added
skill work: the resolver would look a bare id up in the vendored catalogue and find nothing.

Its relevance rule:

| Skill's domain                    | Reaches                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An implementation domain          | every agent in its own domain group, plus the cross-domain role agents `reviewer` and `pm`                                                                                                                 |
| `shared`                          | every agent whose flavor is not `meta` — all four domain groups plus `reviewer` and `pm`                                                                                                                   |
| `meta`                            | exactly the flavors its `PRELOAD_DEFAULTS` row names, plus the role crafts: `meta-methodology` and `meta-planning` reach the planning flavor, `meta-reviewing` and `meta-design` reach the reviewer flavor |
| An id no seated catalogue carries | nobody — relevance unknown, so it is assigned by hand in the ••• panel                                                                                                                                     |

Each reached agent loads the skill as `resolveLoadState` over `PRELOAD_DEFAULTS`
(`packages/matrix/src/read-model/preload-defaults.ts`) says, where a skill's row names the role
flavors that carry it eagerly and absence means lazy. The rows are the **shipped** catalogue's ids,
so a marketplace skill and an added skill have no row to be eager by and arrive lazy everywhere; a
craft reach targets without preloading, so a craft the rows never name for that flavor arrives lazy
too. Picking React reaches `web-developer`, `web-researcher`, `web-tester`, `pm` and `reviewer`, all
preloaded; an added skill filed under `web-framework` reaches the same five, all lazy.

An agent is **on** when a pin says so, else when it holds ≥ 1 enabled skill (`isAgentOn`) — selecting
a skill is what switches its agents on, and the roster flashes the agents a selection just reached.

**Deselecting is not destructive.** One click removes a skill; the configuration behind it can be a
dozen — sub-agent assignments, an install mode, a scope — and the cell gives no warning, because
deselect reads as "not included" rather than "erase my work". A deselected entry moves to
`remembered` and is restored if the skill is selected again.

One rule covers both cases, with no special case per category: _a skill remembers how you configured
it; a skill you have never configured starts blank._ An exclusive swap evicts the sibling, which is a
deselection the user did not click, so it keeps the same promise — pick Vue over React and React
returns configured when you pick it back, while Vue starts blank because it has never been
configured.

Two boundaries stop this becoming a leak. `isWorthRemembering` drops entries that carry no
information at all — default options, no assignments — which is what a blank skill selected and
immediately deselected looks like; a stack-applied skill arrives _with_ assignments and so is always
remembered. An entry says something only through its assignments or its install options. And
`applyStack` clears the map, because it is the explicit start-over action and already confirms first
when edits would be lost.

Derivations take `ConfigSelection` (`stackId` + `skills` + `agents`), never `PersistedConfig`. A
remembered skill must not appear in a grid, a roster line, a count or the install inventory, and
excluding it at the type level means that cannot happen by accident.

`assignments` is the **single source of truth**. Per-cell agent counts, the roster panel and the
install inventory are all derived and none of them stores a copy — the prototype duplicated these and
they drifted. There is no `selected` boolean: presence in the map means selected.

**`pruneToCatalog` drops whatever the seated catalogue cannot place**, and is called by each of the
controls that seats one — see §5. Hidden from the grid is not dropped: an id left in the map is still
in the install list and in every link minted from here, under a marketplace ref that cannot resolve
it. It returns without a `set` when it drops nothing, because a `set` under `persist` is a write, and
the one caller that runs before the saved configuration has been read at all would otherwise put an
empty store into the slot the parked restore was about to read.

### Marketplace slot — `apps/editor/src/stores/marketplace-store.ts` (persisted)

```ts
type SavedMarketplaces = {
  // Which catalogue this browser chose. `""` is the public one.
  current: string
  // Marketplace → the token that reached it, `""` for one needing none.
  saved: Record<string, string>
}
```

Retyping a repository and re-pasting a PAT on every visit is the whole difference between a feature
and a demo. Both plain strings, where empty means absent — so "never set" and "cleared" need no
third state.

**Three notions of "marketplace" exist, and this file owns the second and third.**

| Notion     | Where it lives                         | What it means                                                |
| ---------- | -------------------------------------- | ------------------------------------------------------------ |
| **SEATED** | `catalog-store`, `activeMarketplace()` | The catalogue loaded in this tab                             |
| **CHOSEN** | `marketplace-store.current`            | Which catalogue this browser said is its own                 |
| **SAVED**  | `marketplace-store.saved`              | Every marketplace a load has succeeded against, by its token |

Every surface naming a marketplace to the user names the SEATED one — the install dialog's header,
a skill's source link — because that is the catalogue the grid is drawing and the one a payload
minted here is stamped with. With nothing seated both read `PUBLIC_MARKETPLACE`, which is
`agents-inc/skills`: a payload carrying no marketplace installs from that repository, so that is what
it is called, and "none loaded" is not the name of one. `MarketplaceSwitcher` is the single exception
and deliberately so: it lists SAVED keys, because what it offers to switch to is what this browser
typed and loaded.

**Keyed by marketplace, which makes the asymmetry structural rather than stated.** The
marketplace **identifies** — it says which repository, and it is what a seed payload carries so
`--from` installs from the right one — so it is the KEY; the token only **authorizes** — it says we
may read, never what to read — so it is the VALUE, and cannot exist without the repository it is
for. A token is therefore only ever spent on the repository it is filed under (`tokenFor`), which is
what stops a shared link from presenting this browser's credential to a repository it was never
issued for. An entry filed under no marketplace names nothing and is dropped, its neighbours
untouched (`readSavedMarketplaces`, kept pure so it can be exercised without a browser). A `current`
naming a marketplace nothing is filed under is a choice this browser cannot have made, and falls
back to the public catalogue — leaving every token where it is.

| Action                         | Meaning                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `remember(marketplace, token)` | A load that succeeded: file the token under it and make it the chosen one. Both at once — one decision. |
| `choose(marketplace)`          | Which saved catalogue to show. Never a statement about credentials.                                     |
| `choosePublic()`               | The public catalogue, which is what an empty marketplace field asks for.                                |

**There is deliberately no verb that forgets a token.** Clearing the field is a statement about which
catalogue to show, and nothing in the app asks to destroy a credential — so there is no door to reach
one through, which is the strongest form the guarantee takes. A GitHub PAT is shown once and cannot
be recovered.

`PERSIST_VERSION = 1` with a `migrate`, and it is the store's own shape version rather than the `v1`
in the key, which names the slot and stays put. `migrateSavedMarketplaces` carries a single-slot
`{ marketplace, token }` blob forward as one entry, because browsers hold one and the alternative is
the discard path reading it as unparseable and taking the marketplace and the PAT together. A slot
naming no marketplace still names nothing and still goes.

It lives in localStorage and nowhere else: never on our worker, which is the point of fetching
browser-direct, and never in a `VITE_` variable, which bakes into the bundle and would ship one org's
token to every visitor. Two controls write it and no more — the dialog's Load and the switcher's
confirmation — see §5.

### Saved-stack slot — `apps/editor/src/stores/saved-stack-store.ts` (persisted)

One `SeedPayload`, which is the same serialization sharing sends, so a saved stack and a shared link
can never restore different things. A single slot: saving again overwrites, so the stack grid gains
exactly one cell however often Save is used.

Deliberately its own slice rather than a field of the config store: that one is versioned by
`PERSIST_VERSION` and discarded wholesale on a bump, and a snapshot someone made on purpose must not
go with the browser state it happened to be saved from. The payload's own `v` is this slot's version
seam, and it is stricter — a payload minted under an older contract fails to decode rather than being
guessed at.

### UI store — `apps/editor/src/stores/ui-store.ts`

| Field                | Holds                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `openPanelSkillId`   | Which skill's ••• options panel is showing. One at a time.                                              |
| `pendingStack`       | A `StackRequest` awaiting confirmation: `{ kind: "stack"; stackId }` or `{ kind: "saved" }`             |
| `pendingMarketplace` | Which saved marketplace a switch has been asked for, awaiting the confirmation that names what it costs |
| `dialog`             | `"none" \| "install" \| "add" \| "marketplace"`                                                         |
| `previewSkillId`     | Which added skill's contents are on show, over whatever else is open                                    |
| `rosterCollapsed`    | Domain id → that roster accordion is shut. The only persisted field.                                    |
| `flashedAgentIds`    | The roster pulse; decays after 2.6s, and the timer is module-level so a re-render cannot restart it.    |

`previewSkillId` is its own field rather than a fifth `dialog` value because the install dialog is
one of the two ways in: reading what a skill holds is a question asked _about_ the list of what is
going to be written, so that list has to still be there underneath and still be there afterwards.

`pendingMarketplace` is its own field rather than a `StackRequest` variant for a different reason:
seating a different catalogue and applying a stack replace the same selection, but only one of them
can be described before it happens, and only that one has a catalogue to fetch first.

`stuck` is deliberately **not** here — see §8.

### Persistence

| Concern    | Approach                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys       | `agents-inc:config:v1` · `agents-inc:ui:v1` · `agents-inc:marketplace:v1` · `agents-inc:saved-stack:v1`                                                                                                                                                                                                                     |
| Validation | `merge` → `safeParse`; on failure **return current** and report the issue with paths and codes only, never values                                                                                                                                                                                                           |
| Stale ids  | `pruneUnknownIds` drops ids nothing can resolve, the `agents` map included, and the difference is counted and reported. Skills and stacks are judged by the **seated** catalogue; agents by `SUB_AGENTS_BY_ID`, because marketplaces do not ship sub-agents                                                                 |
| Hydration  | `skipHydration: true` on the config store. `readSavedConfig()` is the only reader — see §4                                                                                                                                                                                                                                  |
| Migration  | `PERSIST_VERSION = 8` on the config store. Pre-release policy: no migrations — a blob from any other version is discarded, and the discard is reported. The marketplace store is the one exception: its `migrate` carries the single-slot shape forward, because the alternative is discarding a PAT that cannot be re-read |

`partialize` writes only what the next session can describe: an external skill's directory is not in
localStorage, so a selection naming one is stripped (`onlyPersistableSkills`). Saving the stack is
what carries an added skill across a reload, because the slot holds a payload and a payload carries
the content.

**The config slot can be detached.** `detachSavedConfig()` swaps the store's storage for
`withoutWrites(OWN_SLOT)` — the same slot, read and never written, `removeItem` included, since a
slot emptied is a slot written. Guarding every write would be a rule every action added later has to
keep; taking the pen away is one statement made once. `readSavedConfig()` hands it back, and whether
it had been held is the same question as "is what is in memory this browser's?".

Both untrusted reads outside the config store — `readSavedMarketplaces` and `readSavedStack` — are
pure functions over `unknown`, so they are unit-tested without a browser. An unreadable slot and an
empty one are the same answer on purpose: there is nothing to restore either way.

### URL search params — `/`

| Param    | Zod                                      | Default | Note                                                     |
| -------- | ---------------------------------------- | ------- | -------------------------------------------------------- |
| `domain` | `z.enum(DOMAINS).nullable().catch(null)` | `null`  | `null` renders every domain — the design's resting state |
| `q`      | `z.string().trim().max(64).catch("")`    | `""`    |                                                          |
| `sel`    | `z.boolean().catch(false)`               | `false` | Narrow to what you have actually chosen                  |
| `fromId` | `z.string().trim().max(64).catch("")`    | `""`    | Which configuration is on screen — see §4                |

Every field `.catch()`es its default, so a hand-edited URL degrades instead of throwing.
`stripSearchParams(CONFIGURE_SEARCH_DEFAULTS)` keeps a pristine view's address clean.

`fromId` is also the URL `packages/cli` hands out for `share` and `edit --ui` (`src/cli/consts.ts`),
so its shape is a contract with that package rather than this one's to change alone.

---

## 4. Opening — two addresses, catalogue first

`useCatalogFirst(search.fromId)` (`features/configure/lib/use-catalog-first.ts`) is the whole of the
opening. It returns `{ notice, recovery }`: one line above the grid, and the thing the marketplace
dialog needs to finish what could not be finished.

**Nothing may resolve an id before the catalogue those ids were minted against is seated.** The app
resolves ids in exactly two places — the configuration this browser saved, and the one a `?fromId=`
link addresses — and the catalogue loaded at first paint is always the vendored public one, so a
selection made on a marketplace would prune as unknown on the way back in, by reload and by link
alike. One bug, two doors; it is sequenced here once rather than shimmed at each door.

**The two doors are two addresses.** `/` is this browser's own editor, governed by the marketplace it
stored. `/?fromId=<id>` is a shared configuration and governs itself: the id is read on every load
rather than consumed once, so a reload reopens the same state, and clearing it — which is what the
nav rail's Configure link does — is how you get back to your own.

| Address         | Sequence                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | seat the catalogue `marketplace-store.current` names → `readSavedConfig()`                                                             |
| `/?fromId=<id>` | `fetchSharedConfig(id)` → `detachSavedConfig()` → seat the catalogue `payload.marketplace` names → `adoptSeedPayload` → `importConfig` |

Seating is idempotent both ways, which is load-bearing twice over: a whole catalogue must not be
fetched again to arrive where it already is, and re-seating drops the external skills added this
session, which a payload that did not name them has no business taking away. Naming no marketplace
means the vendored public one, and seating **that** is not optional either — a public payload read
against a loaded marketplace prunes exactly as a marketplace payload read against the public
catalogue does.

A shared address changes what is on screen and never what the visitor had. `detachSavedConfig()`
holds the config slot open for as long as the address is open, not merely across the import — a
guarantee that lasts until they touch something is not a guarantee. Nothing about the link reaches
the marketplace slot either: `seatMarketplace` fetches and seats and stores none of it, so a
marketplace reaches the slot only through the dialog or the switcher. The token comes from the
marketplace being seated rather than from whatever this browser last chose, so one it holds nothing
for is read with no `Authorization` header at all — an address a visitor was sent cannot present
their credential to a repository it was never issued for.

**Leaving a shared address is as complete as arriving at one.** The effect clears the notice and the
recovery before opening the new address, because a screen the router keeps mounted clears nothing on
the way out: the shared notice left standing over the visitor's own grid is the app vouching for a
swap that did not happen, and a recovery's endings close over the payload the last address was
applying. `readSavedConfig()` then takes the slot back, and what is in memory is emptied first —
`merge` answers an empty slot and an unreadable one alike by keeping what is already there, which on
the way back from a shared address is somebody else's configuration.

`adoptSeedPayload` seats the payload's `external` map **before** `pruneUnknownIds` runs, because an
external skill's id is known to no catalogue until its own content puts it there. `unknownPayloadIds`
then measures what the import actually produced against what the payload named, so the notice can
list the ids by name rather than a count.

**Both doors name what they dropped, through a twin of that function each.** `unknownSavedIds`
(`stores/config-store.ts`) is the saved door's, comparing the blob as it was saved against the
configuration it pruned to; it names the same three places `unknownPayloadIds` does — the skills
asked for, the agents asked for, and the stack. `remembered` is in neither: a deselected skill's
setup was never going to be applied, so naming it under "not applied" would describe a loss nothing
on screen can show. One builder, `droppedNotice`, turns either answer into the line, which is why
the two doors say it in the same words.

**The saved door's answer travels in a module-level `unknownOnLastRead`, not in store state, and
that is a constraint rather than a shortcut.** Every route out of the store is a `set`, `persist`
wraps `set`, and a `set` therefore writes — so reporting the prune through the store would put the
pruned configuration into the slot as the price of mentioning it. That is exactly the loss
`pruneToCatalog`'s own early return exists to refuse. The variable is also the only place both
halves ever exist at once: `merge` holds the saved blob and the pruned result together for one
moment, and by the time the store holds an answer what was dropped is gone. `readSavedConfig()`
empties it before rehydrating and returns it after, so the answer describes that read and not the
last one — a read that did not happen returns `[]` and costs nothing. `heldOpen` sits beside the
store for the same reason.

### What the opening says

| State                                             | Line                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A shared address is open                          | `A shared configuration, not your own. Yours is untouched under Configure, and nothing changed here is saved.`                                              |
| Ids the seated catalogue could not place          | `Not in <catalogue>, so not applied: <ids>.`                                                                                                                |
| The link itself did not fetch                     | `<error> — showing your own configuration instead.` and the address opens as the visitor's own editor                                                       |
| The link's catalogue would not load               | `This link's skills come from <marketplace>, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.`                  |
| This browser's own saved catalogue would not load | `Your configuration is saved against <marketplace>, which could not be loaded — nothing has been read from it yet. Load it from Marketplace to restore it.` |

**A failed restore prompts, exactly as a first load does.** Since hydration waits on the catalogue, a
failed restore renders the whole configuration as empty, which reads as lost work. It is not —
nothing has been read, so nothing has been pruned — and saying so is the difference between an
explanation and a bare grid.

Either failure **parks**: the recovery is handed to the marketplace dialog, which opens pre-filled
with the marketplace name and the failure that produced it, and `onSeated` finishes whatever was
waiting. The dialog stays the single owner of whether it is open, so cancelling closes it without
discarding anything — the notice says what is still waiting, and re-opening it from the floating
button offers the same form and the same way to finish. The switch confirmation takes the same
recovery, because what a parked import waits on is a catalogue rather than a particular control: any
seat finishes it, and the ids the catalogue that arrived cannot place are then named on screen, which
is the answer catalogue drift already gets.

The effect keys on the address it has opened rather than counting openings, and deliberately carries
no cancellation flag beside it: StrictMode mounts, unmounts and remounts, so a `stale` flag set by
the first cleanup would discard the one opening the ref permitted and nothing would ever load. A
store `set` after unmount is a no-op rather than a leak.

---

## 5. Marketplaces and external skills

### Loading a marketplace

A floating button at the foot of the skills column — `sticky bottom-5`, so it travels with the
scroll and floats over the grid rather than belonging to any one section, because which catalogue is
loaded is a statement about everything in the column. It carries the SEATED name when one is loaded,
so it doubles as the only answer on screen to "which catalogue am I looking at?". Sticky and not
fixed to the viewport: the nav rail already owns the viewport's bottom-left corner, and the page
grid centres itself past `105.25rem`, so any constant offset that clears the rail on one monitor
lands on it — or out in the margin — on the next. `w-fit`, because any width the box does not need
is a strip of skill cells that cannot be clicked.

`MarketplaceSwitcher` sits beside it, one button per SAVED marketplace that is not the chosen one.
Beside the button that names where you are rather than inside the dialog, because it answers the same
question the button does and answering it should not cost a dialog. Absent below two saved
marketplaces, which is not a special case: with one, the button already names it and there is nowhere
to switch to. It never lists what a link brought — only what this browser typed and loaded — so a
marketplace appearing there that nobody typed would be a bug on screen rather than one in storage.

The dialog takes a marketplace and, progressively, a token:

- **`owner/repo`**, with everything a user might paste around it stripped — the `github:` and `gh:`
  prefixes `--marketplace` takes on the CLI, the `https://github.com/…` a browser puts on the
  clipboard, a `.git` suffix, and an optional `#ref` for a catalogue not yet on the default branch.
  Refusing a non-repository here rather than asking GitHub keeps the failure at the field the user is
  looking at.
- **The token field appears only once an answer says a credential might reach the repository**, and
  stays for as long as one is held. The public case — everyone until an org adopts this — never sees
  a credential field. Empty means no `Authorization` header at all rather than an empty one.

`fetchCatalog` GETs `api.github.com/repos/<owner>/<repo>/contents/.claude-plugin/catalog.json` with
`Accept: application/vnd.github.raw+json`, so GitHub serves the file's own bytes rather than a base64
envelope, and `safeParse`s the answer against `matrixSchema` — the same schema `build marketplace`
emits against, so there is no transform layer. A failure carries a **kind**, because the three things
that can go wrong have three different fixes:

| Kind           | Cause                                                     | What the dialog offers                      |
| -------------- | --------------------------------------------------------- | ------------------------------------------- |
| `unauthorized` | 401, 403 or 404                                           | A token field and a retry                   |
| `invalid`      | Not a repository, or a `catalog.json` that will not parse | Nothing to retry — the same bytes come back |
| `unreachable`  | GitHub did not answer, or answered with any other status  | A retry                                     |

404 belongs with the refusals a token can fix rather than with the typos: GitHub 404s a private
repository for a caller who may not see it, so the wording must not say the name is wrong.

**Nothing is written to the marketplace slot until a catalogue has actually loaded.** A marketplace
that never resolved is not one to restore next visit, and a token that never authorized anything is a
credential kept for nothing. `remember(named, token)` files the token under the marketplace it just
authorized, so the one key the form can write is the one in the field. Naming a different repository
re-reads the token field from `tokenFor` rather than carrying the last one along: a credential that
followed whatever was typed next would be filed under a repository it was never issued for.

Clearing the field is how someone goes back to the public catalogue; there is no second control,
because "no marketplace" is what an empty field already means. It calls `choosePublic()` and
`catalog-store.reset()`, and touches no token — going back to the public catalogue is not a reason to
lose a PAT that cannot be re-read anywhere. A parked import is deliberately **not** continued from
there — its ids belong to the marketplace it named, and applying them against the public catalogue is
precisely the silent partial import the recovery exists to prevent. A parked **restore** is, because
its marketplace comes from the slot that clearing the field has just emptied, so the public catalogue
really is the catalogue it is saved against. The two endings are `onSeated` and `onPublic`, answered
by whichever opening parked the recovery — see §4.

The form is a separate component mounted only while open and keyed on the recovery, so its `useState`
initialisers read fresh on every open. That is what makes a cancelled edit disappear without an
effect resetting three fields.

### Seating a catalogue names what it costs

Every door that seats one names the concrete consequence and seats only on a second explicit press.
The consequence is knowable: a catalogue has to be read before it can be seated in any case, so its
ids are in hand while the current selection still is, and the set the target cannot carry is the
whole of what is lost. A dialog that said "your selection may change" is one people click through.

`marketplace-switch.ts` holds both halves, and they are one fact asked in two shapes rather than two
that have to agree:

| Export                                                | Answers                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `dropsSelection(target, selectedIds)`                 | Whether there is a consequence at all                                       |
| `switchConsequence(marketplace, target, selectedIds)` | What it is, in one sentence naming the skills by their SEATED display names |

The count is against the whole selection rather than the dropped set alone, because "3 of your 7" and
"3 of your 3" are different decisions. Names come from the seated catalogue, which is the one that
still knows what these ids mean — after the switch nothing will — and an id it cannot place either is
still being lost, so the bare id is the only name left for it.

| Door                                    | How the consequence is shown                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The dialog's **Load** (named or public) | Read first, then a status line carrying the consequence and `Nothing has changed yet — press Load again to switch.` The same Load seats on the next press. |
| The **switcher**                        | `MarketplaceSwitchDialog` — an alert dialog that reads the target, describes the switch, and seats only on its `Switch marketplace` action.                |

**No second press when nothing is at stake.** `readCatalogue` seats immediately when
`dropsSelection` is false, which is every first load of a session and every load onto a catalogue
that carries what is picked — naming a consequence there would be a second press in front of nothing
and a sentence with no content. The switcher always confirms, because being asked at all is what the
switch costs, and its sentence says `loses nothing` where that is the answer. Naming a different
repository while a consequence is on screen drops it back to idle: a consequence describes the
catalogue that was READ, so the next press has to read again rather than seat what the last one
found.

`MarketplaceSwitchDialog` is keyed on the target marketplace, so asking about a second one reads it
fresh rather than describing it with the first one's answer, and its cleanup drops a late answer
rather than cancelling the fetch. Reading is not switching: nothing is seated, stored or pruned until
the action, which is what makes cancelling free. A target that will not read is an answer rather than
an error state bolted on — it names why and offers no action, because there is nothing to confirm.

**Naming a consequence and dropping the skills named travel together.** Both doors call
`pruneToCatalog()` immediately after seating. A door that drops without naming is the silent loss the
confirmation exists to prevent; a door that names without dropping leaves ids off the grid but still
in the install list and in every link minted from here, under a marketplace ref that cannot resolve
them — so the link installs a subset and the sharer is never told. Seating through either door also
finishes a parked recovery, because what a parked import is waiting for is a catalogue, whichever
control seated it.

### Adding a skill from GitHub

The add-skill dialog fetches the federated skill index from the worker **once per session** — a fresh
index is the current whole picture — and filters it in the browser, which is what removes the request
per keystroke and the rate limit the old repository search had to design around. A `stale` index says
so on screen and is asked for again on the next open.

Adding ends with two things:

1. **A category the user confirmed.** A native `<select>` per staged row, listing every category of
   the loaded catalogue in the grid's own order and labelled by its domain — `web · framework` —
   because a bare "Framework" appears in more than one domain and the two are different placements.
   Nothing is pre-chosen and nothing can be added without one. The id follows from the placement:
   `externalSkillId(categoryId, name)` mints `external-<category>-<name>`, joined with `-` because
   the id becomes a directory name once the CLI ejects it and has to be legal on Windows.
   `external` is a reserved marketplace name, so nothing published can collide with it.
   Two skills of one name in one category really are one id, and the dialog names the holder and
   refuses the second rather than letting the CLI write one over the other.
2. **The skill's whole directory.** `fetchSkillContents(repo, path)` lists the repository with one
   `git/trees/HEAD?recursive=1` call — an anonymous browser gets sixty API requests an hour, so
   walking a `reference/` directory a level per call would spend that budget on a single skill — and
   downloads the blobs from `raw.githubusercontent.com`, a CDN with no API rate limit that answers
   `access-control-allow-origin: *`, in parallel. Sizes come off the tree listing, so the per-skill
   cap is answered before a byte is downloaded.

   It is all-or-nothing in three places: one unreadable file fails the skill, a directory with no
   `SKILL.md` is refused, and a file that is not UTF-8 is refused by a `fatal: true` decoder rather
   than turned into replacement characters the CLI would write to somebody's disk. Staging is
   all-or-nothing too — adding only the ones that resolved would leave the grid showing a skill the
   payload cannot carry.

| Failure kind  | Meaning                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unreadable`  | GitHub does not serve this directory, or what is there is not a skill                                                                                                                                    |
| `too-large`   | Past `MAX_EXTERNAL_SKILL_BYTES` (256 KiB) by the listing made just now. Rarely seen: the search row already refused it on the index's `bytes`, so reaching this means the directory grew since the crawl |
| `not-text`    | A file in it is not UTF-8                                                                                                                                                                                |
| `unreachable` | GitHub did not answer                                                                                                                                                                                    |

`MAX_EXTERNAL_SKILL_BYTES` lives in `packages/matrix/src/seed.ts` and is checked **three** times,
each one a different question about the same number:

| Where                                                          | Reads                                  | What it is for                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The index row in the add-skill dialog                          | the index entry's own `bytes`          | The first place a visitor meets the cap. The row is marked and cannot be staged, so nobody spends search, stage, categorise and confirm on a row that was never addable          |
| `fetchSkillContents`, at confirm (`lib/api/skill-contents.ts`) | `treeBytes` over the listing made now  | **The authority.** The index's weight is a snapshot of a repository that may have grown since, so a skill arriving here unmarked is still refused on what the listing says today |
| `seedSkillTreeSchema` (`packages/matrix/src/seed.ts`)          | `treeBytes` over the payload's own map | Makes the cap a property of the payload rather than of one client — the CLI's `--from` reads the same schema                                                                     |

The first two are **one question asked twice, never two questions**: `isPastCarryLimit(bytes)` and
`carryLimitRefusal(bytes)` are exported from `skill-contents.ts` and the dialog imports both, so the
predicate and the phrase are each written once. A row marked addable and then refused below would be
worse than no mark at all, and sharing the definition is what makes that unreachable rather than
merely unlikely.

The dialog can ask at all because the index carries the weight. `skillIndexEntrySchema`
(`packages/matrix/src/skill-index.ts`) has a required `bytes` — the sum of the blob sizes GitHub
already reported in the tree listing the crawl had in hand, so it costs no extra request. Required
rather than optional, which retires the published index: the KV key moved to `skill-index:v2`, the
mechanism that file's own header names for a shape change. Five of the indexed skills are past the
cap — `canvas-design` at 5.4 MB, and `docx`, `xlsx` and `pptx` around 1.1 MB each — and every one of
them used to be refused at the end of the funnel.

### Content travels inline

`SEED_VERSION` is **5**, and v5 is what made the payload carry content. Every other id in a payload
is resolved by the receiver against a catalogue it already has; a skill added from outside answers to
no catalogue, so its whole directory travels in the `external` map keyed by the same id `skills`
uses. That is what makes a shared id self-contained: `--from` reaches into no third-party repository
at install time, so a repo that has since moved, gone private or changed cannot make a link install
something else, and two people installing one id get identical bytes.

Only the skills the selection names travel. Content is the expensive part of a payload — a directory
is tens of KB against the whole selection's ~2 KB — so an added skill nobody picked has no more
business in one than a deselected skill's remembered setup does. `external` is absent rather than
empty for a catalogue-only selection, so those payloads look exactly as they did before content
travelled at all.

### Reading what a link is about to install

`SkillContentsDialog` shows an added skill's `SKILL.md` beside its file tree, reached from the
`added` tag on the cell and from the skill's name in the install inventory. Both ways in open it
**over** whatever is already there, which is why it is a sibling of the other dialogs and why
`previewSkillId` is its own field.

It is a pure rendering surface — the bytes are seated before anything renders, whether the skill was
added this session or arrived in a payload — so there is no fetch, no state of its own and no schema
to extend. `toSkillContents` puts `SKILL.md` first and the rest by path, said as an order rather than
as a second "which one opens" field so the list and the opening file cannot disagree.

**The content is untrusted third-party text and is rendered as text**: a `<pre>` holding one JSX
expression, which React escapes. No markdown renderer, no sanitiser to configure and get wrong, and
no `dangerouslySetInnerHTML` anywhere on this path. That is the better answer twice over — a renderer
would be a new dependency whose escaping is the only thing between a stranger's repository and this
origin, and it would also hide things: a rendered `[text](javascript:…)` shows its label and not its
target, and rendered frontmatter disappears into a rule. What the CLI will write to disk is exactly
what is on screen.

### Eject-only

`isEjectOnly(skillId)` is true for exactly the skills the seat holds content for. A plugin install
serves the third party's content as-is and we cannot write our generated metadata into their
repository, so a skill from outside the catalogue can never be grid-native in plugin form; ejecting
is the only mode that lets the intake attach the confirmed category. It is a property of the skill
rather than a default — there is no convert-to-plugin path.

It is enforced twice and neither half is a fallback: the options panel cannot express `plugin` for
such a skill (the segment is `disabled`, and the cell's install badge is a `<span>` rather than a
button), and `setSkillOption` rewrites `plugin` to `eject` if anything else ever tries.

That `<span>` still stops the press. Without it the click reaches the cell underneath and toggles
selection, which would make one target on screen mean two different things depending on the kind of
skill under it — a badge that says it cannot flip must not select either.

---

## 6. Component tree

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
| `alert-dialog.tsx`   | Confirm shell (stack switch, marketplace switch)                                |

Every component ships a `.stories.tsx` beside it, and the stories are the tests — see §11 and
`packages/ui/CLAUDE.md`.

### `apps/editor`

| File                                | Renders                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/router.tsx`                 | `/`, `/docs`, `/settings`; search validation and `stripSearchParams` on `/`                                                                                                |
| `routes/search.ts`                  | The Configure screen's URL schema                                                                                                                                          |
| `routes/route-components.tsx`       | 3-column grid shell (`9.5rem` / `minmax(43.75rem, 1fr)` / `18.75rem`), and the Docs / Settings placeholders                                                                |
| `components/nav-rail.tsx`           | Logo, words-only nav (Configure · Docs · Settings), GitHub mark                                                                                                            |
| `components/skill-icon.tsx`         | 26px logo slot: brand mark in `currentColor`, else monogram                                                                                                                |
| `components/error-boundary.tsx`     | The app's one class component: a reload affordance and a `reportError`, instead of a white page                                                                            |
| `.../configure-screen.tsx`          | The opening's notice line, hinges, stack grid, filter bar, domain sections, the roster, the marketplace button and every dialog                                            |
| `.../stack-grid.tsx`                | 4-across stack lattice: Start from scratch, the saved snapshot when there is one, then the catalogue's stacks                                                              |
| `.../filter-bar.tsx`                | Sticky/stuck bar + search + domain chips + `Selected` + `＋ Add skill`                                                                                                     |
| `.../domain-section.tsx`            | Sticky domain title + category groups + skill lattice                                                                                                                      |
| `.../skill-cell.tsx`                | The core cell                                                                                                                                                              |
| `.../skill-options-panel.tsx`       | The `•••` popover: install mode, install scope, the sub-agent matrix, the source-code link                                                                                 |
| `.../roster-panel.tsx`              | Domain accordions (stacking sticky bands), agent rows with model · effort · scope, per-agent skill rows with load words and the where-used tooltip, Save + Share + Install |
| `.../install-dialog.tsx`            | Inventory panes split by scope + numbered steps + the `--from` command                                                                                                     |
| `.../add-skill-dialog.tsx`          | Staged tray with a category per row, index search, result lattice                                                                                                          |
| `.../skill-contents-dialog.tsx`     | An added skill's `SKILL.md` and file tree, as plain text                                                                                                                   |
| `.../marketplace-dialog.tsx`        | `MarketplaceButton`, `MarketplaceSwitcher` and the load form                                                                                                               |
| `.../marketplace-switch-dialog.tsx` | Reads the target catalogue, names what the switch drops, performs it on the action                                                                                         |
| `.../stack-switch-dialog.tsx`       | Confirm discard                                                                                                                                                            |
| `lib/api/configs.ts`                | Share links: store a seed payload, read one back                                                                                                                           |
| `lib/api/skill-index.ts`            | The federated skill index the add-skill dialog filters                                                                                                                     |
| `lib/api/catalog.ts`                | A marketplace's `catalog.json`, browser-direct                                                                                                                             |
| `lib/api/skill-contents.ts`         | An added skill's directory, browser-direct                                                                                                                                 |
| `lib/analytics/*`                   | `events.ts` is the whole event union; `track.ts` is a sink nothing vendor-specific reaches; `posthog.ts` installs one                                                      |
| `lib/observability/*`               | `report.ts` is the same shape for failures the user cannot see; `sentry.ts` installs the sink                                                                              |
| `lib/skill-icons.ts`                | The generated slug → `simple-icons` path map, refreshed by `scripts/generate-skill-icons.mjs`                                                                              |
| `env.schema.ts` / `env.ts`          | The environment, parsed by the build as well as by the bundle, so a missing variable fails CI                                                                              |

Analytics and reporting are sinks rather than imports on purpose: a store or a component emits
without its unit tests loading an SDK, and without the E2E suite posting to a real project. Nothing
in `AnalyticsEvent` may carry free text the user typed — the one field that could, the search box, is
reduced to a result count.

---

## 7. Sizing and where logic lives

**Every dimension is `rem`, and `:root { font-size }` in `globals.css` is the single knob that scales
the whole design.** It is currently `110%` — the design's native size, 10% larger. The type scale,
the arbitrary metrics and Tailwind's own spacing utilities all resolve against it, so nothing scales
independently. A percentage rather than a px value, so it compounds with the reader's own browser
font-size preference instead of overriding it.

Two things stay in `px` on purpose:

- **Borders and the 1px lattice hairlines.** At 1.1px they render as blurry sub-pixel lines, and the
  collapsed grid is the entire visual language.
- **Viewport units**, so the sticky rails stay exactly one screen tall.

This is also why the app is not simply CSS `zoom`, which would scale both.

`--spacing-gutter: 3.75rem` — 60px at the design's native size — is the page's structural constant:
main-column padding, the air above and below every divider, and the roster's top padding. Exposing it
as a token is what lets `-mx-gutter` bleed a rule out to touch both vertical dividers.

### Where logic lives

Four layers, in order of preference. Nothing that could sit lower sits higher.

| Layer              | Holds                                                             | Files                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pure functions** | Every derivation and transform. No React, independently testable. | `features/configure/lib/{derive,seed,default-assignments,marketplace-switch}.ts`, `stores/persisted-schema.ts`, the parsers in `lib/api/*`, `readSavedMarketplaces`, `migrateSavedMarketplaces`, `readSavedStack`, `withoutWrites` |
| **Stores**         | Shared mutable state and the actions that write it.               | `catalog-store` · `config-store` · `ui-store` · `marketplace-store` · `saved-stack-store`                                                                                                                                          |
| **Hooks**          | Reusable _behaviour_ — the only thing hooks are for here.         | `lib/use-pinned.ts` · `lib/use-catalog-first.ts` · `lib/use-share-link.ts` · `lib/use-install-command.ts` · `lib/use-apply-stack-request.ts`                                                                                       |
| **Components**     | Composition and event wiring only.                                | everything in `features/configure/components/`                                                                                                                                                                                     |

Five component files hold a `useEffect`, and each one is genuinely local: the add-skill dialog
(fetching the index, and settling the search before the analytics event), the install dialog (the one
event that marks the end of the funnel), the roster panel (a scroll dismisses the where-used tooltip,
since its position was measured against a scroll state that no longer holds), the skill cell
(outside-press and Escape dismissal), and the marketplace switch dialog, whose effect is behind the
file's own `useTargetCatalog` — the one fetch a confirmation has to make before it can describe
itself. The filter bar's own effect lives in `useBarStuckAttribute`.

`use-apply-stack-request.ts` is the single site where a `StackRequest` becomes a dispatch: the grid
applies directly when there is nothing to lose, the dialog applies once the switch is confirmed, and
those are two routes to one dispatch rather than two dispatches.

**Styling variants live in `packages/ui` as exported CVAs**, never re-typed at a call site. Where a
call site needs the look but not the semantics — the add-skill stage marker sits inside an
already-clickable row, so it must not nest a button — it consumes `chipVariants` directly rather than
duplicating the class list. Same for `matrixCellVariants`, which the options panel's ragged sub-agent
list reuses so the tri-state colours cannot drift from the matrix above them.

---

## 8. Sticky behaviour

The **page** scrolls, not the middle column: both side columns are `sticky top-0 h-svh`, which is
what makes their dividers read as continuous. `items-start` on the grid is what allows that.

`use-pinned.ts` reports whether a sticky element is _currently_ pinned — CSS has no selector for it.
It ships two forms, and which one to use is a performance decision, not a style one:

- **`usePinned`** returns React state. Only for elements whose own markup changes — the filter bar.
- **`usePinnedAttribute`** writes `data-pinned` straight to the DOM and never renders. For the domain
  headers, whose pinned state only drives a border but which each own a grid of skill cells.

The filter bar publishes its own state to a `data-bar-stuck` attribute on the document root
(`useBarStuckAttribute`), and the headers re-pin beneath it — `top: 5.4375rem` → `top: 3.1875rem`,
which is 87px → 51px at a 16px base — in pure CSS.

**None of this may live in a store.** A shared `stuck` field puts every subscriber into the render
path for a value only a `top` offset and a border depend on. Measured with the full catalogue on
screen: an **88ms blocking task** at 240 cells (39ms at 97, none at 18), which is what made the sticky
transition read as a jump rather than an ease. Attribute-driven, it is 0ms and 60fps at every cell
count.

**The stuck state must not change the bar's height.** The design collapses a 60px top padding when the
bar sticks, which removes 78px of document height at the exact moment it pins; the browser's scroll
anchoring then compensates by moving the scroll position, un-pinning the bar and restoring the
padding — a measured oscillation (`scrollY` jumped 590 → 511). The 60px of air above the bar therefore
comes from the preceding hinge's bottom margin, only horizontal padding changes, and the border is
made transparent rather than removed. Geometry is identical; the feedback loop is gone. The gap
between the field and `＋ Add skill` is held constant for the same reason.

**Stuck goes dark (84a).** Only the colour bleeds: the wrapper takes `#242320` full width while its
contents keep the 60px gutters, so search still starts on the content edge and `＋ Add skill` still
ends on it, and the dark/white seam is what separates the bar from the domain header pinning beneath
it. Every control on the band inverts with it — the search field loses its box, the chips lose their
borders and lift on a translucent white wash (amber on `rgba(176,118,44,.22)` when chosen), and
add-skill drops its fill for a `#55524a` hairline, leaving it the only bordered thing on the band.

The inverted styling lives **inside** the primitives (`Input`, `Chip`, `Button`), never in the bar:
§2's rule is that the app must not restyle a primitive locally. It arrives as an `onDark` variant the
bar passes, named for the surface rather than for the bar's own state — the primitive has no business
knowing what "stuck" means, and a prop cannot leak onto the chips and inputs inside the dialogs the
way a root-attribute selector could.

**Sticking moves focus nowhere.** Focus can cause the scroll: a Tab to a control below the fold
scrolls it into view, so a bar that took the caret as it pinned would throw a keyboard user back to
the top of the page by the act of moving down it. The horizontal padding and the background are the
**only** animations in the design.

---

## 9. Resolved decisions

Where the catalog and the design disagree, the catalog wins — the design was drawn against a smaller
snapshot of it.

| #   | Question               | Decision                                                                                                                                                        |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Domain set**         | Render all catalog domains as sections; chip only the five the design shows (`web` · `api` · `ai` · `infra` · `shared`).                                        |
| 2   | **Sub-agent taxonomy** | Real agents from the catalog — 18 across five groups, ragged — not the design's clean 4 × 4 of 16.                                                              |
| 3   | **Domain hierarchy**   | Ship `hierarchy: b` — 25px Inter title + amber `skills` suffix. The README prose describes the base rule; the prototype's default and every screenshot are `b`. |
| 4   | **Skill logos**        | Render the real mark where one exists, in `currentColor`; monogram otherwise.                                                                                   |
| 5   | **Domain colours**     | **Removed.** v5 has one accent; nine coloured dots would break rule 4.                                                                                          |

### Incompatibility

**The rule lives in `packages/matrix/src/read-model/selection-semantics.ts`, implemented once and
shared with the CLI's wizard.** It is reached through the seat as `judgeActiveSelection`, so a loaded
marketplace's skills are judged by that marketplace's own relationships. Verdicts are structured
rather than worded — the module decides _that_ a skill is out of reach and _why_, and each surface
renders the why in its own words. `derive.ts` is the editor's view layer over it:
`incompatibleReasonOf` turns an `IncompatibilityCause` into the sentence the cell carries.

| Verdict        | The grid draws                                                                       |
| -------------- | ------------------------------------------------------------------------------------ |
| `normal`       | An ordinary cell.                                                                    |
| `discouraged`  | A soft warning on `SkillCellView.discouragedReason`. The choice stays open.          |
| `incompatible` | 40% dim (`opacity-40`) plus `aria-disabled` and the reason on `title`. Never hidden. |

Where the verdict comes from matters, because the obvious source is wrong:

| Field           | Role                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conflictsWith` | Real but narrow — it never leaves its own category, so React lists only Vue/Angular/Solid/Svelte and cannot express React ↔ SvelteKit at all. Declared on either side; the semantics build the symmetric view once.                          |
| `requires`      | **The real source.** Authored per skill with a reason — "SvelteKit is built on Svelte", "Pinia is Vue only".                                                                                                                                 |
| `discourages`   | The soft half, with an authored reason. The mechanism is complete end to end; **the shipped catalogue declares zero pairs today**, which `derive.contract.test.ts` guards with an `it.fails` so it cannot go quietly green on an empty list. |

The rule runs in both directions, and needs both:

- **Forward** — a skill whose requirements can no longer be met goes with them:
  `SvelteKit → requires Svelte → conflicts with React`. Transitive (Pinia needs Vue _or_ Nuxt; Nuxt
  needs Vue; Vue is gone), so it runs to a fixpoint rather than one hop.
- **Backward** — what the selection implies counts as selected. Choosing Next.js is choosing React
  whether or not React was clicked, so Angular, Vue, Svelte and SolidJS all go, even though Next.js
  names none of them. Only unambiguous groups propagate: "needs Vue _or_ Nuxt" cannot name which, so
  it implies neither.

Two exemptions keep it from trapping the user:

- **A selected skill is never disabled.** Clicking it off is the way out of a bad combination.
- **An exclusive sibling is re-judged against the selection a click would produce.** The swap drops
  every same-category member — selected or implied — and the strandings are recomputed from what
  survives, so a conflict the swap resolves is forgiven and an impossibility it leaves standing keeps
  its reason. A sibling whose own `requires` is unsatisfiable is therefore still disabled, and so is
  one conflicting with a merely **implied** skill, because clicking it would not evict what implied
  it.

Picking React puts 13 skills out of reach — 4 by direct conflict, 9 through a requirement that can no
longer be met — and the grid draws 9 of them disabled: the four framework siblings stay live, because
picking one swaps rather than adds.

The cell keeps pointer events (it is `interactive={false}` + guarded handlers rather than
`pointer-events-none`) so the reason can still be read on hover; `title` carries it, which is also the
accessible description. A click on a dimmed cell emits `skill_blocked` — the one direct measurement of
whether the dim reads as "unavailable" or as "broken", and it has to be emitted from the cell because
the whole point is that the store is never reached.

---

## 10. Adaptations — where the implementation departs from the design files

Each of these is a place the design could not be followed literally, with the reason.

| Area                                 | Design                                                                                                                                        | Built                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sub-agent matrix**                 | dev · pm · rev · test over Web/API/AI/CLI/Infra, `Meta ＋` folded beneath                                                                     | dev · test over Web/API/AI/CLI, with the Meta fold holding all six meta-group agents                                    | The grid draws the roles that have a per-domain agent, and only two do. The consolidated `pm` and `reviewer` are one agent each for every domain, so they have no domain row to sit on and are hand-assignable through the Meta fold instead; the four researchers still take skills from a stack and from auto-assignment and still appear in the roster, but have no column yet. Meta expands to its six agents — the design draws the row but leaves it static.                                                                                                                                                                                                                                                                                              |
| **Matrix gap cells**                 | A plain field; slots with no agent look identical to unassigned ones                                                                          | The same, but inert — no pointer cursor, no click. With the current roster every row is full.                           | Fidelity to `04-skill-panel.png`, which shows uniform cells. Marking them invents a distinction the design does not draw, so `MatrixRow.cells` carries `null` and the grid dresses the gap with the same variants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Incompatible cell**                | `.skc.dis{opacity:.4}` — dimmed, and nothing else                                                                                             | The same 40% dim, plus `aria-disabled` and a reason on `title`                                                          | The dimming matches the design exactly. What the design has no answer for is _why_ a cell is out, and that a mouse-only signal leaves the state unreadable to anything else.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Roster footer**                    | A single Install button carrying the counts                                                                                                   | Save, then Share, then Install                                                                                          | Save snapshots the selection into the stack grid; Share is a shipped Cloudflare KV round trip. Both are disabled with nothing selected, and Save's label never moves — the grid cell appearing is the feedback, and a button that renames itself cannot be clicked twice in a row.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Where-used count/tooltip**         | Prototype counts every row of an installed agent — a switched-off row still appears in other rows' counts and lists (`offs` only recesses it) | Only enabled rows on on-agents count (`liveUsesBySkill`)                                                                | The number answers "where else will this actually install"; counting a switched-off copy would contradict the install inventory and summary, which skip it too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Controls on the agent row**        | Model word cycling `sonnet · opus · haiku`; a **3**-square effort meter cycling `med · low · high`                                            | Model word cycling `opus · fable · sonnet · haiku`; a **5**-square meter; and a third control, the scope word           | The design's scales are placeholders; these are the CLI contract's (`packages/matrix/src/seed.ts`), and the real scale wins. Five levels means five squares — a 3-square meter cannot draw `xhigh` apart from `max`. Scope is a control the design has no equivalent for at all: the CLI has always written an agent somewhere, and until the web offered the choice `--from` wrote `project` for everyone. None of the three has an off state: cycling back to the resting value clears the choice rather than storing it.                                                                                                                                                                                                                                     |
| **All three sit beside the pin**     | The agent's name row is one click target, with the controls inside it                                                                         | All three are **siblings** of the pin button, not children                                                              | Nested, they would swallow the click that pins and bury their own values inside the pin's accessible name (`developer` would read as `developer opus effort…`). As siblings each is its own control with its own name, and a click on one cannot reach the pin at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Info affordance on Install scope** | A hinted glyph beside the section label (89a), tip opening right of the glyph (90j)                                                           | A real `<button aria-label="About install scope">`; the tip opens right of the **panel**, mirrored when the panel flips | A hinted span is pointer-only; a button is what makes the explanation reachable by keyboard, and the same accessible name serves both. The tip is positioned off the panel rather than the glyph for the same reason the panel itself flips in the last column — anchored to the glyph it would open over the panel's own controls. Revealed on `:focus` rather than `:focus-visible`, so asking for it with the keyboard works whether or not the browser decides a focus ring is warranted.                                                                                                                                                                                                                                                                   |
| **Quiet at rest (87a)**              | `pre` / `lazy` and the where-used count fade in while the pointer is over the agent block                                                     | The same, plus focus anywhere inside the block                                                                          | Keyboard equivalence: the load word is a real button, so it can be tabbed to — and without the focus half it would be reached while still invisible. Opacity, not display, so revealing one cannot reflow the rows beneath it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **`•••` on an unselected skill**     | Panel opens                                                                                                                                   | Panel opens, and the skill stays unselected                                                                             | As the design has it. Configuring is not choosing: the `•••` and both badges never select. What they set on an unselected skill goes to `remembered` — the same place a deselected skill's setup goes — so it survives and `select` restores it verbatim. The panel shows `entry ?? remembered ?? freshEntry`, the same three fallbacks the store writes through, so it can never display one thing and save another.                                                                                                                                                                                                                                                                                                                                           |
| **Agent count opens on hover**       | "Hover/click"                                                                                                                                 | Neither: the count is a label                                                                                           | A hover-opened panel containing interactive controls is hostile to reach, and two ways into one popover is one more than the cell needs. The `•••` is the only way in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Panel dismissal**                  | Click `•••` again                                                                                                                             | Also outside press and Escape                                                                                           | The design does not say, and a popover with no escape hatch is a trap. `pointerdown` rather than `click`, so the panel is gone before the press resolves.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Panel overflow**                   | Always opens to the right                                                                                                                     | Flips left in the last column                                                                                           | At `left: calc(100% + 5px)` a last-column panel escapes the main column.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Source code link**                 | Nothing — the panel is entirely about installing                                                                                              | A `Source code ↗` link at the panel's foot, opening the skill's own directory in a new tab                              | A skill is somebody else's repository, and the panel described everything about installing one and nothing about where it comes from. Both kinds already carry the address — the catalogue is generated from the marketplace repo, and an added skill arrived through the index carrying its own — so neither needs a fallback. A catalogue skill resolves to the SEATED marketplace's `src/skills/<id>`, at the `#ref` it was fetched at where one was named and `HEAD` otherwise; an added skill's own repo and directory at `HEAD`. Seated rather than chosen, because the grid draws the seated catalogue: naming the public repository whatever is loaded would 404 every source link on a custom marketplace, whose skills that repository does not hold. |
| **Where an added skill lands**       | "lands in Uncategorized" — never mocked                                                                                                       | A category the user picks at add time, from the loaded catalogue's own list                                             | A placement is a decision, and one guessed from a repository name is a multi-tier fallback dressed as a feature. With a real category the skill renders under a real domain, answers the domain chip, gets a sub-agent reach from the shared resolver and is judged by the same semantics as its neighbours — none of which an orphan section can offer.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Contents of an added skill**       | Nothing — the design predates content travelling at all                                                                                       | A dialog showing `SKILL.md` and the file tree, reached from the `added` tag and from the install inventory              | A shared id carries a third party's files and the CLI writes them to disk, so someone opening a colleague's link is about to put a stranger's content on their machine. Being able to read it first is what makes carrying it acceptable, which makes this a requirement of inline content rather than a nicety. It opens over the install dialog rather than replacing it, so the question can be asked without losing the list that prompted it.                                                                                                                                                                                                                                                                                                              |
| **Which catalogue is loaded**        | Nothing — one implicit catalogue                                                                                                              | A Marketplace button sticky to the foot of the skills column, naming the seated catalogue, with a switcher beside it    | Which catalogue is loaded is a statement about everything in the column rather than about any one part of it, so it floats over the whole of it. Sticky rather than fixed to the viewport: the nav rail owns the viewport's bottom-left corner and the page grid centres itself past its max width, so an offset that clears the rail on one monitor lands on it on the next. It is the only place that answers the question at all, and the switcher answers it beside the button rather than behind a dialog.                                                                                                                                                                                                                                                 |
| **Cell lattice**                     | Border + white background on the _grid container_                                                                                             | Border + background on each **cell**, pulled back 1px so shared edges coincide                                          | Equivalent only while every row is full. The mock never shows a partial row; ours do constantly, and there the container approach paints white across the empty columns and runs a rule out past the last cell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Domain header pin offset**         | `--pin` measured from the bar's current height on every scroll                                                                                | Two static offsets in CSS, driven by `data-bar-stuck` on the root                                                       | The bar's height is fixed in both states by design (see §8), so there is nothing left to measure — and measuring it would put a layout read on the scroll path the attribute exists to keep off it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Domain chips**                     | Static markup, no behaviour                                                                                                                   | Toggle filter; active chip clears                                                                                       | Chips are hardcoded in the prototype; the README lists filter behaviour as a gap to fill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Skill descriptions**               | ~25 chars describing the _library_                                                                                                            | The catalog's skill description                                                                                         | The catalog describes the skill, not the library. Needs new upstream data, not a UI change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## 11. Testing

Two layers, split by what each is good at.

| Layer                                   | Covers                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Unit** (`vitest`, 321 in 14 files)    | Pure logic: derivations, the seed round trip, the persisted-schema boundary, the store actions, the API clients' parsing |
| **E2E** (`playwright`, 289 in 23 files) | Behaviour through a real browser: wiring, interaction, layout, persistence, both openings                                |

The split is not "units are better", it is **where a case is reachable**. Three things make a case
belong in a unit test:

- **The input space is combinatorial.** `isStackCustom` has six independent ways to flip and
  `selectDomainViews` crosses four filters with two provenances of skill. Each case is one browser
  round-trip end-to-end and microseconds in-process.
- **The path is a boundary against untrusted or legacy data.** `migrateConfig`, `pruneUnknownIds`,
  `readSavedMarketplaces`, `migrateSavedMarketplaces` and `readSavedStack` read whatever localStorage
  happens to hold. This is the only place in the app where a bug is _silent_ — a broken migration
  does not throw, it quietly returns a configuration missing someone's afternoon of work.
- **Failure needs localising.** An E2E failure says the roster shows the wrong count; a unit failure
  says `summarize` counted an assignment where it should have counted an agent.

Everything else belongs in the browser, where a jsdom approximation would only be a weaker version of
the same assertion. `packages/vitest-config` ships a node preset for that reason: nothing under unit
test needs a DOM.

**The unit suite never reaches the network.** `vitest.setup.ts` starts `@workspace/api-mocks`'s MSW
server for every file, not only the ones that call the worker, with `onUnhandledRequest: "error"` —
which is what makes it a guarantee rather than a habit. The Playwright specs take their payloads from
the same package's `./fixtures` entry and do their own interception with `page.route`, so the two
suites cannot disagree about what the worker answers.

**One test file is a contract runner.** `features/configure/lib/derive.contract.test.ts` holds
`derive.ts` to `SELECTION_SCENARIOS` from `@workspace/matrix`; a second runner on the CLI side reads
the same scenarios through the wizard's grid. A scenario going red means one surface stopped
rendering what the shared semantics answered. Its `soft conflicts` block is the suite's one
`it.fails`, and it is deliberate — see §9.

**`e2e/specs/catalog.spec.ts` guards the fixtures.** The catalogue is regenerated from the CLI, so
the skills and stacks the specs pin to will drift; that spec asserts each one still exists, so drift
shows up as one obvious failure naming the value that moved rather than half the suite going red.
Locators live in `e2e/pages/` and never in a spec, and every assertion goes through the accessibility
tree — none of them can pass while the component is unusable with a screen reader.

---

## 12. Deferred

| Item                    | State                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Code splitting          | One large chunk: `vite.config.ts` sets no `manualChunks`, and the catalog dominates the second.         |
| GitHub proxy            | `apps/server` proxies nothing GitHub-side; the catalogue and skill contents are fetched browser-direct. |
| Docs / Settings         | Route + centred heading only. There is no Share destination — sharing lives in the roster footer.       |
| Empty / loading / error | Only the filter's no-match line, the dialogs' status lines and the opening's notice exist. Undesigned.  |
| Responsive              | Hard `min-w-[85.25rem]` on the grid shell; below it the page scrolls horizontally. Undesigned.          |
| Dark mode               | Undesigned. `globals.css` declares the `dark` variant but defines no palette for it.                    |
