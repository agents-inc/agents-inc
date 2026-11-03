const OFFENCES_LISTED = 5

/** A claim the site must hold; it holds when nothing offends it. */
export type Check = { holds: string; offences: string[] }

/** Each claim's verdict, then exit 1 when any fails. */
export function reportChecks(
  label: string,
  checks: Check[],
  remedy: string
): never {
  const failed = checks.filter((check) => check.offences.length > 0)
  for (const check of checks) reportCheck(label, check)

  if (failed.length === 0) process.exit(0)
  console.error(
    `\n${label}: ${failed.length} of ${checks.length} checks fail. ${remedy}`
  )
  process.exit(1)
}

/** Every failure and where to fix it, or what held; then the exit code. */
export function reportFailures(
  label: string,
  failures: string[],
  { passed, remedy }: { passed: string; remedy: string }
): never {
  if (failures.length === 0) {
    console.log(`${label}: ${passed}`)
    process.exit(0)
  }

  console.error(`${label}: ${failures.length} failure(s)\n`)
  for (const failure of failures) console.error(`  · ${failure}`)
  console.error(`\n${remedy}`)
  process.exit(1)
}

function reportCheck(label: string, { holds, offences }: Check): void {
  if (offences.length === 0) {
    console.log(`${label}: holds: ${holds}`)
    return
  }

  console.error(`${label}: FAILS (${offences.length}): ${holds}`)
  for (const offence of offences.slice(0, OFFENCES_LISTED)) {
    console.error(`  · ${offence}`)
  }
  if (offences.length > OFFENCES_LISTED) {
    console.error(`  · and ${offences.length - OFFENCES_LISTED} more`)
  }
}
