/**
 * Holds that the verdict code the site checks share fails what fails: a
 * failing check exits 1 and names its failures, and membership drift is seen
 * both ways. Were it to break, the checks built on it would pass a broken
 * site, and a good build cannot show that. Needs no build.
 */

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { reportChecks, reportFailures } from "./check-report"
import type { Check } from "./check-report"
import { isNonNull } from "./is-non-null"
import { driftBetween } from "./membership-drift"

const LABEL = "verdict reporting"

const THIS_SCRIPT = fileURLToPath(import.meta.url)

const FAILED = 1

const PROBE_LABEL = "probe"

const REMEDY = "the remedy"

const HOLDING: Check = { holds: "a claim that holds", offences: [] }

const FAILING: Check = {
  holds: "a claim that fails",
  offences: ["its offence"],
}

type Probe = {
  report: () => never
  stdout: string[]
  stderr: string[]
}

// Each reporter exits, so each runs in a child of this script.
const PROBES: Record<string, Probe> = {
  reportFailures: {
    report: () =>
      reportFailures(PROBE_LABEL, ["first offence", "second offence"], {
        passed: "nothing failed",
        remedy: REMEDY,
      }),
    stdout: [],
    stderr: [
      `${PROBE_LABEL}: 2 failure(s)`,
      "  · first offence",
      "  · second offence",
      REMEDY,
    ],
  },
  reportChecks: {
    report: () => reportChecks(PROBE_LABEL, [HOLDING, FAILING], REMEDY),
    stdout: [`${PROBE_LABEL}: holds: ${HOLDING.holds}`],
    stderr: [
      `${PROBE_LABEL}: FAILS (1): ${FAILING.holds}`,
      "  · its offence",
      `${PROBE_LABEL}: 1 of 2 checks fail. ${REMEDY}`,
    ],
  },
}

const DRIFT_CLAIM = "a claim about members"

const NAMED = ["absent", "shared"]

const DRIFTED = ["shared", "unnamed"]

const HOLDS_LESS = ["shared"]

const HOLDS_MORE = ["absent", "shared", "unnamed"]

const REORDERED = ["shared", "absent"]

const EXPECTED_DRIFT = [
  {
    claim: DRIFT_CLAIM,
    namedButAbsent: ["absent"],
    presentButUnnamed: ["unnamed"],
  },
  { claim: DRIFT_CLAIM, namedButAbsent: ["absent"], presentButUnnamed: [] },
  { claim: DRIFT_CLAIM, namedButAbsent: [], presentButUnnamed: ["unnamed"] },
]

function main(): never {
  const probed = process.argv[2]
  if (probed !== undefined) return probeOf(probed).report()

  return exitWith([
    ...Object.entries(PROBES).flatMap(([name, probe]) =>
      misreportsOf(name, probe)
    ),
    ...driftMisreports(),
  ])
}

function probeOf(name: string): Probe {
  return PROBES[name] ?? refuse(`no probe is named ${name}`)
}

function misreportsOf(name: string, probe: Probe): string[] {
  const child = spawnSync(process.execPath, [THIS_SCRIPT, name], {
    encoding: "utf8",
  })
  if (child.error !== undefined)
    refuse(`${name} did not run: ${child.error.message}`)

  return [
    ...wrongExit(name, child.status),
    ...unprinted(name, "stdout", probe.stdout, child.stdout),
    ...unprinted(name, "stderr", probe.stderr, child.stderr),
  ]
}

function wrongExit(name: string, status: number | null): string[] {
  return status === FAILED
    ? []
    : [`${name} exited ${String(status)} on failing input, not ${FAILED}`]
}

function unprinted(
  name: string,
  stream: string,
  expected: string[],
  printed: string
): string[] {
  const lines = printed.split("\n")

  return expected
    .filter((line) => !lines.includes(line))
    .map((line) => `${name} did not print "${line}" to ${stream}`)
}

function driftMisreports(): string[] {
  const seen = [
    driftBetween(DRIFT_CLAIM, DRIFTED, NAMED),
    driftBetween(DRIFT_CLAIM, HOLDS_LESS, NAMED),
    driftBetween(DRIFT_CLAIM, HOLDS_MORE, NAMED),
    driftBetween(DRIFT_CLAIM, REORDERED, NAMED),
  ].filter(isNonNull)

  return isDeepStrictEqual(seen, EXPECTED_DRIFT)
    ? []
    : [
        `driftBetween and isNonNull saw ${JSON.stringify(seen)}, not ${JSON.stringify(EXPECTED_DRIFT)}`,
      ]
}

// Not reportFailures: a broken reporter must not be what reports itself.
function exitWith(misreports: string[]): never {
  if (misreports.length === 0) {
    console.log(
      `${LABEL}: a failing check exits ${FAILED} and names its failures, and drift is seen both ways`
    )
    process.exit(0)
  }

  console.error(`${LABEL}: ${misreports.length} failure(s)\n`)
  for (const misreport of misreports) console.error(`  · ${misreport}`)
  console.error(
    "\nThe verdicts are written in scripts/check-report.ts, scripts/membership-drift.ts and scripts/is-non-null.ts."
  )
  process.exit(1)
}

function refuse(reason: string): never {
  throw new Error(`${LABEL}: ${reason}`)
}

main()
