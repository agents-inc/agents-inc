import { useEffect, useMemo, useState } from "react"

import { createSharedConfig } from "@/lib/api/configs"
import { toSeedPayload } from "./seed"

import type { ConfigSelection } from "./derive"
import type { SeedPayload } from "@workspace/matrix"

const COPIED_DECAY_MS = 2_000

// `init` alone is a valid CLI invocation — it just starts the wizard from
// nothing. That is the fallback when an id cannot be minted: the command still
// works, it simply does not carry what was configured here.
const BASE_COMMAND = "npx agents-inc init"

// A flag rather than a positional. Nobody types this line — the block copies
// itself — so brevity buys nothing, while a named flag says what the id is and
// leaves room to accept a file or a URL later without a second one.
const ID_FLAG = "--from"

export type InstallCommand =
  { status: "minting" } | { status: "ready"; id: string } | { status: "failed" }

// What was minted, and for which configuration. Storing the key alongside the
// result is what lets both `command` and `copied` be *derived* rather than
// reset: changing the selection makes the old id stale by comparison, with no
// effect writing state back on the way through.
type Minted = { key: string; id: string | null }

// The install dialog's whole job is handing over a command that carries the
// configuration, which means the configuration has to exist server-side first.
// Minting happens when the dialog opens rather than when the command is
// copied: the id has to be on screen to be read, so it cannot wait for a
// click. The worker skips the write when the content-addressed key already
// exists, so re-opening the same configuration costs a read rather than one of
// the free tier's 1000 daily writes.
export const useInstallCommand = (config: ConfigSelection, open: boolean) => {
  // The selection's identity changes on every render; its *serialisation* does
  // not. Keying on the string is what stops the dialog re-minting in a loop.
  const serialized = useMemo(
    () => JSON.stringify(toSeedPayload(config)),
    [config]
  )

  const [minted, setMinted] = useState<Minted | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let stale = false

    void createSharedConfig(JSON.parse(serialized) as SeedPayload).then(
      (result) => {
        if (stale) return
        setMinted({ key: serialized, id: result.ok ? result.id : null })
      }
    )

    return () => {
      stale = true
    }
  }, [open, serialized])

  const copied = copiedKey === serialized

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopiedKey(null), COPIED_DECAY_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const command: InstallCommand =
    minted?.key !== serialized
      ? { status: "minting" }
      : minted.id === null
        ? { status: "failed" }
        : { status: "ready", id: minted.id }

  const text =
    command.status === "ready"
      ? `${BASE_COMMAND} ${ID_FLAG} ${command.id}`
      : BASE_COMMAND

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(serialized)
    } catch {
      // Permissions or focus refused it. The command is on screen and
      // selectable either way, so there is nothing to recover from.
    }
  }

  return { command, copied, copy, text }
}
