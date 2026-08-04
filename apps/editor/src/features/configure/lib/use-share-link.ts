import { useEffect, useState } from "react"

import { track } from "@/lib/analytics/track"
import { createSharedConfig } from "@/lib/api/configs"
import { toSeedPayload } from "./seed"

import type { ConfigSelection } from "./derive"

export type ShareState = "idle" | "sharing" | "copied" | "failed"

const RESET_DELAY_MS = 2_000

// The URL form is what the browser round trip wants; presenting the id as a
// CLI command is the Share destination's job.
const shareUrl = (id: string) =>
  `${location.origin}/?fromId=${encodeURIComponent(id)}`

// One button's lifecycle: serialize → store remotely → copy the link. Both
// terminal states read as words on the button itself and decay back to idle,
// so the panel needs no other feedback surface.
export const useShareLink = (config: ConfigSelection) => {
  const [state, setState] = useState<ShareState>("idle")

  useEffect(() => {
    if (state !== "copied" && state !== "failed") return

    const timer = setTimeout(() => setState("idle"), RESET_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state])

  const share = async () => {
    setState("sharing")

    const result = await createSharedConfig(toSeedPayload(config))
    track({ name: "share_result", ok: result.ok })

    if (!result.ok) {
      setState("failed")
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl(result.id))
      setState("copied")
    } catch {
      // The config is stored; only the copy was refused (permissions, focus).
      setState("failed")
    }
  }

  return { state, share }
}
