export const meta = {
  name: "fixtures-tests",
  description:
    "Bring the programme's tests in line with the repo's fixture rules; wire new factories; one serial suite; two reviewers per lane",
  phases: [
    {
      title: "Refactor",
      detail: "lanes edit in parallel; typecheck and lint only, no builds",
    },
    {
      title: "Wire",
      detail:
        "new factories into the barrels, and into the roster the drift checker binds",
    },
    {
      title: "Verify",
      detail:
        "one serial build and every suite; failures traced to a lane and repaired one lane at a time",
    },
    { title: "Review", detail: "two independent reviewers per lane" },
    {
      title: "Settle",
      detail: "repair what the reviewers found, then the suite once more",
    },
  ],
}

// args: { lanes: [{ id, role, files: [repo-relative paths] }] } -- computed by partition.py at launch.
const CLI = "/home/vince/dev/cli"
const SCRATCH =
  "/tmp/claude-1000/-home-vince-dev-ai-benchmarking/b1b3d06f-9157-4392-a1d6-5b367c67e0ac/scratchpad/review/tests"
const LANES = args.lanes
const SKILL =
  "meta-design-expressive-typescript:meta-design-expressive-typescript"

const RULES = [
  "Read " +
    CLI +
    "/CLAUDE.md and " +
    CLI +
    "/packages/cli/CLAUDE.md -- the house conventions (kebab-case, named exports,",
  'import ordering, `import type`, named constants, no `as unknown as`) are part of what "expressive" means here.',
  "`export PATH=/home/vince/.local/share/fnm/node-versions/v23.10.0/installation/bin:$PATH`.",
  "NON-NEGOTIABLE: no git command that writes. Nothing under " +
    CLI +
    "/todo/. Do not touch `.github/workflows/ci.yml`",
  "(the owner staged a hunk in it) or any CLAUDE.md. ai-benchmarking is out of scope.",
].join("\n")

const REFACTOR_RULES = [
  'The owner, 2026-09-25: *"make sure that our tests align with testing best practices, which is to say that it uses',
  "fixtures for everything.\"* That is this repo's OWN rule -- read it in `" +
    CLI +
    "/packages/cli/CLAUDE.md`, section",
  '"Test Data", and apply it exactly:',
  "  - NEVER construct test data inline -- use factories from `__tests__/factories/` and `__tests__/helpers/`, and",
  "    fixtures from `__tests__/fixtures/create-test-source.ts`. **If a factory does not exist, create one.**",
  "  - Canonical `SKILLS.*` from `test-fixtures.ts` rather than custom mock skills; pre-built constants in",
  "    `mock-matrices.ts` rather than `createMockMatrix(...)` inline; never the whole `SKILLS` registry.",
  "  - `buildProjectConfig()`, `buildSourceConfig()`, `buildAgentConfigs()` rather than inline config objects.",
  "  - `renderSkillMd()`, `renderAgentYaml()` rather than inline frontmatter or YAML strings.",
  "Read `" +
    CLI +
    "/packages/cli/.ai-docs/reference/testing/factories.md` and `mock-data.md` for what already exists,",
  "and the testing standards under `" +
    CLI +
    "/packages/cli/.ai-docs/standards/` (the e2e bible and `e2e/*.md`) for the",
  'rest of what "best practice" means here. Load any testing skill your role names.',
  "",
  "**The tests are green now, and they must stay exactly as STRONG.** The defect to fear is a test that got WEAKER: a",
  "factory whose defaults quietly supply the very condition the inline data spelled out, so the assertion still",
  "passes but no longer proves anything. When you replace inline data, the test must still name -- visibly, at the",
  "call site -- every value its assertion depends on,",
  "and every assertion stays. Never delete, loosen or `.skip` an assertion to make a refactor pass.",
  "",
  "**KNOWN, ALREADY FOUND -- these tests CANNOT FAIL, fix them in whichever lane owns the file:**",
  "  **A test that cannot fail is the worst defect this review can find. Look for more of the same class.**",
  "  - **Untyped mocks hide dead fields.** The command tests mock `writeProjectConfig` as a bare `vi.fn()`, so when",
  "    `ConfigWriteResult.filesWritten` was removed, neither tsc nor vitest flagged the three mocks still returning it.",
  "    Type such mocks against the real function -- `vi.fn<typeof writeProjectConfig>()` -- wherever you touch them,",
  "    so a stale mock field is a compile error. That is a testing best practice here, not a style choice.",
  '  - A retired premise -- "extras are for a just-created skill or agent" -- survives in four test lines of the',
  "    describe block whose docblock was corrected on 2026-09-26. Make them true.",
  "",
  "**HARD LIMITS, so the lanes can work at once:**",
  "- Edit ONLY the files in your lane.",
  "- **Shared test infrastructure is owned by ONE lane each:** `packages/cli/src/cli/lib/__tests__/{factories,helpers,",
  "  fixtures,assertions}/**` by `test-lib-journeys-and-helpers`, and `packages/cli/e2e/{helpers,fixtures,pages,",
  "  assertions,matchers}/**` by `test-e2e-infra-and-rest`. Any other lane that needs a NEW factory or helper creates",
  "  it as a NEW FILE in the right directory, named for its domain, imports it",
  "  from that file, does NOT touch a barrel `index.ts` or an existing shared file, and reports it in",
  "  `newFactories`. Never change an existing shared helper's signature -- ADD, do not alter.",
  "- **No `bun run build`, no turbo, no test suite.** E2E specs share fixed temp paths on this machine, so two lanes",
  "  running specs at once corrupt each other. You MAY run read-only checks: `npx tsc --noEmit -p <the package",
  "  tsconfig>` and `npx eslint <your files>` (never `--fix`). Judge only errors in YOUR files.",
  "- Snapshot every file BEFORE editing: `mkdir -p " +
    SCRATCH +
    "/<lane>/before && cd " +
    CLI +
    " && cp --parents",
  "  <files> " + SCRATCH + "/<lane>/before/`.",
  "- A test's docblock must stay true of what the test now does.",
].join("\n")

const REFACTOR_REPORT = {
  type: "object",
  properties: {
    filesChanged: { type: "array", items: { type: "string" } },
    perFile: {
      type: "string",
      description:
        "each changed file: what inline data it replaced, with which factory, and how the test still names every value its assertions depend on",
    },
    leftAlone: {
      type: "string",
      description:
        "files or functions judged already clear, and why -- so reviewers see the judgement",
    },
    exportedNamesToReport: {
      type: "string",
      description:
        'exported names that are wrong but were not renamed, or "none"',
    },
    typecheckAndLint: {
      type: "string",
      description:
        "the read-only checks you ran and their result for your files",
    },
    newFactories: {
      type: "string",
      description:
        'each NEW factory/helper file you created: path, exported names, and which barrel it belongs in -- or "none"',
    },
  },
  required: [
    "filesChanged",
    "perFile",
    "leftAlone",
    "exportedNamesToReport",
    "typecheckAndLint",
    "newFactories",
  ],
}

const laneFiles = (lane) => lane.files.map((f) => "  - " + f).join("\n")

const SUITE = [
  "From " +
    CLI +
    ": `bun run build`; `npx turbo test --force` (unit, integration AND commands -- confirm each project ran);",
  "`npx turbo test:e2e --filter=agents-inc`, then separately `npx turbo test:e2e --filter=editor` -- never together;",
  'packages/cli `npm run test:smoke`; `npx turbo lint typecheck --force`; root `npx prettier --check "**/*.{ts,tsx}"`;',
  "packages/cli `npm run format:check`; `bun run generate:${g}:check` for types, schemas, matrix, compile (write",
  '`${g}` -- in zsh `$g:c` is a history modifier). `npm test` inside packages/cli reports "No test files found" -- an',
  "invocation quirk; always go through turbo from the root. A failure: re-run that suite ALONE. The known flake is",
  "`e2e/interactive/init-wizard-default-source.e2e.test.ts`; anything else failing is a real failure.",
  "A failure OUTSIDE every lane that you PROVE predates this review -- it fails the same way against the lanes' before/",
  "snapshots, or at HEAD -- is not this review's: report it under its own heading, and it does not count against",
  "`green`. Anything you cannot prove predates the review DOES count.",
].join("\n")

phase("Refactor")
const refactored = await parallel(
  LANES.map(
    (lane) => () =>
      agent(
        [
          RULES,
          "",
          REFACTOR_RULES,
          "",
          "**YOUR LANE: `" + lane.id + "`** -- these files and no others:",
          laneFiles(lane),
        ].join("\n"),
        {
          label: "refactor:" + lane.id,
          phase: "Refactor",
          agentType: lane.role,
          schema: REFACTOR_REPORT,
        }
      )
  )
)

const byLane = LANES.map((lane, i) => ({ lane, refactor: refactored[i] }))
const ownership = LANES.map((l) => l.id + ": " + l.files.join(", "))
  .join("\n")
  .slice(0, 20000)

phase("Wire")
const newFactories = byLane
  .map(
    ({ lane, refactor }) =>
      "### " +
      lane.id +
      "\n" +
      String((refactor && refactor.newFactories) || "none")
  )
  .join("\n\n")
const wired = await agent(
  [
    RULES,
    "",
    "**WIRE THE NEW FACTORIES.** The lanes are done, so the shared files are free. Each lane that created a new factory",
    "or helper file reports it below. For each: export it from the right barrel `index.ts`, and switch that lane's",
    "direct-file imports to the barrel, as the rest of the suite imports. Do not rename anything a lane created unless",
    "it collides with an existing name -- then rename and fix every import.",
    "",
    newFactories,
  ].join("\n"),
  {
    label: "wire",
    phase: "Wire",
    agentType: "cli-tester",
    schema: REFACTOR_REPORT,
  }
)
const roster = await agent(
  [
    "YOU ARE ACTING AS THE REPO'S `codex-keeper` AGENT. It is not a registered agent type here, so read its partials IN",
    "THIS ORDER and follow them: " +
      CLI +
      "/packages/cli/src/agents/meta/codex-keeper/ -- identity.md, playbook.md,",
    "critical-requirements.md, critical-reminders.md, output.md.",
    "",
    RULES,
    "",
    "**The factory, helper and assertion ROSTERS in `" +
      CLI +
      "/packages/cli/.ai-docs/reference/testing/factories.md` are",
    "exhaustive and bound by `scripts/check-enumeration-drift.ts`**, which reads each DIRECTORY. New factories were just",
    "added; bring the rosters (and `mock-data.md` if it is affected) up to date, re-derived from the directories rather",
    "than from this list. Then run `npx vitest run scripts/check-enumeration-drift.test.ts` from packages/cli -- or, if",
    'that reports "No test files found", the drift check through turbo -- and report it green.',
    "",
    "What the lanes and the wiring step added:",
    newFactories,
    String((wired && wired.perFile) || "").slice(0, 3000),
  ].join("\n"),
  { label: "roster", phase: "Wire", schema: REFACTOR_REPORT }
)

phase("Verify")
const SUITE_REPORT = {
  type: "object",
  properties: {
    green: { type: "boolean" },
    results: {
      type: "string",
      description: "every suite with counts and exit codes",
    },
    failuresByLane: {
      type: "array",
      items: {
        type: "object",
        properties: {
          lane: { type: "string" },
          failure: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["lane", "failure", "evidence"],
      },
    },
  },
  required: ["green", "results", "failuresByLane"],
}
const runSuite = (label) =>
  agent(
    [
      RULES,
      "",
      "**YOU ARE THE ONLY THING RUNNING.** Run every suite, one at a time, and report every count:",
      SUITE,
      "",
      "For every failure, name the LANE whose file caused it -- trace it to the changed file, using this ownership map,",
      "and the snapshots under " +
        SCRATCH +
        "/<lane>/before to see what changed. A failure that predates the refactor",
      "(compare against the snapshot) is not a lane's; say so. Do not fix anything.",
      "",
      ownership,
    ].join("\n"),
    { label, phase: "Verify", agentType: "cli-tester", schema: SUITE_REPORT }
  )

// The first run's suite never went green: five rounds, four repairs of one lane, the same failure each time. The
// repairing lane was right that no edit to ITS files could fix it -- the drift was in a doc no lane owned. A loop with
// no route to the real fix is the orchestrator's defect; this step is the route.
const driftFix = await agent(
  [
    "YOU ARE ACTING AS THE REPO'S `codex-keeper` AGENT. It is not a registered agent type here, so read its partials IN",
    "THIS ORDER and follow them: " +
      CLI +
      "/packages/cli/src/agents/meta/codex-keeper/ -- identity.md, playbook.md,",
    "critical-requirements.md, critical-reminders.md, output.md.",
    "",
    RULES,
    "",
    '**ONE DRIFT, measured by the checker itself:** `scripts/check-enumeration-drift.test.ts` > "has no document whose',
    'exhaustive list disagrees with the source it enumerates" reports `STEP_TEXT in standards/e2e/README.md` DRIFTED:',
    '`presentButUnnamed: ["PLUGINS_REMOVED", "GATE_LINTER_NOT_INSTALLED"]`. The test-e2e-infra-and-rest lane added both',
    "to `packages/cli/e2e/pages/constants.ts` to power two new NEGATIVE assertions -- a strengthening, keep it. The roster",
    "step updated `reference/testing/e2e-infrastructure.md` (now agreeing, 222 members) but not",
    "`packages/cli/.ai-docs/standards/e2e/README.md`'s STEP_TEXT list (~line 216). Add both members there, in that list's",
    "own style, re-derived from constants.ts. Then look for ANY other doc that enumerates `STEP_TEXT` or another",
    "registry the lanes grew, and bring it into line. Run `npx turbo test --filter=agents-inc --only -- scripts/check-",
    "enumeration-drift.test.ts` from the repo root and report it green.",
  ].join("\n"),
  { label: "drift-fix", phase: "Verify", schema: REFACTOR_REPORT }
)

let suite = await runSuite("suite2:1")
let round = 1
const repairs = []
while (suite && !suite.green && round <= 4) {
  const failing = [...new Set((suite.failuresByLane || []).map((f) => f.lane))]
  log(
    "round " +
      round +
      ": failing lanes " +
      (failing.join(", ") || "(none attributed)")
  )
  for (const id of failing) {
    const lane = LANES.find((l) => l.id === id)
    if (!lane) continue
    // SERIAL on purpose: each repair builds and tests, and two builds at once corrupt each other.
    const r = await agent(
      [
        RULES,
        "",
        REFACTOR_RULES.replace(
          "**No `bun run build`, no turbo, no test suite.**",
          "**You MAY build and run the failing specs now -- you are the only lane running.**"
        ),
        "",
        "**REPAIR `" +
          id +
          "`.** Your lane's refactor broke these, and the behaviour must be restored WITHOUT undoing",
        "the readability gain where you can keep it. If a change cannot be made safe, revert that function to its",
        "snapshot and say so:",
        JSON.stringify(
          (suite.failuresByLane || []).filter((f) => f.lane === id),
          null,
          1
        ),
        "",
        "Your files:",
        laneFiles(lane),
        "",
        "Build, re-run the failing specs, then the unit suite through turbo, and report.",
      ].join("\n"),
      {
        label: "repair:" + id + ":" + round,
        phase: "Verify",
        agentType: lane.role,
        schema: REFACTOR_REPORT,
      }
    )
    repairs.push({ lane: id, round, r })
  }
  round += 1
  suite = await runSuite("suite2:" + round)
}
const verifyGreen = !!(suite && suite.green)
log(
  "suite after refactor: " +
    (verifyGreen
      ? "GREEN"
      : "STILL RED after " +
        (round - 1) +
        " repair rounds -- returned to the orchestrator")
)

phase("Review")
const VOTE = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["clean", "problems"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          kind: {
            type: "string",
            description:
              "weakened-test | inline-data | duplicate-factory | convention | false-docblock",
          },
          what: { type: "string" },
          fix: { type: "string" },
        },
        required: ["file", "kind", "what", "fix"],
      },
    },
    notes: { type: "string" },
  },
  required: ["verdict", "findings", "notes"],
}
const reviewed = verifyGreen
  ? await parallel(
      byLane.map(
        ({ lane, refactor }) =>
          () =>
            parallel(
              [1, 2].map(
                (n) => () =>
                  agent(
                    [
                      RULES,
                      "",
                      'Read packages/cli/CLAUDE.md "Test Data" and packages/cli/.ai-docs/reference/testing/factories.md first.',
                      "YOU ARE INDEPENDENT REVIEWER " +
                        n +
                        " OF 2 FOR `" +
                        lane.id +
                        "`. YOU NEVER FIX; change no file. Do not build or",
                      "run a suite -- the tree is green and another run would race the other reviewers.",
                      "Diff each file against its snapshot: `diff -u " +
                        SCRATCH +
                        "/" +
                        lane.id +
                        "/before/<path> " +
                        CLI +
                        "/<path>`.",
                      "The lane's account (a claim to test): " +
                        String((refactor && refactor.perFile) || "-").slice(
                          0,
                          3500
                        ),
                      "What it left alone: " +
                        String((refactor && refactor.leftAlone) || "-").slice(
                          0,
                          1500
                        ),
                      "",
                      "Files:",
                      laneFiles(lane),
                      "",
                      '**Check, against packages/cli/CLAUDE.md "Test Data" and the repo\'s testing standards:**',
                      "1. **A test that got WEAKER** -- the worst finding. For each changed test, compare its assertions before and after,",
                      "   and the values they depend on: does the call site still NAME each one, or does a factory default now supply",
                      "   it silently? Is any assertion gone, loosened, or skipped? The suites are green, so a weakened test is invisible.",
                      "2. **Inline test data remaining** in the lane's files, that a factory, helper or fixture should supply.",
                      "3. **A new factory that duplicates an existing one**, is misplaced, or is named for HOW rather than WHAT.",
                      "4. **Convention** -- house rules broken in the changed lines.",
                      "5. **False docblock** -- a test comment the refactor made untrue.",
                    ].join("\n"),
                    {
                      label: "review:" + lane.id + ":" + n,
                      phase: "Review",
                      agentType: "reviewer",
                      schema: VOTE,
                    }
                  )
              )
            ).then((votes) => ({ lane: lane.id, votes }))
      )
    )
  : []

phase("Settle")
const needs = reviewed.filter(
  (r) => r && r.votes.some((v) => v && v.verdict === "problems")
)
const settled = []
for (const r of needs) {
  const lane = LANES.find((l) => l.id === r.lane)
  const s = await agent(
    [
      RULES,
      "",
      REFACTOR_RULES.replace(
        "**No `bun run build`, no turbo, no test suite.**",
        "**You MAY build and run specs -- you are the only lane running.**"
      ),
      "",
      "**SETTLE `" +
        r.lane +
        "`.** Two independent reviewers found the following. Fix each in your lane; for one you believe",
      "is wrong, say why with the code that proves it:",
      JSON.stringify(r.votes, null, 1),
      "",
      "Your files:",
      laneFiles(lane),
      "",
      "Build and run the unit suite through turbo before you report.",
    ].join("\n"),
    {
      label: "settle:" + r.lane,
      phase: "Settle",
      agentType: lane.role,
      schema: REFACTOR_REPORT,
    }
  )
  settled.push({ lane: r.lane, s })
}
const finalSuite = settled.length ? await runSuite("suite2:final") : suite

return {
  lanes: LANES.map((l) => l.id),
  byLane,
  wired,
  roster,
  driftFix,
  repairs,
  verifyGreen,
  reviewed,
  settled,
  finalSuite,
}
