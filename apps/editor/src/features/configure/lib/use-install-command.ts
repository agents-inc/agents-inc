import { useEffect, useMemo, useState } from "react"

import { seedPayloadSchema } from "@workspace/matrix"

import { createSharedConfig } from "@/lib/api/configs"
import { useCatalogStore } from "@/stores/catalog-store"
import { toSeedPayload } from "./seed"

import type { ConfigSelection } from "./derive"

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
  // The seat's own two facts, subscribed rather than read once. A payload is
  // stamped with the marketplace it can be resolved against and the version it
  // was minted on, and `toSeedPayload` takes both off whichever catalogue is
  // seated — so the serialisation below depends on them exactly as it depends
  // on the selection.
  const marketplace = useCatalogStore((state) => state.marketplace)
  const version = useCatalogStore((state) => state.version)

  // The selection's identity changes on every render; its *serialisation* does
  // not. Keying on the string is what stops the dialog re-minting in a loop.
  const serialized = useMemo(
    () => JSON.stringify(toSeedPayload(config)),
    // The two above are load-bearing and are deliberately not read here.
    // `toSeedPayload` reads the seat itself — as every derivation that touches
    // a catalogue does — so these dependencies are what re-mint the payload
    // when the catalogue underneath it is swapped. Without them a marketplace
    // that moved under an unchanged selection stamps the ref the ids were
    // picked on rather than the one they will be resolved against, which is
    // the same shape `ConfigureScreen` names for its own derivations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, marketplace, version]
  )

  const [minted, setMinted] = useState<Minted | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let stale = false

    // Round-tripping the memo key rather than calling `toSeedPayload` again is
    // what keeps the sent payload and the cache key provably the same bytes.
    // The parse is what makes the result a `SeedPayload` — `JSON.parse` returns
    // `any`, and an assertion would only have claimed the shape. It throws
    // rather than degrading to `status: "failed"` on purpose: the input is this
    // module's own serializer output, so a rejection is a bug here, not a
    // network condition, and the worker would answer 400 for it anyway.
    void createSharedConfig(
      seedPayloadSchema.parse(JSON.parse(serialized))
    ).then((result) => {
      if (stale) return
      setMinted({ key: serialized, id: result.ok ? result.id : null })
    })

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
