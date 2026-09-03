import { useEffect, useState } from "react"

import { track } from "@/lib/analytics/track"
import { createSharedConfig } from "@/lib/api/configs"
import { summarize } from "./derive"
import { toSeedPayload } from "./seed"

import type { ConfigSelection } from "./derive"
import type { ShareRefusal } from "@/lib/api/configs"

// Not exported: the panel reads the state off what the hook returns, and
// nothing outside this module has had a reason to name it since the label
// table beside the markup was deleted.
type ShareState = "idle" | "sharing" | "copied" | "failed"

const RESET_DELAY_MS = 2_000

/**
 * What the button says, and whether the words go away on their own.
 *
 * The two travel together because one decides the other. A word that reports
 * what happened is noise once it has been read, so it decays; a word that names
 * something to DO has to still be there when the person looks up from the
 * console they opened. Flattening every ending into "Sharing failed" for two
 * seconds is precisely why the stale-tab defect (SERVER-04) reached the tracker
 * as a screenshot of a 400 rather than as a report of what the app said.
 */
export type ShareNarration = {
  state: ShareState
  label: string
  decays: boolean
}

/**
 * Every way one click can END — the refusals the client hands back, plus the
 * clipboard step that only happens once a link exists.
 *
 * `copy-refused` is on this list rather than folded into a failure because the
 * config IS stored by then: the id is minted and the link is real, and only the
 * write to the clipboard was turned down (permissions, an unfocused tab). The
 * button used to say "Sharing failed" for it, which was the one thing it said
 * that was simply untrue.
 */
type ShareOutcome = ShareRefusal | "copied" | "copy-refused"

/**
 * The whole vocabulary, in one place and keyed by outcome, so a new ending
 * cannot reach the button without someone choosing its words: `Record` makes
 * an unlisted member a type error rather than a blank label.
 */
export const SHARE_NARRATIONS = {
  copied: { state: "copied", label: "Link copied", decays: true },
  "copy-refused": {
    state: "failed",
    label: "Link made, copy refused",
    decays: true,
  },
  // The only ending that names an action, and the only one that must not
  // decay. This tab is running a bundle from before the last deploy, so it
  // fails identically on every click until the page is reloaded — a word that
  // vanishes after two seconds leaves the user exactly where the console
  // screenshot found them.
  "out-of-date": {
    state: "failed",
    label: "Out of date — reload",
    decays: false,
  },
  refused: { state: "failed", label: "Sharing failed", decays: true },
  unreachable: { state: "failed", label: "Offline — try again", decays: true },
  // The second ending that names an action, and the second that must not decay.
  // It reaches this button only when `blocked` did not see the pair coming, so
  // the marked rows the label points at are on screen already — and the click
  // will be refused identically until one of them changes.
  unwritable: {
    state: "failed",
    label: "Scope conflict — fix marked rows",
    decays: false,
  },
} as const satisfies Record<ShareOutcome, ShareNarration>

// Not outcomes, so not in the table above: nothing ENDED at either of them.
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

// The URL form is what the browser round trip wants; presenting the id as a
// CLI command is the Share destination's job.
//
// THE ONE URL IN THIS APP THE ROUTER CANNOT REACH. `basepath` in
// routes/router.tsx rewrites everything navigated to; this is BUILT, so it was
// the one link that kept pointing at the origin root when the editor moved to
// `agentsinc.sh/editor` — minting `agentsinc.sh/?fromId=…`, which lands the
// recipient on the landing page with the shared configuration silently
// dropped. Nothing would have reported that: the recipient sees a working
// page, just the wrong one.
//
// `import.meta.env.BASE_URL` rather than a second `/editor/` literal. It IS
// `base` from vite.config.ts, so the prefix is stated once for the whole app
// and this link cannot drift from where the app is actually served. It carries
// its own trailing slash.
const shareUrl = (id: string) =>
  `${location.origin}${import.meta.env.BASE_URL}?fromId=${encodeURIComponent(id)}`

// Runs only once a link exists, which is what makes a refusal here its own
// ending rather than an error to fold in with the ones above.
const copyOutcome = async (id: string): Promise<ShareOutcome> => {
  try {
    await navigator.clipboard.writeText(shareUrl(id))
    return "copied"
  } catch {
    return "copy-refused"
  }
}

// One button's lifecycle: serialize → store remotely → copy the link. The
// button itself is the only feedback surface the panel has, so what it says is
// decided here — one narration per ending — rather than by a label table beside
// the markup that can only see the coarse state.
export const useShareLink = (config: ConfigSelection) => {
  const [narration, setNarration] = useState<ShareNarration>(RESTING)

  // A link is only worth minting if the CLI can install it, and
  // `seedToWizardResult` THROWS on a project skill assigned to a sub-agent
  // resting at global — so a link minted from one of those fails on the
  // RECIPIENT, which is worse than no link at all (EDITOR-08).
  //
  // An AFFORDANCE, and no longer the protection. It answers a different
  // question from the write contract and answers it earlier: how many
  // SUB-AGENTS are one scope word from resolving, which is the number the
  // marked rows, the notice above the grid and the Install button all state.
  // The contract counts PAIRS and cannot see the catalogue, so it could never
  // produce that sentence — and being the only guard is what made it a second
  // implementation of a rule instead of a reading of it (CLI-851).
  //
  // What it derives is genuinely shared: `summarize` reaches the contract's own
  // `isSeedScopePairWritable` through `reachesAgent`. What it does NOT share is
  // which pairs the rule is asked about, so `createSharedConfig` refuses
  // anything this misses rather than letting it cost a write.
  //
  // Owned here rather than by the button, so the disabled state and the refusal
  // below are one value instead of two expressions that could drift.
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

    // Reported as the ending the button narrates, which is also what makes the
    // two agree: this line stops compiling the moment an outcome exists that
    // `share_result` has no member for.
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
