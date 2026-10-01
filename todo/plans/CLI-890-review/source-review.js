export const meta = {
  name: "expressive-ts-source",
  description:
    "Bring the programme's source in line with expressive TypeScript; one serial suite, then two reviewers per lane",
  phases: [
    {
      title: "Refactor",
      detail: "lanes edit in parallel; typecheck and lint only, no builds",
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
  "/tmp/claude-1000/-home-vince-dev-ai-benchmarking/b1b3d06f-9157-4392-a1d6-5b367c67e0ac/scratchpad/review/source"
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
  "**LOAD THE SKILL FIRST:** `" +
    SKILL +
    "` via the Skill tool, and its `reference.md` and `examples/core.md`.",
  "",
  'The owner, 2026-09-25: *"use the meta expressive typescript skill to go over all of the code that was written and',
  'make sure that it aligns with these best practices."* The code is believed FUNCTIONAL -- every suite is green -- so',
  "this is a READABILITY pass, and **behaviour must not change at all.**",
  "",
  "**How to judge each function, per the skill:** can a reader follow its flow without mentally simulating any part?",
  "If not, apply the two-tier pattern -- guard clauses, then named calls, then assembly -- and extract what needs",
  "simulating into a named predicate, transform or constant, named for WHAT it does. Flatten 3+ levels of nesting",
  "into guard clauses. Give every switch on a union its `never` default. **If a function already reads clearly, LEAVE",
  "IT ALONE** -- the skill is explicit that over-extraction and churn are defects too. Most of this code may already",
  "pass; a lane that changes nothing it did not need to is a good lane.",
  "",
  "**HARD LIMITS, so twelve lanes can work at once without breaking each other:**",
  "- Edit ONLY the files in your lane.",
  "- **Do not rename, remove, move or change the signature of any EXPORTED symbol.** Other lanes, the tests and the",
  "  docs depend on them. Restructure BEHIND the export. If an exported name is genuinely wrong, report it.",
  "- **No `bun run build`, no turbo, no test suite.** Your source edits make `dist/` stale; a build from any lane",
  "  corrupts every other lane's picture. You MAY run read-only checks: `npx tsc --noEmit -p <the package tsconfig>`",
  "  and `npx eslint <your files>` (never `--fix`). Judge only errors in YOUR files -- other lanes are mid-edit.",
  "- Snapshot every file BEFORE editing: `mkdir -p " +
    SCRATCH +
    "/<lane>/before && cd " +
    CLI +
    " && cp --parents",
  "  <files> " + SCRATCH + "/<lane>/before/`.",
  "- Keep docblocks true of the code after your change. A comment that described the old shape is now false.",
  "- **Never hand-edit a generated file** (a `GENERATED` banner, `packages/compile/src/generated/`,",
  "  `packages/matrix/src/vendor/`). Change its SOURCE and say which generator to run.",
].join("\n")

const REFACTOR_REPORT = {
  type: "object",
  properties: {
    filesChanged: { type: "array", items: { type: "string" } },
    perFile: {
      type: "string",
      description:
        "each changed file: which function, which skill pattern, and why it now reads better",
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
  },
  required: [
    "filesChanged",
    "perFile",
    "leftAlone",
    "exportedNamesToReport",
    "typecheckAndLint",
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

let suite = await runSuite("suite:1")
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
        ).slice(0, 8000),
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
  suite = await runSuite("suite:" + round)
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
              "behaviour-change | still-needs-simulation | over-extraction | convention | false-docblock",
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
                      "Load the skill `" +
                        SKILL +
                        "` and read its `reference.md`.",
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
                      "**Check, per the skill and the house rules:**",
                      "1. **Behaviour change** -- anything the refactor altered beyond structure: a guard that now returns a different",
                      "   value, an evaluation order that moved, a short-circuit lost, an `await` made sequential or parallel. This is",
                      "   the worst finding; the suites are green, so it would be one the tests do not cover.",
                      "2. **Still needs simulating** -- a function the lane left alone or touched that still fails the readability test.",
                      "3. **Over-extraction** -- a name that merely restates one clear line, which the skill calls a defect.",
                      "4. **Convention** -- house rules broken in the changed lines.",
                      "5. **False docblock** -- a comment the refactor made untrue.",
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
      JSON.stringify(r.votes, null, 1).slice(0, 9000),
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
const finalSuite = settled.length ? await runSuite("suite:final") : suite

return {
  lanes: LANES.map((l) => l.id),
  byLane,
  repairs,
  verifyGreen,
  reviewed,
  settled,
  finalSuite,
}
