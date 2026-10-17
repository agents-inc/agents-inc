import { useEffect, useState } from "react"

import { track } from "@/lib/analytics/track"
import { createSharedConfig } from "@/lib/api/configs"
import { summarize } from "./derive"
import { toSeedPayload } from "./seed"

import type { ConfigSelection } from "./derive"
import type { ShareRefusal } from "@/lib/api/configs"

type ShareState = "idle" | "sharing" | "copied" | "failed"

const RESET_DELAY_MS = 2_000

// A report decays once read; a word naming something to do must stay.
export type ShareNarration = {
  state: ShareState
  label: string
  decays: boolean
}

// `copy-refused` is its own ending: the link is real, only the clipboard write
// was turned down.
type ShareOutcome = ShareRefusal | "copied" | "copy-refused"

export const SHARE_NARRATIONS = {
  copied: { state: "copied", label: "Link copied", decays: true },
  "copy-refused": {
    state: "failed",
    label: "Link made, copy refused",
    decays: true,
  },
  // A stale bundle fails on every click until reloaded, so this must not decay.
  "out-of-date": {
    state: "failed",
    label: "Out of date — reload",
    decays: false,
  },
  refused: { state: "failed", label: "Sharing failed", decays: true },
  unreachable: { state: "failed", label: "Offline — try again", decays: true },
  // Refused identically until a marked row changes, so this must not decay.
  unwritable: {
    state: "failed",
    label: "Scope conflict — fix marked rows",
    decays: false,
  },
} as const satisfies Record<ShareOutcome, ShareNarration>

const RESTING = {
  state: "idle",
  label: "Share",
  decays: false,
} as const satisfies ShareNarration

const IN_FLIGHT = {
  state: "sharing",
  label: "Sharing…",
  decays: false,
} as const satisfies ShareNarration

// Built, so the router's `basepath` never rewrites it: `BASE_URL` (Vite's
// `base`, with its trailing slash) supplies the prefix.
const shareUrl = (id: string) =>
  `${location.origin}${import.meta.env.BASE_URL}?fromId=${encodeURIComponent(id)}`

const copyOutcome = async (id: string): Promise<ShareOutcome> => {
  try {
    await navigator.clipboard.writeText(shareUrl(id))
    return "copied"
  } catch {
    return "copy-refused"
  }
}

export const useShareLink = (config: ConfigSelection) => {
  const [narration, setNarration] = useState<ShareNarration>(RESTING)

  // An early affordance, not the protection: `createSharedConfig` refuses an
  // unwritable pair this misses.
  const blocked = summarize(config).unscopedAgentCount > 0

  useEffect(() => {
    if (!narration.decays) return

    const timer = setTimeout(() => setNarration(RESTING), RESET_DELAY_MS)
    return () => clearTimeout(timer)
  }, [narration])

  const share = async () => {
    if (blocked) return
    setNarration(IN_FLIGHT)

    const result = await createSharedConfig(toSeedPayload(config))
    const outcome = result.ok ? await copyOutcome(result.id) : result.refusal

    track({ name: "share_result", outcome })
    setNarration(SHARE_NARRATIONS[outcome])
  }

  return {
    state: narration.state,
    label: narration.label,
    share,
    blocked,
  }
}
