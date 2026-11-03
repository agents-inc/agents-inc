import { useEffect, useMemo, useState } from "react"

import { seedPayloadSchema } from "@workspace/matrix"

import { createSharedConfig, isRateLimited } from "@/lib/api/configs"
import { counted } from "@/lib/counted"
import { settleWhileAsked } from "@/lib/settle-while-asked"
import { useCatalogStore } from "@/stores/catalog-store"
import { useHeldGlobalStore } from "@/stores/held-global-store"
import { useUiStore } from "@/stores/ui-store"
import { toSeedPayload } from "./seed"

import type { Provider } from "@workspace/compile"
import type { ConfigSelection } from "./derive"
import type { MintedFrom } from "./held-global"
import type { ShareRefusal, ShareResult } from "@/lib/api/configs"

const COPIED_DECAY_MS = 2_000

// The fallback when no id can be minted: still valid, just carries nothing.
const INIT_COMMAND = "npx agents-inc init"

// `init --from` refuses over the installation a link was minted from.
const EDIT_COMMAND = "npx agents-inc edit"

const ID_FLAG = "--from"

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
  refused:
    "id unavailable — this command opens the editor or shows the installation's dashboard",
  unreachable:
    "offline — this command opens the editor or shows the installation's dashboard",
  unwritable: "a sub-agent needs project scope — close and fix the marked rows",
  // `limitReachedNote` appends the worker's window.
  limited: "rate limit reached — try again in",
} as const satisfies Record<InstallNote, string>

// In the project a link was minted in, a bare `init` meets its installation.
const PROJECT_LINK_NOTES = {
  ...COMMAND_NOTES,
  refused: "id unavailable — this command shows the installation's dashboard",
  unreachable: "offline — this command shows the installation's dashboard",
} as const satisfies Record<InstallNote, string>

const notesFor = (mintedFrom: MintedFrom | null) =>
  mintedFrom === "project" ? PROJECT_LINK_NOTES : COMMAND_NOTES

const SECONDS_PER_MINUTE = 60

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
  provider === "claude" ? [why] : [why, PROVIDER_NEEDS_AN_ID]

const noteFor = (
  command: InstallCommand,
  provider: Provider,
  notes: Record<InstallNote, string>
): string[] => {
  switch (command.status) {
    case "minting":
    case "ready":
      return [notes[command.status]]
    case "failed":
      return withoutAnId(notes[command.refusal], provider)
    case "limited":
      return withoutAnId(limitReachedNote(command.retryAfterSeconds), provider)
    default: {
      const _exhaustive: never = command
      return _exhaustive
    }
  }
}

const commandText = (
  command: InstallCommand,
  provider: Provider,
  appliesTo: MintedFrom | null
): string => {
  if (command.status !== "ready") return INIT_COMMAND

  const installer = appliesTo === null ? INIT_COMMAND : EDIT_COMMAND
  const providerArgs = provider === "claude" ? [] : [PROVIDER_FLAG, provider]
  return [installer, ID_FLAG, command.id, ...providerArgs].join(" ")
}

// Mints on open, not on copy: the id has to be on screen to be read.
export const useInstallCommand = (config: ConfigSelection, open: boolean) => {
  // Not in `serialized`: the payload is identical on either provider, so a
  // switch must not re-mint.
  const provider = useUiStore((state) => state.provider)
  const mintedFrom = useHeldGlobalStore((state) => state.mintedFrom)
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

    // Parsing the memo key keeps the sent payload and cache key the same bytes;
    // a throw here is a bug in this module, not a network condition.
    const stopAsking = settleWhileAsked(
      () => createSharedConfig(seedPayloadSchema.parse(JSON.parse(serialized))),
      (result) => setMinted({ key: serialized, result })
    )

    return () => {
      stopAsking()
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
  // Only a command carrying the id applies the link to an installation.
  const appliesTo = command.status === "ready" ? mintedFrom : null
  const text = commandText(command, provider, appliesTo)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(serialized)
    } catch {
      // Refused; the command is still on screen to select.
    }
  }

  return {
    appliesTo,
    command,
    copied,
    copy,
    note: noteFor(command, provider, notesFor(mintedFrom)),
    text,
  }
}
