---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/src/seed.ts
  - packages/cli/src/cli/lib/seed/config-to-seed.ts
  - packages/cli/src/cli/types/config.ts
  - packages/cli/.ai-docs/reference/features/seed-contract.md
standards_docs:
  - .ai-docs/reference/features/seed-contract.md
  - .ai-docs/reference/features/model-and-effort.md
date: 2026-08-16
reporting_agent: cli-tester
category: architecture
domain: shared
root_cause: scope-discipline-deferred
status: partial
partial_note: >-
  Three of the six items landed. The marketplace ref travels (payload `marketplace`, added in the
  v4 bump), locally-authored skills are decided on disk by `forkedFrom` rather than by the matrix,
  and content for a skill no catalogue can resolve travels inline (payload `external`, the v5
  bump). Still outstanding, both unchanged in mechanism: `model: "inherit"` has no wire spelling,
  and `config.agentsSource` has no wire field. The item-by-item status is below.
---

## What Was Wrong

`SeedPayload` was designed as the wire form of a **web selection**. `agents-inc share` asks it to
be the wire form of an **installed `ProjectConfig`**, and those are not the same object. Writing
the encoder made the difference enumerable for the first time, and it matters because `edit --ui`
states the rule "carry everything or refuse loudly" — a rule nobody could apply without this list.

The list below is per item, with the current state of each. The version it was written against was
v3; the schema is now v5 (`packages/matrix/src/seed.ts`, `SEED_VERSION`).

### 1. Which marketplace a plugin skill came from — CARRIED (v4)

`SkillConfig.origin` holds a marketplace name; `seedSkillSchema.install` holds only
`"plugin" | "eject"`. A payload silent about the marketplace has the receiver install the DEFAULT
marketplace's skill of the same id — different content, same name, nothing on either side saying
so.

The wire now carries `marketplace` on the payload envelope, one ref for the whole payload, because
an install reads one marketplace; absent still means the default public catalogue. What survives is
a **producer refusal, not a gap**: `readMarketplace` in `config-to-seed.ts` refuses by name any
skill whose `origin` is neither `eject` nor the default AND whose installation records no
`config.marketplace` to fetch that marketplace from. Half an address is refused rather than
guessed.

### 2. `model: "inherit"` — STILL OPEN

`MODEL_NAMES` (`src/cli/types/matrix.ts`) carries `"inherit"`; `seedModelSchema` is
`z.enum(["opus", "fable", "sonnet", "haiku"])`. `seed-contract.md` explains the omission as
_"absence of the key already means 'keep the metadata default'"_ — but per `resolveAgents`
(`model: agentConfig?.model ?? definition.model`) absence means "use the sub-agent's OWN metadata
model", while `"inherit"` overrides that metadata down to the parent model. The two differ for
every sub-agent whose `metadata.yaml` names a model, so the field is not redundant and the doc's
justification does not hold.

### 3. Where sub-agents come from — STILL OPEN

`config.agentsSource` (`src/cli/types/config.ts`) — a separate agents repository — has no field on
the wire. It remains unreachable from any writer, which is why `share` does not refuse on it. Named
so a future writer does not make it silently lossy.

### 4. Project identity and layout — deliberately not refused

`name`, `description`, `author`, `branding`, `skillsDir`, `agentsDir`, `stacksFile`,
`categoriesFile`, `rulesFile`. The receiver has its own; `init --from` derives `name` rather than
reading it. Not part of the selection a payload describes.

### 5. `projects[]` — deliberately not refused

The global config's registry of absolute machine paths. It must never travel, by the same rule that
keeps machine-specific paths out of tracked files.

### 6. Locally-authored skills — RESOLVED, by ruling and by code

The claim was that `share` cannot tell a user-authored skill from an ejected catalogue skill from
`ProjectConfig` alone — true — and therefore that no refusal is available. That conclusion does not
follow: the **filesystem** answers it without a matrix. `forkedFrom` decides ownership. The CLI
stamps it into every skill directory it writes; a skill written by hand into `.claude/skills/`
carries none.

`judgeSkill` in `src/cli/lib/seed/installation-payload.ts` asks exactly that, offline, per
eject-mode entry, and the round trip **leaves what it does not own alone** — a user-authored skill
is neither carried nor refused, because it was never in scope. `skillsAuthoredHere` exports the
same judgement to the receiving half, so `edit --from`'s destructive apply cannot read "the payload
said nothing about this skill" as an instruction to delete it. One definition, both halves.

The separate matter of a skill that answers to no catalogue but IS the round trip's — one a
previous `--from` carried in — is closed by v5's `external`, which carries the whole directory
inline. See
[`2026-08-17-carried-content-is-detectable-only-by-what-the-install-recorded.md`](./2026-08-17-carried-content-is-detectable-only-by-what-the-install-recorded.md).

## Fix Applied

`config-to-seed.ts` refuses by name what it cannot state, collecting every offender in one message
rather than failing on the first, and mirrors `seed-to-wizard.ts`'s own
`(project skill, global sub-agent)` refusal so a minted id is always one `init --from` can install.
Round-tripping is pinned by `config-to-seed.test.ts` (config → payload → decoder → same install)
and by `e2e/commands/share.e2e.test.ts`, which installs a payload, shares what it installed, and
installs the minted id into a second untouched directory before comparing both configs and both
disks.

Items 2 and 3 are documented here and not otherwise addressed. Item 1's remaining half is the
producer refusal described above, which is the intended end state rather than a gap. Item 6 is
closed by `installation-payload.ts`.

## Proposed Standard

1. **Correct the enum-alignment row in `.ai-docs/reference/features/seed-contract.md`**
   ("Enum alignment with the CLI's own unions"). `"inherit"`'s absence from the wire is a real gap,
   not a redundancy: absence and `"inherit"` resolve differently whenever the sub-agent's metadata
   names a model. `model-and-effort.md`'s precedence section already states the rule the current
   wording contradicts.

2. **Add a "What the contract cannot carry" section to `seed-contract.md`**, owning the list above.
   The doc currently describes the payload → config direction only; with an encoder in the tree it
   owns both, and the gap list is what a v-next decision will be made from.

3. **Make the rule explicit where the schema lives** (`packages/matrix/src/seed.ts` header): a
   payload is a _selection_, not a project. Anything a producer holds that the schema cannot state
   is refused by the producer, never dropped — otherwise a content-addressed id, which can never
   change under its own hash, permanently names a configuration nobody chose.

4. **v-next candidates, in the order they block leg 3:** `"inherit"` in `seedModelSchema`
   (closes 2); a wire field for `agentsSource` (closes 3), which stays cheap only while no writer
   sets it.
