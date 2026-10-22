import { useEffect, useMemo, useState } from "react"

import { seedPayloadSchema } from "@workspace/matrix"

import { createSharedConfig, isRateLimited } from "@/lib/api/configs"
import { useCatalogStore } from "@/stores/catalog-store"
import { useUiStore } from "@/stores/ui-store"
import { toSeedPayload } from "./seed"

import type { Provider } from "@workspace/compile"
import type { ConfigSelection } from "./derive"
import type { ShareRefusal, ShareResult } from "@/lib/api/configs"

const COPIED_DECAY_MS = 2_000

// The fallback when no id can be minted: still valid, just carries nothing.
const BASE_COMMAND = "npx agents-inc init"

const ID_FLAG = "--from"

// Written only for a non-Claude provider, after the id.
const PROVIDER_FLAG = "--provider"

// `--provider` without `--from` exits non-zero, so the bare command says why.
const PROVIDER_NEEDS_AN_ID = "a provider needs --from"

export type InstallCommand =
  | { status: "minting" }
  | { status: "ready"; id: string }
  // The refusal travels: only some have a remedy worth naming.
  | { status: "failed"; refusal: ShareRefusal }
  // Apart from `failed`: the one refusal that ends on its own.
  | { status: "limited"; retryAfterSeconds: number }

type InstallNote = "minting" | "ready" | "copied" | "limited" | ShareRefusal

// Keyed by ending, so a new one cannot reach the dialog without its own words.
export const COMMAND_NOTES = {
  minting: "preparing your id",
  ready: "click to copy",
  copied: "copied",
  "out-of-date": "out of date — reload the page for an id",
  refused: "id unavailable — this command starts over in the editor",
  unreachable: "offline — this command starts over in the editor",
  unwritable: "a sub-agent needs project scope — close and fix the marked rows",
  // `limitReachedNote` appends the worker's window.
  limited: "rate limit reached — try again in",
} as const satisfies Record<InstallNote, string>

const SECONDS_PER_MINUTE = 60

const counted = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`

// Minutes round up, so nobody is sent back early.
const waitOf = (seconds: number) =>
  seconds < SECONDS_PER_MINUTE
    ? counted(seconds, "second")
    : counted(Math.ceil(seconds / SECONDS_PER_MINUTE), "minute")

export const limitReachedNote = (retryAfterSeconds: number) =>
  `${COMMAND_NOTES.limited} ${waitOf(retryAfterSeconds)}`

// Keyed, so `command` and `copied` are derived: a moved selection goes stale by
// comparison.
type Minted = { key: string; result: ShareResult }

// Only an id is kept: a refusal or a limit is asked again on the next opening.
export const isReusable = (minted: Minted | null, key: string): boolean =>
  minted?.key === key && minted.result.ok

const toCommand = (minted: Minted | null, key: string): InstallCommand => {
  if (minted?.key !== key) return { status: "minting" }

  const { result } = minted
  if (result.ok) return { status: "ready", id: result.id }
  if (isRateLimited(result)) {
    return { status: "limited", retryAfterSeconds: result.retryAfterSeconds }
  }

  return { status: "failed", refusal: result.refusal }
}

const withoutAnId = (why: string, provider: Provider) =>
  provider === "claude" ? why : `${why} · ${PROVIDER_NEEDS_AN_ID}`

const noteFor = (
  command: InstallCommand,
  copied: boolean,
  provider: Provider
): string => {
  if (copied) return COMMAND_NOTES.copied

  switch (command.status) {
    case "minting":
    case "ready":
      return COMMAND_NOTES[command.status]
    case "failed":
      return withoutAnId(COMMAND_NOTES[command.refusal], provider)
    case "limited":
      return withoutAnId(limitReachedNote(command.retryAfterSeconds), provider)
    default: {
      const _exhaustive: never = command
      return _exhaustive
    }
  }
}

const commandText = (command: InstallCommand, provider: Provider): string => {
  if (command.status !== "ready") return BASE_COMMAND

  const providerArgs = provider === "claude" ? [] : [PROVIDER_FLAG, provider]
  return [BASE_COMMAND, ID_FLAG, command.id, ...providerArgs].join(" ")
}

// Mints on open, not on copy: the id has to be on screen to be read.
export const useInstallCommand = (config: ConfigSelection, open: boolean) => {
  // Not in `serialized`: the payload is identical on either provider, so a
  // switch must not re-mint.
  const provider = useUiStore((state) => state.provider)
  const marketplace = useCatalogStore((state) => state.marketplace)
  const version = useCatalogStore((state) => state.version)

  // Keyed on the string, or the dialog would re-mint in a loop.
  const serialized = useMemo(
    () => JSON.stringify(toSeedPayload(config)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-mint when the seated catalogue swaps
    [config, marketplace, version]
  )

  const [minted, setMinted] = useState<Minted | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // The dialog stays mounted, so an id minted for this selection is still
  // here when it reopens; the store would answer with the same one.
  const reusable = isReusable(minted, serialized)

  useEffect(() => {
    if (!open || reusable) return
    let stale = false

    // Parsing the memo key keeps the sent payload and cache key the same bytes;
    // a throw here is a bug in this module, not a network condition.
    void createSharedConfig(
      seedPayloadSchema.parse(JSON.parse(serialized))
    ).then((result) => {
      if (stale) return
      setMinted({ key: serialized, result })
    })

    return () => {
      stale = true
      // A refusal answered that opening, so the next one is not shown it.
      setMinted((last) => (last?.result.ok ? last : null))
    }
  }, [open, serialized, reusable])

  const copied = copiedKey === serialized

  useEffect(() => {
    if (!copied) return

    const timer = setTimeout(() => setCopiedKey(null), COPIED_DECAY_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const command = toCommand(minted, serialized)
  const text = commandText(command, provider)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(serialized)
    } catch {
      // Refused; the command is still on screen to select.
    }
  }

  return {
    command,
    copied,
    copy,
    note: noteFor(command, copied, provider),
    text,
  }
}
