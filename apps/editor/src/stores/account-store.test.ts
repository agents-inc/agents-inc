import {
  CONFIGS_URL,
  OUT_OF_SCOPE_PAYLOAD,
  SAVED_STACKS,
  STACKS_URL,
  STORED_ID,
  STORED_PAYLOAD,
  savedStack,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { useAccountStore } from "./account-store"
import { SAVED_STACK_NAME, useSavedStackStore } from "./saved-stack-store"

import type { SeedPayload } from "@workspace/matrix"

// EDITOR-73. `unadopted` is the reason this browser's snapshot is not in the
// account, and the defect it closes was a LIFETIME rather than a value: the
// reason was produced correctly at sign-in and then dropped by the next
// unrelated save, and never recomputed after it — so the local slot left the
// grid one Save after EDITOR-67 put it there.
//
// Driven through `refresh` and `save` rather than against `adoptLocalStack`,
// which is not exported and should not be: what the grid reads is the store's
// answer, and a test of the private step could go on passing while the answer
// the component sees changed underneath it.

// What the grid is deciding between, in the one line it decides it on. Kept
// here so a rename of the field is a compile error in this file rather than a
// spec that silently stops asserting anything.
// A name that is NOT the local slot's, which is the whole point of both saves
// below: the defect was `save` reading "a save landed" as "this browser's
// snapshot reached the account".
const NEXT_JS = "Next.js"

const answer = () => {
  const { stacks, unadopted } = useAccountStore.getState()
  return { stacks, unadopted }
}

const withSavedSlot = (payload: SeedPayload) =>
  useSavedStackStore.setState({ saved: payload })

// This person's stacks, ahead of `signedInHandlers` so it outranks the two the
// fixture list otherwise answers with — the order `use()` matches in.
const accountHolding = (stacks: readonly unknown[]) =>
  configMockServer.use(
    http.get(STACKS_URL, () => HttpResponse.json(stacks)),
    ...signedInHandlers
  )

// Every write the adoption path could make, recorded rather than blocked. A
// branch that must not upload is only pinned by watching the wire: the store's
// own `stacks` looks identical whether a duplicate was minted or not, because
// the list is re-read from the worker either way.
const recordWrites = () => {
  const posted: string[] = []

  configMockServer.use(
    http.post(CONFIGS_URL, () => {
      posted.push(CONFIGS_URL)
      return HttpResponse.json({ id: STORED_ID })
    }),
    http.post(STACKS_URL, () => {
      posted.push(STACKS_URL)
      return HttpResponse.json(savedStack(SAVED_STACK_NAME), { status: 201 })
    })
  )

  return posted
}

beforeEach(() => {
  useAccountStore.setState({
    session: null,
    stacks: [],
    unadopted: null,
    ready: false,
  })
  useSavedStackStore.setState({ saved: null })
})

describe("a snapshot the account will not take", () => {
  // THE REFUSED HALF at first sign-in — EDITOR-67's claim, restated here as the
  // premise everything below stands on rather than re-proved.
  it("holds the reason when the mint is refused against an empty account", async () => {
    accountHolding([])
    withSavedSlot(OUT_OF_SCOPE_PAYLOAD)

    await useAccountStore.getState().refresh()

    expect(answer()).toStrictEqual({ stacks: [], unadopted: "unwritable" })
  })

  // THE SAME QUESTION ONE LOAD LATER, which is what a reload after any save
  // looks like: the account is no longer empty, so adoption is not attempted —
  // and "not attempted" used to be answered as `null`, which is what made the
  // loss permanent for the session.
  it("recomputes the reason on a load where the account already has stacks", async () => {
    accountHolding(SAVED_STACKS)
    withSavedSlot(OUT_OF_SCOPE_PAYLOAD)

    await useAccountStore.getState().refresh()

    expect(answer()).toStrictEqual({
      stacks: SAVED_STACKS,
      unadopted: "unwritable",
    })
  })

  // And recomputing it costs nothing and writes nothing. The rule it must not
  // break is the one that put the early return there: somebody with stacks has
  // been here before, and re-uploading their slot on every load would breed
  // duplicates. The reason is read off the payload, not off a request.
  it("uploads nothing while recomputing it", async () => {
    accountHolding(SAVED_STACKS)
    const posted = recordWrites()
    withSavedSlot(OUT_OF_SCOPE_PAYLOAD)

    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([])
  })

  // Which says nothing without this one. A recorder that observes no request at
  // all satisfies the assertion above for free, so the same channel is driven
  // in the direction that fills it: an empty account with a snapshot the
  // contract accepts mints the config and writes the row, in that order.
  it("uploads the snapshot when the account is empty and takes it", async () => {
    accountHolding([])
    const posted = recordWrites()
    withSavedSlot(STORED_PAYLOAD)

    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([CONFIGS_URL, STACKS_URL])
  })

  // THE PERMITTED HALF, and the refused ones above say nothing without it: a
  // store that had simply stopped clearing `unadopted` would satisfy every
  // assertion so far and keep a local slot the account is already holding.
  it("answers nothing for a snapshot the contract would accept", async () => {
    accountHolding(SAVED_STACKS)
    withSavedSlot(STORED_PAYLOAD)

    await useAccountStore.getState().refresh()

    expect(answer()).toStrictEqual({ stacks: SAVED_STACKS, unadopted: null })
  })
})

describe("a save landing beside a refusal", () => {
  // THE ROW THIS EXISTS FOR. `save` used to clear `unadopted` here, on the
  // premise that a save is this browser's work reaching the account — which it
  // is not, when what was saved is a different selection. The snapshot is
  // untouched by a signed-in save (`roster-panel.tsx` writes the local slot
  // only while signed out), so the reason it is not in the account is untouched
  // too.
  it("leaves the reason standing when the save is a different selection", async () => {
    accountHolding([])
    withSavedSlot(OUT_OF_SCOPE_PAYLOAD)
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer().unadopted).toBe("unwritable")
    // The row still arrives — the refusal is about the snapshot, and holding it
    // must not cost the save that was actually made.
    expect(answer().stacks).toStrictEqual([savedStack(NEXT_JS, STORED_ID)])
  })

  // THE PERMITTED HALF: a save with nothing refused stays exactly as it was.
  it("adds the row and reports nothing when there was no refusal", async () => {
    accountHolding([])
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer().unadopted).toBeNull()
    expect(answer().stacks).toStrictEqual([savedStack(NEXT_JS, STORED_ID)])
  })
})
