# CLI-389 — Relationship coverage for all 229 skills, research-driven and verified

**Owner directive (2026-08-06):** most skills have no `conflictsWith` populated, and most that do
are under-populated. Go over ALL skills and populate relationships correctly, with proper research
(Context7 + web search). "We want this to be useful and it's only useful if it's hundred percent
accurate."

**Where the data actually lives (verified 2026-08-06):** NOT in the marketplace — zero of the 231
`metadata.yaml` files carry any relationship field. The single source of truth is
`packages/cli/src/cli/lib/configuration/default-rules.ts` (759 lines, `SkillRulesConfig`):
slug-based conflict GROUPS with a required `reason`, plus the other relationship sections. That is
why this is a CLI row, and why it executes the upstream half of EDITOR-06 ("123 of 222 skills
state no relationships"). D-306 stays the umbrella for richer semantics; this item populates the
EXISTING vocabulary, and anything needing new semantics is recorded for D-306, not invented here.

## Why "100% accurate" needs structure, not just effort

An empty relationship list is ambiguous between "audited: genuinely conflicts with nothing" and
"nobody looked" — EDITOR-06's exact complaint. Without an audit marker, this pass's accuracy claim
is unfalsifiable a year later. So the deliverable is coverage + auditability, and every claim
must survive an adversarial check.

## Phase 0 — inventory (scriptable, cheap, no research)

From `BUILT_IN_MATRIX`'s resolved relationships: per skill — own conflicts? reaches a conflict via
`requires`? neither? Per category — exclusivity flag, member list. Refresh EDITOR-06's 80/19/123
numbers at 229. Output: a worksheet grouping the audit into category-sized batches.

## Decisions to settle with Vincent before the fan-out

0. **Storage: SETTLED (owner, 2026-08-06) — central rules file**, i.e. keep `default-rules.ts` as
   the single store rather than scattering per-skill metadata fields. Right on the merits, not
   just incumbent: conflicts are facts about groups, stated once and symmetric by construction;
   per-skill fields would encode every edge twice and drift asymmetrically. The audit manifest
   below is central for the same reason.
1. **The audit marker** (direction follows decision 0: a central manifest beside the rules) —
   per-skill: audited date + verdict `conflicts-declared | universal | see-category-exclusivity`,
   enforced by a check that every `SkillId` appears. Exact shape open; the point is that
   "empty = audited" must become expressible.
2. **The layer question: SETTLED (owner, 2026-08-06) — "use the exclusive category only for now;
   can make it more advanced at a later date if needed."** Conflict groups are REMOVED as a
   mechanism, not just deduplicated; category exclusivity (plus `requires` reachability re-keyed
   onto it) is the sole incompatibility layer. Consequences, staged:
   - **Phase B (before removal): disposition of the 10 non-redundant groups.** Enumerate them
     (Phase 0's worksheet has the raw data) and settle each: category restructure where the
     taxonomy fix is clean — `shared-monorepo` splits into an exclusive task-runner category
     `{nx, turborepo}` beside a composing workspaces one (skills-repo metadata + categories
     change); Elysia moves beside its api-framework partners so that group's fence becomes the
     category — or ACCEPTED LOSS recorded into D-306 as the "more advanced later" backlog (the
     Postgres-hosts cross-category group is the known case; the 8 subset-groups get per-group
     calls).
   - **Phase C (depends on EDITOR-11 step 2's shared closure, same dependency as the
     `compatibleWith` deletion — the two deletions ride together):** delete
     `relationships.conflicts` from `SkillRulesConfig`, the resolver's conflict resolution, the
     editor's conflict reads, the health-check refs; re-key out-of-reach as "requires a member of
     an exclusive category whose selected member differs"; update the EDITOR-11 golden scenarios
     whose expectations referenced conflict signals (they are data, adaptable by design). Reason
     text dies with the groups (owner assumed as much). **Proposal riding along unless objected:
     `discourages` (zero rules exist) is deleted in the same pass** — dead vocabulary under the
     red-border principle.
   - **The research fan-out re-scopes.** The audit's product is no longer conflict groups: per
     skill it becomes correct CATEGORY placement, correct exclusivity flags, and the missing
     `requires` bindings (EDITOR-06's 130). The audit-manifest verdicts become
     `constrained-via-exclusivity-or-requires | universal`.
   - The in-flight decision-3 slice lands as specified (its conflict-advisory assertions for
     nx+turborepo are knowingly interim — Phase B's category split supersedes them; the
     user-facing radio fix ships value now).
3. **The two known-wrong exclusivity flags: SETTLED (owner, 2026-08-06) — "these should not be
   exclusive."** Executed as its own tests-first slice ahead of the fan-out: `shared-monorepo`
   becomes non-exclusive; the `{turborepo, nx}` conflicts group ALREADY EXISTS
   (`default-rules.ts:67-70` — the tests-first pass corrected the plan's assumption that it
   needed adding), and the un-radio converts it from redundant-inside-an-exclusive-category to
   load-bearing — a live specimen of the decision-2 layer question. `api-email` becomes
   non-exclusive plainly (setup + usage are a pair). Conflict semantics stay advisory
   (`getIncompatibleReason` gray-out + `validateConflicts` error, no store-level blocking) — the
   contract the red tests pin. Phase 0 confirmed both flags against the data.
4. **`compatibleWith`: SETTLED (owner, 2026-08-06) — DELETE it, at the very end, and prove the
   deletion.** Product principle recorded with the decision: absence means compatible — the UI
   communicates incompatibility only (the red-border case), so a positive compatibility list is
   structurally redundant. One premise-correction surfaced before locking this in: the field is
   NOT fully unused — `matrix-resolver.ts` reads it as a whitelist (`isCompatibleWithSelections`:
   empty = universal, non-empty = only valid alongside a listed selection) feeding the
   `FILTER_INCOMPATIBLE` wizard behavior (feature-flagged off by default; CLI-335/336 gate its
   specs) and incompatibility labels; the health check and source loader carry it; the editor
   ignores it. Therefore the deletion is a three-step final phase:
   a. **Convert** — during population, any semantically load-bearing `compatibleWith` whitelist
   becomes a `requires` + `needsAny` declaration (the identical constraint via the
   reachability mechanism both CLI and editor share; also EDITOR-06's stated intent for
   framework-bound skills, and it removes one EDITOR-11 divergence). Phase 0 found all 39
   groups already have identical `requires` rules — zero new declarations. **HOWEVER (found
   by EDITOR-11's goldens, 2026-08-06): the deletion has a hard dependency — the CLI computes
   no requires-closure, and its multi-hop verdicts currently come out right only via
   `compatibleWith`. EDITOR-11 step 2 (the shared closure in `packages/matrix`) must land
   BEFORE this deletion, or the Astro/Expo-class verdicts regress in the CLI.**
   b. **Delete** — the field from `SkillRulesConfig`, the zod + JSON schemas, the resolver
   (`isCompatibleWithSelections` and label rendering re-keyed to the surviving mechanisms),
   health check, source-loader merge, search display, generated types, and the matrix
   package's vendored surface (one `generate:types` + `generate:matrix` round). The
   `FILTER_INCOMPATIBLE` flag's behavior re-keys to conflicts + requires-reachability; its two
   gated specs (CLI-335/336) get updated in the same pass.
   c. **Prove** — tests first for the removal where behavior changes; then grep-zero for
   `compatibleWith` across production, tests, generated output and `.ai-docs` reference (docs
   updated, not just code); full gates including the wizard e2e surfaces.

## Execution shape (after decisions)

- **Batch by domain/category** (~10–12 batches). Per batch, a researcher agent with Context7 +
  web search answers, for every pair the category structure makes interesting: can these coexist
  in one project as of 2026? Sources cited; every conflict group carries its `reason`.
- **Adversarial verification, both directions:** a second, independent agent per batch challenges
  every asserted conflict (find a documented coexistence) AND every asserted "universal" verdict
  for the batch's high-risk pairs. Nothing lands on one agent's word — the roster-reorg pipeline's
  refute-to-survive pattern.
- **Scripted consistency gates:** slug validity against the generated unions; symmetry (groups
  are inherently symmetric — but cross-checks against `requires`: a skill must never conflict
  with something it requires or transitively implies); no conflicts group wholly inside an
  exclusive category unless decision 2 says so.
- **Apply in batches** via cli-developer to `default-rules.ts` + the audit manifest; regen
  (`generate:types`, `generate:matrix`); matrix health checks; cli-tester runs the wizard/editor
  relationship e2e surfaces; the editor's derive semantics get this data too (EDITOR-11 makes the
  two implementations one, so land that first or in parallel batches carefully).
- **Acceptance:** every one of the 229 skills has an audit verdict; every conflict group has a
  cited reason; adversarial pass survived; all gates green; EDITOR-06's "cannot tell audited from
  unaudited" is structurally closed.

## Sequencing

Queued behind the current in-flight pipeline (D-239 docs, SKILLS-08 proof). Phase 0 runs first and
costs little; the fan-out starts once the decisions above are settled — they shape every batch.
Related: EDITOR-06 (closes its upstream half), D-306 (inherits anything needing new semantics),
EDITOR-11 (consumer unification), CLI-364 residuals (decision 3).

## Phase 0 refresh (2026-08-07)

Numbers recomputed and batches partitioned in
[`CLI-389-phase0-worksheet.md`](./CLI-389-phase0-worksheet.md) — the catalog is 237 (not 229),
coverage is 80/19/138 with 109 genuinely unconstrained, non-redundant groups are 11 (three are
one-line `exclusive: true` flips), and one **decision-2 blocker** was found that this plan never
saw: `api-database` is a single exclusive category with 16 members spanning SQL engines, ORMs,
KV stores and Mongo — it must be split (worksheet B6) before Phase C deletes the conflict layer,
or the removal enshrines a worse fence than it replaces. The worksheet corrects every stale
figure in this file; fan-out briefs quote it, not the sections above.
