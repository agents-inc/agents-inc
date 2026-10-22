import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { delimiter, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// A command the local-dev helpers spawn, answered by `stand-in-command.mjs` instead: first on a
// PATH that otherwise stays the caller's, because a spawn with `env` looks the command up there.

const PROGRAM = join(
  dirname(fileURLToPath(import.meta.url)),
  "stand-in-command.mjs"
)

const EXECUTABLE = 0o755
const POLL_MS = 50

export type StandInBehaviour =
  "asks-github" | "runs-until-stopped" | "never-says-ready"

/** Its process, and the origin it said it was ready on (only when given a port). */
export type StandInRun = { pid: number; said: string | null }

export type StandInCommand = {
  /** Merged over the spawned environment. */
  environment: Record<string, string>
  /** Empty until the command has run. */
  runs: () => StandInRun[]
}

const callersPath = () => {
  const { PATH } = process.env
  if (PATH === undefined) {
    throw new Error("there is no PATH to put a stand-in command in front of")
  }
  return PATH
}

export const standInCommand = (
  scratch: string,
  name: string,
  behaviour: StandInBehaviour
): StandInCommand => {
  const bin = join(scratch, "stand-in-bin")
  const record = join(scratch, `stand-in-${name}.json`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, name),
    `#!/bin/sh\nexec "${process.execPath}" "${PROGRAM}" "$@"\n`,
    { mode: EXECUTABLE }
  )

  return {
    environment: {
      PATH: `${bin}${delimiter}${callersPath()}`,
      STAND_IN_COMMAND: behaviour,
      STAND_IN_COMMAND_RECORD: record,
    },
    runs: () =>
      existsSync(record)
        ? // Parse boundary: the shape `stand-in-command.mjs` writes.
          [JSON.parse(readFileSync(record, "utf8")) as StandInRun]
        : [],
  }
}

export const onlyRun = (command: StandInCommand): StandInRun => {
  const [run, ...more] = command.runs()
  if (run === undefined || more.length > 0) {
    throw new Error(
      `expected the stand-in to have run once: ${JSON.stringify(command.runs())}`
    )
  }
  return run
}

const isNoSuchProcess = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ESRCH"

/** A zombie still counts, so poll: node reaps a child once its exit is handled. */
export const isRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (isNoSuchProcess(error)) return false
    throw error
  }
}

/** Its group as well, since `startDev` gives the server one of its own. */
export const stopIfRunning = (pid: number) => {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGKILL")
    } catch (error) {
      if (!isNoSuchProcess(error)) throw error
    }
  }
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Whether `holds` came true within `withinMs`. */
export const cameTrueWithin = async (
  holds: () => boolean,
  withinMs: number
) => {
  const deadline = Date.now() + withinMs
  while (!holds()) {
    if (Date.now() > deadline) return false
    await sleep(POLL_MS)
  }
  return true
}
