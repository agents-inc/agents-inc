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
import { HttpResponse, http, type PathParams } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { useAccountStore } from "./account-store"
import { useSavedStackStore } from "./saved-stack-store"

import type { SeedPayload } from "@workspace/matrix"

// Driven through `refresh` and `save`, since the grid reads the store's answer.

const NEXT_JS = "Next.js"

const local = (name: string, payload: SeedPayload) => ({
  id: `local-${name}`,
  name,
  payload,
})

// Newest first, as the store keeps them.
const withLocalSaves = (...saves: ReturnType<typeof local>[]) =>
  useSavedStackStore.setState({ saves })

const answer = () => {
  const { stacks, unadopted } = useAccountStore.getState()
  return { stacks, unadopted }
}

// Ahead of `signedInHandlers`, so it outranks the fixture's own list.
const accountHolding = (stacks: readonly unknown[]) =>
  configMockServer.use(
    http.get(STACKS_URL, () => HttpResponse.json(stacks)),
    ...signedInHandlers
  )

// A reload: only the list changes, so the recorded writes stay ahead of it.
const accountNowLists = (stacks: readonly unknown[]) =>
  configMockServer.use(http.get(STACKS_URL, () => HttpResponse.json(stacks)))

const SERVICE_UNAVAILABLE = 503

// Every write adoption could make, recorded rather than blocked: the store's
// `stacks` reads the same whether a duplicate was minted or not. `named` holds
// the names stored; a name in `refusing` is answered 503.
const recordWrites = (refusing: ReadonlySet<string> = new Set()) => {
  const posted: string[] = []
  const named: string[] = []

  configMockServer.use(
    http.post(CONFIGS_URL, () => {
      posted.push(CONFIGS_URL)
      return HttpResponse.json({ id: STORED_ID })
    }),
    http.post<PathParams, { name: string; configId: string }>(
      STACKS_URL,
      async ({ request }) => {
        const { name, configId } = await request.json()
        posted.push(STACKS_URL)
        if (refusing.has(name))
          return new HttpResponse(null, { status: SERVICE_UNAVAILABLE })

        named.push(name)
        return HttpResponse.json(savedStack(name, configId), { status: 201 })
      }
    )
  )

  return { posted, named }
}

beforeEach(() => {
  useAccountStore.setState({
    session: null,
    stacks: [],
    unadopted: {},
    ready: false,
  })
  useSavedStackStore.setState({ saves: [], owed: [] })
})

describe("adopting local saves at first sign-in", () => {
  it("carries every save into an empty account, oldest first, under its own name", async () => {
    accountHolding([])
    const { named } = recordWrites()
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))

    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["A", "B"])
    expect(answer().unadopted).toStrictEqual({})
  })

  it("lists every adopted save as the account's", async () => {
    accountHolding([])
    recordWrites()
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))

    await useAccountStore.getState().refresh()

    expect(
      answer()
        .stacks.map((stack) => stack.name)
        .sort()
    ).toStrictEqual(["A", "B"])
  })

  it("keeps a save the account will not take, and adopts the rest", async () => {
    accountHolding([])
    const { named } = recordWrites()
    const refused = local("A", OUT_OF_SCOPE_PAYLOAD)
    withLocalSaves(local("B", STORED_PAYLOAD), refused)

    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["B"])
    expect(answer().unadopted).toStrictEqual({ [refused.id]: "unwritable" })
  })

  it("names every refused save", async () => {
    accountHolding([])
    const { posted } = recordWrites()
    const first = local("A", OUT_OF_SCOPE_PAYLOAD)
    const second = local("B", OUT_OF_SCOPE_PAYLOAD)
    withLocalSaves(second, first)

    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([])
    expect(answer()).toStrictEqual({
      stacks: [],
      unadopted: { [first.id]: "unwritable", [second.id]: "unwritable" },
    })
  })

  it("has nothing to say with no local saves", async () => {
    accountHolding([])
    const { posted } = recordWrites()

    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([])
    expect(answer()).toStrictEqual({ stacks: [], unadopted: {} })
  })
})

describe("an account that already has stacks", () => {
  // Not attempted is not adopted: the refusal is read off the payload, free.
  it("recomputes each save's refusal without uploading", async () => {
    accountHolding(SAVED_STACKS)
    const { posted } = recordWrites()
    const refused = local("A", OUT_OF_SCOPE_PAYLOAD)
    withLocalSaves(local("B", STORED_PAYLOAD), refused)

    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([])
    expect(answer()).toStrictEqual({
      stacks: SAVED_STACKS,
      unadopted: { [refused.id]: "unwritable" },
    })
  })

  it("answers nothing for saves the contract would accept", async () => {
    accountHolding(SAVED_STACKS)
    withLocalSaves(local("A", STORED_PAYLOAD))

    await useAccountStore.getState().refresh()

    expect(answer()).toStrictEqual({ stacks: SAVED_STACKS, unadopted: {} })
  })
})

// The notice promises "it will be carried over next time", and next time the
// account is no longer empty.
describe("a save a first sign-in could not carry", () => {
  const firstSignInRefusing = async (refusing: Set<string>) => {
    accountHolding([])
    const writes = recordWrites(refusing)
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
    await useAccountStore.getState().refresh()
    return writes
  }

  it("is still kept after a reload while the account refuses it", async () => {
    await firstSignInRefusing(new Set(["A"]))

    accountNowLists([savedStack("B")])
    await useAccountStore.getState().refresh()

    expect(answer().unadopted).toStrictEqual({ "local-A": "refused" })
  })

  it("is carried over on the next load once the account takes it", async () => {
    const refusing = new Set(["A"])
    const { named } = await firstSignInRefusing(refusing)

    refusing.delete("A")
    accountNowLists([savedStack("B")])
    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["B", "A"])
    expect(answer()).toStrictEqual({
      stacks: [savedStack("A"), savedStack("B")],
      unadopted: {},
    })
  })

  // Q10: neither written under a name the account holds, nor forgotten.
  it("stays owed, unwritten, once the account lists its name", async () => {
    const { posted } = await firstSignInRefusing(new Set(["A"]))
    posted.length = 0

    accountNowLists([savedStack("B"), savedStack(" a ")])
    await useAccountStore.getState().refresh()

    expect(posted).toStrictEqual([])
    expect(useSavedStackStore.getState().owed).toStrictEqual(["local-A"])
  })

  it("carries the owed saves whose names are free, and keeps the one that clashes", async () => {
    const refusing = new Set(["A", "B"])
    const { named } = await firstSignInRefusing(refusing)
    refusing.clear()

    accountNowLists([savedStack("a")])
    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["B"])
    expect(useSavedStackStore.getState().owed).toStrictEqual(["local-A"])
  })

  it("leaves a save made since then alone", async () => {
    const { named } = await firstSignInRefusing(new Set())
    withLocalSaves(
      local("C", STORED_PAYLOAD),
      ...useSavedStackStore.getState().saves
    )

    accountNowLists([savedStack("A"), savedStack("B")])
    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["A", "B"])
    expect(answer().unadopted).toStrictEqual({})
  })
})

describe("signing out", () => {
  it("drops the refusals, since every local save is drawn anyway", async () => {
    accountHolding([])
    withLocalSaves(local("A", OUT_OF_SCOPE_PAYLOAD))
    await useAccountStore.getState().refresh()

    configMockServer.resetHandlers()
    await useAccountStore.getState().refresh()

    expect(answer()).toStrictEqual({ stacks: [], unadopted: {} })
  })
})

// EDITOR-73: a save of a different selection does not reach a local save, so
// it must not clear that save's refusal.
describe("a save landing beside a refusal", () => {
  it("leaves the refusal standing and adds the row", async () => {
    accountHolding([])
    const refused = local("A", OUT_OF_SCOPE_PAYLOAD)
    withLocalSaves(refused)
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer()).toStrictEqual({
      stacks: [savedStack(NEXT_JS, STORED_ID)],
      unadopted: { [refused.id]: "unwritable" },
    })
  })

  it("adds the row and reports nothing when there was no refusal", async () => {
    accountHolding([])
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer()).toStrictEqual({
      stacks: [savedStack(NEXT_JS, STORED_ID)],
      unadopted: {},
    })
  })
})
