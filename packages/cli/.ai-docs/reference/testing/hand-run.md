---
scope: reference
area: testing
keywords:
  [
    handrun,
    hand-run,
    handrun-journeys,
    handrun-driver,
    handrun-surfaces,
    handrun.gen.mjs,
    section,
    note,
    verdict,
    attempt,
    withSharedFixtures,
    inspectFourSurfaces,
    expectFourSurfaces,
    startSeedConfigStore,
    InitWizard,
    user-journeys,
  ]
related:
  - reference/testing/e2e-infrastructure.md
  - reference/testing/harness-decisions.md
  - reference/codex-hand-check.md
last_validated: 2026-09-25
---

# The hand-run

The harness that drives the **real binary** through the numbered user journeys and prints a
transcript for a person to judge. It is the "run it by hand through the CLI" step of the
repository's agreed order, done once for many journeys instead of once per change.

**Entry point:** `scripts/handrun.mjs`. Run from `packages/cli`, on a `dist/` you have just built.

```bash
bun run build
node scripts/handrun.mjs
```

It exits 0 whatever it finds. **The exit code is not the verdict** — the transcript is, and the
three words it prints are what a reader counts.

| Line                     | Means                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `HOLDS  <claim>`         | The claim was checked and held                                                                     |
| `BROKEN  <claim>`        | The claim was checked and did not hold                                                             |
| `COULD NOT RUN  <label>` | The journey threw; `attempt` caught it, printed the first line of the error, and the run continued |

A journey that throws is reported and skipped rather than ending the run, so one broken fixture
does not hide the other journeys' verdicts.

## The modules

| File                      | What it holds                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `e2e/handrun-journeys.ts` | Every journey, and `main()` — the only file that says what is driven                   |
| `e2e/handrun-driver.ts`   | Transcript printing only: `section`, `note`, `verdict`, `attempt`                      |
| `e2e/handrun-surfaces.ts` | `checkFourSurfaces` — the hand-run's presentation of `e2e/assertions/four-surfaces.ts` |
| `scripts/handrun.mjs`     | esbuild bundle + import. Writes `e2e/helpers/handrun.gen.mjs` and runs it              |

**The bundle's location is load-bearing.** `CLI_ROOT` is derived from `import.meta.url`, so a
bundle written anywhere but `e2e/helpers/` points the spawned binary at the wrong tree. The file is
gitignored, and ignored by eslint (`globalIgnores "e2e/helpers/*.gen.mjs"`) and prettier.

**`handrun-driver.ts` drives nothing, and that is deliberate.** It was once a wizard driver; the
page objects under `e2e/pages/` already do that and know two things a naive waiter does not — the
tab bar renders every step's name on every screen, and `waitForText` matches the whole output
rather than the current screen, so a keystroke fires early and silently no-ops. Every journey goes
through `InitWizard` and the `e2e/fixtures/` seams instead.

**One strictness core, two presentations.** The specs call `expectFourSurfaces` and the hand-run
calls `inspectFourSurfaces`, so a spec and a hand-run cannot disagree about what "strict" means.
They did once: the hand-run's first pass asserted presence where the suite asserted content.

## What it drives

One section per journey group in `standards/e2e/user-journeys.md`. Each section's title names the
journey numbers it is:

| Section                                                                  | Journeys       |
| ------------------------------------------------------------------------ | -------------- |
| Global install from nothing, through the wizard                          | 1              |
| A stack installs exactly its roster                                      | 2, 12          |
| A project over a global install, then a second project                   | 3, 6           |
| Scope toggles, both directions                                           | 4, 15, 16      |
| Plugin mode against a registered marketplace                             | 5, 17          |
| Propagation, and containment                                             | 7, 8           |
| A stack's picks are editable                                             | 9              |
| Commands over a live install                                             | 10, 11, 20, 22 |
| `init --from` carrying global-scoped content                             | 13, 13b        |
| `init --from` refuses an install that already exists                     | 13a            |
| The config deleted under a live install                                  | 14             |
| A custom marketplace is stored and later commands resolve it             | 18             |
| Uninstall from scratch                                                   | 19             |
| The marketplace-author arc: doctor, build, publish, install              | 21             |
| Share, install the minted id, re-mint from the install                   | 23, 30         |
| `init --from` carrying an external skill's own bytes                     | 24             |
| The wizard offers the marketplace's own stacks, or no stack step         | 28             |
| A public-catalogue checkout reaches the built-in stacks                  | 28a            |
| Share turns an installation into an id, and the id rebuilds it           | 29             |
| `edit --from` refuses with no terminal to confirm at                     | 31             |
| Project-scoped content refused at `$HOME`                                | 32             |
| An author's build refuses an id outside its namespace                    | 33             |
| A hand-authored skill is not the round trip's to carry or remove         | 34             |
| `build marketplace` emits a catalogue beside the marketplace             | 35             |
| `doctor` steps over what it cannot claim, and uninstall refuses the same | 36             |
| A Codex uninstall leaves Claude untouched                                | 64, 66, 67     |
| A Codex project install trusts itself                                    | 76, 78         |
| The edit wizard over a Codex installation                                | 75             |
| A Claude project install says the folder must be trusted                 | 79             |

Re-derive the list rather than trusting the table:

```
grep -oE 'section\("Journeys? [^"]+' e2e/handrun-journeys.ts
```

## What it does not reach

The journeys with no section fall into three groups.

**The Codex journeys it does not drive — 65, 68, 69.** The Codex sections install onto Codex,
compile a role file and uninstall (64, 66, 67, 75, 76, 78). The three offered placements, the
install's narration and `doctor`'s layout reading, and the sixteen roles Codex registers are
spec-only. Their e2e specs are `e2e/lifecycle/codex-*.e2e.test.ts` and
`e2e/smoke/codex-*.smoke.test.ts`; what no rig can settle is
[the Codex hand-check](../codex-hand-check.md).

**Everything whose subject is a browser — 25, 27, 44, 46, 48, 49, 50, 51.** The hand-run
spawns a terminal binary. Several of these carry `none` in the journeys table's spec column on
purpose, because the CLI's leg of them IS another journey rather than a second copy of it.

**The rest are spec-covered and simply not worth a transcript** — 26, 37, 38, 39, 40, 41, 42, 43,
45, 47, 52, 53, 82, 83. Each names its spec in `standards/e2e/user-journeys.md`.

## What a transcript cannot tell you

**It reads four surfaces, not a model.** `checkFourSurfaces` asks what the config declares, which
sub-agents this scope owns, what was compiled here and whether any of it leaked across a scope. A
sub-agent behaving correctly is outside it, at both providers.

**`HOLDS` on an absence is only as good as the thing that should have been there.** Several
journeys assert a refusal; a run in which the subject never happened satisfies a refusal perfectly.
The journeys that can afford a control carry one in the same section.

**It does not build.** `scripts/handrun.mjs` bundles `handrun-journeys.ts` and spawns
`bin/run.js`, which reads `dist/`. A stale `dist/` is a hand-run of the previous release with no
line saying so.
