> **HISTORICAL DESIGN NOTE** — This was the pre-implementation plan for what shipped as
> `apps/editor`. It moved here from `docs/cli/` on 2026-08-06 because it is editor material.
> The flow it describes has drifted from what was built: `cc init --seed <id>` shipped as
> `agents-inc init --from <id>`, selections persist through the config store rather than raw
> localStorage, and sharing goes through the config-store worker (`apps/server`). Read it as
> design history, not as behaviour.

# Skills Explorer — Web UI Implementation Plan

## Overview

A public web app that visualizes the entire skills catalog. Users select a sub-agent, then assign skills to it from a periodic-table-style grid. Selections persist to localStorage and produce a `cc init --seed <id>` command.

No login. No backend (MVP). No scoring/ratings (yet).

---

## Stack

- **Next.js** (SSR for SEO, React for interactivity)
- **Tailwind CSS** (fast grid styling, domain color-coding)
- **Zustand** (store with localStorage persistence)
- **`@agents-inc/matrix-utils`** (shared constraint logic package)

Deployed as static site (Vercel or Cloudflare Pages).

---

## Data Pipeline

### Matrix JSON export

The CLI repo's `BUILT_IN_MATRIX` (generated TypeScript in `src/cli/types/generated/matrix.ts`) is the source of truth. A new script in the CLI repo exports it as JSON:

```ts
// scripts/export-matrix.ts
import { BUILT_IN_MATRIX } from "./src/cli/types/generated/matrix"
import { writeFileSync } from "fs"

writeFileSync("dist/matrix.json", JSON.stringify(BUILT_IN_MATRIX, null, 2))
```

Run via `bun run export:matrix`. The JSON file is a standalone artifact — usable by the web explorer, graph visualization projects, or anything else that needs the full skills catalog.

### Web app consumption

At build time, the web app fetches `matrix.json` via raw GitHub URL (or a published artifact). The matrix contains everything needed: categories (with domain, order, exclusive flags), skills (with id, slug, displayName, category, compatibleWith, conflictsWith, requires, alternatives), stacks (with per-agent skill assignments), agent names, and the slug map.

---

## Shared Package: `@agents-inc/matrix-utils`

The constraint logic currently in `src/cli/lib/matrix/matrix-resolver.ts` (~300 lines) gets extracted into a shared package. Functions become pure — they accept the matrix as a first parameter instead of importing a module-level singleton.

### Extracted functions

```ts
// All take (matrix, ...args) instead of relying on a singleton
computeAdvisoryState(matrix, skillId, currentSelections): OptionState
isIncompatible(matrix, skillId, currentSelections): boolean
isDiscouraged(matrix, skillId, currentSelections): boolean
isRecommended(matrix, skillId, currentSelections): boolean
getIncompatibleReason(matrix, skillId, currentSelections): string | undefined
getDiscourageReason(matrix, skillId, currentSelections): string | undefined
getRecommendReason(matrix, skillId, currentSelections): string | undefined
hasUnmetRequirements(matrix, skillId, currentSelections): boolean
getUnmetRequirementsReason(matrix, skillId, currentSelections): string | undefined
getDependentSkills(matrix, skillId, currentSelections): SkillId[]
getAvailableSkills(matrix, categoryId, currentSelections): SkillOption[]
validateSelection(matrix, selections): SelectionValidation
```

### Consumers

- **CLI repo**: imports from `@agents-inc/matrix-utils`, wraps with the singleton matrix (thin adapter in `matrix-resolver.ts` to preserve existing call sites)
- **Web explorer**: imports directly, passes the loaded matrix JSON
- **Future projects**: graph visualizations, CI validation, etc.

### Package structure

```
@agents-inc/matrix-utils/
  src/
    resolver.ts        # pure constraint functions
    types.ts           # MergedSkillsMatrix, SkillOption, OptionState, etc.
    validator.ts       # validateSelection, validateConflicts, etc.
  dist/                # built output
  package.json
```

Published to npm (or used as a workspace package if monorepo'd later).

---

## Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Header: Logo, seed command + [Copy], [Confirm]                         │
├──────────────────────────────────────────────────────────────────────────┤
│  Filters: [Domain ▼]  [Category ▼]  [Rating ▼ (future)]  [Search...]   │
├──────────┬───────────────────────────────────────────────────────────────┤
│          │                                                               │
│  STACKS  │  AGENTS (horizontal cards)                                    │
│          │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  ○ Next  │  │ app-agt  │ │ api-agt  │ │ test-agt │ │ docs-agt │        │
│  ○ API   │  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│  ○ Full  │                                                               │
│  ● Cust  │  ── select an agent above to assign skills ──                │
│          │                                                               │
│          │  SKILL GRID                                                   │
│          │                                                               │
│          │  WEB (color)         │ API (color)       │ INFRA  │ META     │
│          │  ┌──┐┌──┐┌──┐┌──┐  │ ┌──┐┌──┐┌──┐     │ ┌──┐   │ ┌──┐    │
│          │  │  ││  ││  ││  │  │ │  ││  ││  │     │ │  │   │ │  │    │
│          │  └──┘└──┘└──┘└──┘  │ └──┘└──┘└──┘     │ └──┘   │ └──┘    │
│          │  ┌──┐┌──┐┌──┐┌──┐  │ ┌──┐┌──┐         │        │         │
│          │  │  ││  ││  ││  │  │ │  ││  │         │        │         │
│          │  └──┘└──┘└──┘└──┘  │ └──┘└──┘         │        │         │
│          │                     │                   │        │         │
├──────────┴───────────────────────────────────────────────────────────────┤
│  Footer / legend                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key layout rules

- **Domains are columns**, flush against each other, each with a muted calming color
- **Skills are squares** — displayName centered, category name bottom-left in smaller text. Each square has a lightning bolt (preload) and eject icon toggle.
- **Categories within domains** are laid out flat but placed adjacent to each other, ordered by the category `order` field
- **Agents are horizontal cards** above the grid — user clicks one before assigning skills
- **Stacks are a text list** on the left — selecting a stack clears all selections and applies only the stack's defined assignments. Agents not in the stack get zero skills.
- **Filters sit above everything** — domain filter, category filter, search, future rating filter
- **Unassigned label** — skills not assigned to any agent show "unassigned" indicator

---

## Interaction Model

### Agent-first flow

1. User lands on page. Skills grid is visible but inert (visually muted). Prompt: "Select an agent to start assigning skills"
2. User clicks an agent card — it becomes active. Grid becomes interactive.
3. Clicking a skill square toggles it on/off for the active agent
4. Each skill square has a lightning bolt icon — clicking it toggles preload for that skill on the active agent
5. Each skill square has an eject icon — clicking it toggles eject mode (default: plugin mode)
6. Switching agents changes the grid state to reflect that agent's assignments
7. Skills assigned to zero agents show an "unassigned" label/badge

### Stack selection

- Clicking a stack clears all agent/skill assignments, then applies only the skills defined in that stack
- Agents not mentioned in the stack get zero skills
- Label switches to that stack name
- Any manual change after switches the label to "Custom"

### Constraint visualization (via `@agents-inc/matrix-utils`)

- **Incompatible** (`conflictsWith`): grayed out / disabled when a conflicting skill is selected
- **Discouraged** (`discourages`): shown with warning state, not disabled
- **Recommended** (`isRecommended`): highlighted with a subtle accent
- **Required dependencies** (`requires`): warning/tooltip when selected without prerequisites. Supports AND/OR logic (`needsAny`).
- **Exclusive categories** (`exclusive: true`): selecting one skill deselects others in that category
- **Compatibility filtering** (`compatibleWith`): selecting a framework dims/hides incompatible skills
- **Alternatives** (`alternatives`): informational — "or try X" hints

### Confirm flow

- A "Confirm" CTA generates the seed and shows the full command
- Seed is computed from current state (all agent assignments + preload + eject flags)
- Command: `cc init --seed <seed-string>`

---

## Zustand Store

```ts
type SkillAssignment = {
  assigned: boolean
  preloaded: boolean
  ejected: boolean // true = eject mode, false = plugin mode (default)
}

type ExplorerStore = {
  // Active UI state
  activeAgentName: AgentName | null
  activeStackId: string | null // null = "Custom"

  // Selections: agent -> skill -> assignment state
  agentSkills: Record<AgentName, Record<SkillId, SkillAssignment>>

  // Actions
  setActiveAgent: (agent: AgentName) => void
  toggleSkill: (skillId: SkillId) => void
  togglePreload: (skillId: SkillId) => void
  toggleEject: (skillId: SkillId) => void
  applyStack: (stackId: string) => void
  clearAll: () => void

  // Derived (or selectors)
  getUnassignedSkills: () => SkillId[]
  getSeed: () => string
}
```

Persisted to `localStorage` via Zustand's `persist` middleware.

---

## Seed Format

### MVP: Client-side base64

Encoded: `btoa(JSON.stringify(payload))` -> URL-safe base64. Long string (~200-500 chars) is acceptable for POC. Short IDs via KV store deferred.

The seed is a snapshot — if the matrix changes after generation, the old seed still contains the old data. No staleness concern for POC.

### Seed Payload

```ts
type SeedPayload = {
  v: 1
  agents: Record<
    AgentName,
    {
      skills: SkillId[]
      preloaded: SkillId[]
      ejected: SkillId[]
    }
  >
}
```

### CLI side: `cc init --seed <value>`

New flag on the `init` command:

1. Decode the base64 seed
2. Validate the payload against a Zod schema
3. Populate the wizard store with the decoded selections
4. Jump straight to the **confirm step** (showing selected skills + agents for review)
5. User confirms, then compilation/installation runs

---

## Marketplace Sources

### POC

- Agents Inc. marketplace only (hardcoded, loaded at build time)

### Future

- Pull-out drawer to add additional marketplace URLs
- Third-party marketplaces serve the same `matrix.json` schema
- Added marketplaces merge into the grid, skills tagged with source
- Marketplace list persisted to localStorage

---

## Repo Structure

Separate repo (e.g., `agents-inc/explorer`). Own CI/deployment pipeline.

Rebuild trigger: manual (Vercel deploy hook or similar).

---

## Decisions Log

| #   | Question                  | Answer                                                                                                                                                 |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Repo location             | Separate repo                                                                                                                                          |
| 2   | Agent list                | All 22 agents from `AGENT_NAMES` — pulled from generated types                                                                                         |
| 3   | Data source               | All data (skills, categories, domains, relationships, agents) pulled from generated types via `matrix.json` export                                     |
| 4   | Seed format               | Client-side base64 for MVP. Old seed = old data, no staleness concern.                                                                                 |
| 5   | Category grouping         | Flat within domain columns but categories placed next to each other                                                                                    |
| 6   | `cc init --seed` behavior | Jumps to confirm step (shows skills + agents for review)                                                                                               |
| 7   | Install mode              | Per-skill eject toggle on each square, defaults to plugin mode                                                                                         |
| 8   | Marketplaces              | Deferred from POC. Same `matrix.json` format. Pull-out drawer to add sources (future)                                                                  |
| 9   | Domain colors             | Muted, calming palette (implementer's choice)                                                                                                          |
| 10  | Skill square content      | displayName centered. Category name bottom-left, smaller font                                                                                          |
| 11  | Preload icon              | Lightning bolt                                                                                                                                         |
| 12  | Eject icon                | Eject symbol                                                                                                                                           |
| 13  | Mobile responsiveness     | Not a priority — desktop-only for MVP                                                                                                                  |
| 14  | Constraint filtering      | Same as CLI: selecting a skill dynamically applies states (recommended, discouraged, incompatible, etc.) via shared `@agents-inc/matrix-utils` package |
| 15  | Rebuild trigger           | Manual (Vercel deploy hook or similar)                                                                                                                 |
| 16  | SEO                       | SSR via Next.js — all content server-rendered                                                                                                          |
| 17  | URL sharing               | Deferred from POC                                                                                                                                      |
| 18  | Matrix JSON export        | `bun run export:matrix` in CLI repo — standalone JSON artifact for explorer, graph projects, etc.                                                      |
| 19  | Constraint logic          | Extracted to `@agents-inc/matrix-utils` shared package — pure functions, matrix as first param                                                         |
| 20  | Stack behavior            | Clears all selections, applies only the stack's defined assignments. Unmentioned agents get zero skills.                                               |
| 21  | Agent-domain highlighting | Deferred — agents and domains will eventually share color coding                                                                                       |

---

## POC Scope

**In scope:**

- Matrix JSON export script in CLI repo (`bun run export:matrix`)
- `@agents-inc/matrix-utils` shared package (pure constraint functions)
- Static site, SSR via Next.js, Tailwind, Zustand with localStorage
- Full skill grid with domain columns, color-coded, category-adjacent layout
- Skill squares: displayName (center), category (bottom-left, small), lightning bolt (preload), eject icon
- All 22 agents, horizontal cards above grid
- Agent-first flow (select agent, then assign skills)
- Stacks on the left, clear + override selections
- Constraint visualization via shared package (conflicts, requires, exclusive, compatibleWith, recommended, discouraged)
- Seed generation as base64, `cc init --seed` on CLI side jumping to confirm step
- Desktop-only layout
- Manual rebuild trigger
- Agents Inc. marketplace only (hardcoded)

**Deferred:**

- Additional marketplace sources (pull-out drawer)
- URL sharing (`?seed=`)
- Short seed IDs (KV store)
- Mobile responsiveness
- Rating/scoring filters
- Preload-all-agents toggle
- Agent-domain color-coded highlighting

---

## No Open Questions

All questions resolved. Ready to build.
