---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/seed/external-skills.ts
  - src/cli/lib/loading/source-loader.ts
  - src/cli/lib/matrix/skill-resolution.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
date: 2026-09-03
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >-
  A first guard landed and is NOT sufficient. `registerExternalSkills` refuses a payload whose
  carried skills claim ids the loaded catalogue owns, with a `local` incumbent carved out. An
  independent re-verification on 2026-09-03 defeated it: `payload.marketplace` steers which
  catalogue is loaded, so a payload naming a marketplace that does not ship the id it impersonates
  finds no incumbent and installs (reproduced, id `T-KmG-cT`). The incumbent set must be the union
  of the loaded matrix and `BUILT_IN_MATRIX`. Separately the `local` carve-out exempts more than it
  meant to — see "What the carve-out actually exempts" below. Both are open.
---

## What Was Wrong

`init --from <id>` installs a carried ("external") skill whose id is one the public catalogue
already owns, writing that skill's bytes into the catalogue skill's own directory. The run exits
`SUCCESS` and `doctor` afterwards reports `12 passed, 0 warnings, 0 errors`.

Driven by hand on 2026-09-03 against `0.162.0` and the live store:

```
python3 -c '...' > payload.json   # external: { "web-framework-react": { … files: { "SKILL.md": … } } }
cat payload.json | agents-inc share --stdin        # -> id ZF5vrDIF
agents-inc init --from ZF5vrDIF                    # exit 0
cat ~/.claude/skills/web-framework-react/SKILL.md  # the payload's bytes, not the catalogue's
agents-inc doctor                                  # Summary: 12 passed, 0 warnings, 0 errors
```

`~/.claude/skills/web-framework-react/` is what Claude Code loads for that skill, so what the
sub-agents carrying `web-framework-react` actually receive is whatever the payload shipped.

**The mechanism is one unconditional assignment.** `seatExternalSkill`
(`src/cli/lib/seed/external-skills.ts`) writes `matrix.skills[id] = externalCatalogueEntry(install)`
with no check on what is already seated there, and `externalSkillDir` joins the scope's `skillsDir`
with the same id, so the directory is the incumbent's too.

**It is one of exactly two writers of `matrix.skills`, and the only one that takes an id
unconditionally** — which is what makes this a drift rather than a missing idea. The discipline it
wants is already stated three times in its immediate neighbours, once by the other writer and twice
by the build that produced the map they both write into:

- `buildResolvedSkillMap` (`matrix/skill-resolution.ts`), which builds the map in the first place,
  warns `Duplicate skill id '…'` and keeps the first, with a docblock saying why: "the loser would
  leave no trace".
- `claimSlug`, in the same file and _called by `seatExternalSkill` itself_ one line later, is
  documented as "first claim winning and every later one named" and refuses the second claim.
- `mergeLocalSkillsIntoMatrix` (`loading/source-loader.ts`), the only other writer of
  `matrix.skills`, does override an incumbent id — but deliberately and partially: it inherits the
  incumbent's `category`, `slug`, `displayName` and all four relationship arrays
  (`existingSkill?.category ?? metadata.category`, and so on).

So the seat calls a function that refuses a colliding slug, immediately after taking a colliding id.

**The author-time half of the guard exists; only the consume-time half is missing.** The editor
mints these ids as `external-<category>-<name>` and already checks the result: `holderOf` in
`apps/editor/src/features/configure/components/add-skill-dialog.tsx` looks the staged id up in
`catalog.skillsById`, and its docblock names this exact failure — _"the alternative is discovering
it when the CLI writes the second one over the first."_ That is the shape journey 33 already has
for marketplaces, with both halves: `build marketplace` refuses an out-of-namespace id at author
time, and `refuseCatalogueCollisions` in `source-loader.ts` asks the question again on load,
because — in its own words — "nothing a source ships is unforgeable, so the consumer's own load has
to ask the question again." A payload is exactly as forgeable as a marketplace: `share --stdin`
accepts any JSON `seedPayloadSchema` admits, and that schema constrains an external entry's VALUE
while never constraining its KEY, which is the id.

**What makes it hard to see is the repair on the next load.** `mergeLocalSkillsIntoMatrix` reads
the written directory back and inherits the incumbent's `displayName`, `slug` and `category`, so
every later command renders the impostor under the catalogue's own name and placement. Measured
against a control install with no impostor:

```
shadowed  │ web-framework-react │ React │ eject      │ web-framework │ An external skill claiming a catalogue id
control   │ web-framework-react │ React │ agents-inc │ web-framework │ React component patterns
```

Only the description differs, and `origin: eject` is what a legitimate local fork of a catalogue
skill shows too. There is no surface on which the two can be told apart.

## Fix Applied

One guard in `registerExternalSkills`, beside the plugin refusal that was already there. Both
`init --from` and `edit --from` inherit it through their own `registerExternalSkillsOrFail`
wrappers, so it landed in one function and no plumbing was added. Three private functions carry it:
`claimingACatalogueId` selects the offending ids, `heldByCatalogue` is the predicate that decides
what counts as an incumbent, and `catalogueIdCollisionError` builds the message.

Refusing the whole payload rather than dropping the colliding ids is what `refuseCatalogueCollisions`
already decided for the same class, and the three reasons it gives all hold here — a partial apply
would hand the user a configuration quietly missing skills the sharer picked, leave the catalogue's
own copies standing in under those ids, and tell the sharer nothing.

**The incumbent is read out of the LOADED matrix rather than out of `BUILT_IN_MATRIX`**, which is
the one place this differs from `refuseCatalogueCollisions`. That guard reads the built-in set, and
a copy of it here would inherit a hole: an external id colliding with a custom marketplace's own
ids (`acme-example-skill` against a loaded `acme`) is the same defect one marketplace along, and
the built-in set does not contain it. The matrix `registerExternalSkills` is already handed is the
set that answers both.

**`heldByCatalogue` carves out this installation's own content** — an incumbent carrying
`local: true`. `edit --from` applies destructively over an existing install and is handed the
source's matrix, which has already had `mergeLocalSkillsIntoMatrix` run over it, so a carried skill
a previous apply wrote arrives back seated and local; refusing it would make a shared configuration
installable exactly once. `local` is the right discriminator because `buildResolvedSkill` never
writes it — nothing a marketplace ships carries it — while the local merge writes it on everything
it merges. It is the same carve-out `claimSlug` makes for a claim it already holds.

Both refusals are decided before anything is seated. The seat writes into the matrix in place, so a
guard placed after it would stop the run having already replaced entries every later read in the
process resolves, and a guard throwing on the first collision it met would have overwritten
whatever it seated on the way there. The unit spec asserts both incumbents survive for that reason.

Shown red before and green after at both levels — the unit spec by withdrawing the throw, and the
E2E leg by flipping its exit-code expectation so the tree comparison carried the red alone (8 files
against the empty tree). Then driven by hand against the real binary and the live store: the
original repro now exits 1 with nothing written at either scope, a properly namespaced carried
skill still installs with `doctor` clean, and `edit --from` re-applying a payload whose carried
skill is already installed reaches its confirm rather than a refusal and leaves the skill intact.

## Open Question — for the owner

**Does the receiver enforce the `external-` namespace, or only refuse actual collisions?** The two
are not the same rule and the difference is a behaviour change beyond this defect.

- **Refuse collisions only** (mirrors `refuseCatalogueCollisions`): closes the demonstrated defect
  and, read against the loaded matrix, the custom-marketplace variant too. Leaves a hand-authored
  payload carrying `acme-house-style` installing exactly as it does today.
- **Require the `external-` prefix** (enforces journey 26's ruling as written — "Skills with no
  marketplace take the `external-` namespace"): strictly stronger, and it is what the editor
  already mints, so no payload the product produces is affected. It would newly refuse ids nothing
  in the product mints, which is the intended effect and also the reason it needs a ruling rather
  than a judgement call here.

If the prefix rule is taken, `EXTERNAL_SKILL_NAMESPACE` moves out of `marketplace-generator.ts`
(where it is private today) into `consts.ts`, for the reason already written into
`PUBLIC_CATALOGUE_PACKAGE` there: "Two guards read it and must agree, which is why it lives here
rather than in either."

A third layer is available and is NOT recommended as part of this: a `superRefine` on
`seedPayloadSchema` (`packages/matrix/src/seed.ts`) would refuse the id at mint time, so
`share --stdin` never produces such a payload. It is the right place for the rule and the wrong
blast radius for a fix — that schema is the wire contract the worker, the editor and `api-mocks`
all decode with, and the receiver-side guard is what actually protects an install, since an id
minted before any schema change still has to be installed by something.

## Proposed Standard

For `CLAUDE.md`, or `.ai-docs/standards/` beside the journey-33 material:

**A writer that seats an entry into a shared map states what it does about an id already there.**
Overwrite, refuse, or inherit-and-override are all defensible; being silent is not, because the map
is read by everything downstream and the loser leaves no trace. The test is mechanical: for each
assignment of the form `map[key] = value` where `map` outlives the function, find the other writers
and say which of the three answers this one gives. Both of `matrix.skills`' writers had a precedent
to read — the merge that inherits, and the build that refuses and names the loser — which is what
makes the seat's silence a drift rather than an open question.

Census of the class, run 2026-09-03. Reads vastly outnumber writes here, so the grep has to anchor
on the assignment or it returns 27 lines and answers nothing:

```
grep -rnE "matrix\.skills\[[^]]+\] *=" --include='*.ts' packages apps | grep -v node_modules | grep -v "/dist/" | grep -v "\.test\."
```

Returns exactly the two writers named above — `external-skills.ts:161` and `source-loader.ts:766` —
and no third.
