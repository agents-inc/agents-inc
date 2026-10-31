import {
  CONFIGS_URL,
  OUT_OF_SCOPE_PAYLOAD,
  SAVED_STACKS,
  SIGNED_IN_USER,
  STACKS_URL,
  STORED_ID,
  STORED_PAYLOAD,
  UNAUTHORIZED_BODY,
  savedStack,
  signedInHandlers,
  stackRefusedHandlerFor,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { HttpResponse, http, type PathParams } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { useAccountStore } from "./account-store"
import { useSavedStackStore } from "./saved-stack-store"

import type { ListRefusal, RemoteStack } from "@/lib/api/stacks"
import type { SeedPayload } from "@workspace/matrix"

// Driven through `refresh` and `save`, since the grid reads the store's answer.

const NEXT_JS = "Next.js"

const local = (name: string, payload: SeedPayload) => ({
  id: `local-${name}`,
  name,
  payload,
})

// A row the worker answered a save with: as sent, under an id it minted.
const minted = (name: string, configId?: string) => {
  const row: Record<keyof RemoteStack, unknown> = {
    ...savedStack(name, configId),
    id: expect.any(String),
  }
  return row
}

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
    listRefusal: null,
    payloads: {},
    failedReads: [],
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
    const listed = savedStack("B")

    refusing.delete("A")
    accountNowLists([listed])
    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["B", "A"])
    expect(answer()).toStrictEqual({
      stacks: [minted("A"), listed],
      unadopted: {},
    })
  })

  // Neither written under a name the account holds, nor forgotten.
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

// A list that could not be read says nothing about the account, so it is never
// taken for an empty one.
describe("an account whose list could not be read", () => {
  const serverError = () =>
    new HttpResponse(null, { status: SERVICE_UNAVAILABLE })

  // A worker a release ahead: the account's rows, under a field this build
  // does not know.
  const listThisBuildCannotRead = () =>
    HttpResponse.json(
      SAVED_STACKS.map(({ updatedAt, ...row }) => ({
        ...row,
        modifiedAt: updatedAt,
      }))
    )

  const FAILED_READS = [
    ["a server error", serverError],
    ["no answer at all", () => HttpResponse.error()],
    ["a list this build cannot read", listThisBuildCannotRead],
  ] as const satisfies readonly (readonly [string, () => Response])[]

  // Ahead of `signedInHandlers`, so the session still reads.
  const listFailing = (answer: () => Response) =>
    configMockServer.use(http.get(STACKS_URL, answer), ...signedInHandlers)

  // An earlier sign-in carried both, so neither is owed.
  const carriedEarlier = () =>
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))

  it.each(FAILED_READS)(
    "carries no save into it on %s",
    async (_failure, answer) => {
      listFailing(answer)
      const { posted } = recordWrites()
      carriedEarlier()

      await useAccountStore.getState().refresh()

      expect(posted).toStrictEqual([])
    }
  )

  // Writes that fail too would leave every save owed, and the next good read
  // would ask a new name for stacks the account already holds.
  it("marks no save as still owed, though the account would refuse the writes too", async () => {
    listFailing(serverError)
    recordWrites(new Set(["A", "B"]))
    carriedEarlier()

    await useAccountStore.getState().refresh()

    expect(useSavedStackStore.getState().owed).toStrictEqual([])
  })

  it("asks no new name once the list reads again, listing the saves", async () => {
    listFailing(serverError)
    recordWrites(new Set(["A", "B"]))
    carriedEarlier()
    await useAccountStore.getState().refresh()

    accountNowLists([savedStack("B"), savedStack("A")])
    await useAccountStore.getState().refresh()

    expect(useAccountStore.getState().clashes).toStrictEqual([])
  })

  // Held back, not given up: a first sign-in whose read failed still carries
  // each save once a read finds the account empty.
  it("carries each save once a later read finds the account empty", async () => {
    listFailing(serverError)
    const { named } = recordWrites()
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
    await useAccountStore.getState().refresh()

    accountNowLists([])
    await useAccountStore.getState().refresh()

    expect(named).toStrictEqual(["A", "B"])
  })

  // The rail draws the session once a refresh lands, list or no list.
  it("is ready, and names who is signed in", async () => {
    listFailing(serverError)

    await useAccountStore.getState().refresh()

    const { ready, session } = useAccountStore.getState()
    expect({ ready, name: session?.user.name }).toStrictEqual({
      ready: true,
      name: SIGNED_IN_USER.name,
    })
  })

  // The grid says the list could not be read, with Retry, while the store holds
  // why; a Retry is another refresh.
  describe("why, and a Retry", () => {
    const listRefusal = () => useAccountStore.getState().listRefusal

    const WHY_UNREAD = [
      { failure: "a server error", answer: serverError, refusal: "refused" },
      {
        failure: "no answer at all",
        answer: () => HttpResponse.error(),
        refusal: "unreachable",
      },
      {
        failure: "a list this build cannot read",
        answer: listThisBuildCannotRead,
        refusal: "refused",
      },
    ] as const satisfies readonly {
      failure: string
      answer: () => Response
      refusal: ListRefusal
    }[]

    it.each(WHY_UNREAD)(
      "holds $refusal on $failure",
      async ({ answer, refusal }) => {
        listFailing(answer)

        await useAccountStore.getState().refresh()

        expect(listRefusal()).toBe(refusal)
      }
    )

    it("gives way to the account's stacks on a Retry that reads them, carrying none in", async () => {
      listFailing(serverError)
      const { posted } = recordWrites()
      carriedEarlier()
      await useAccountStore.getState().refresh()
      const before = listRefusal()
      const listed = [savedStack("B"), savedStack("A")]

      accountNowLists(listed)
      await useAccountStore.getState().refresh()

      expect({
        before,
        after: listRefusal(),
        stacks: useAccountStore.getState().stacks,
        posted,
      }).toStrictEqual({
        before: "refused",
        after: null,
        stacks: listed,
        posted: [],
      })
    })

    // Two reads out at once would both find the account empty.
    it("carries each save in once when a Retry is asked for again while one is out", async () => {
      listFailing(serverError)
      const { named } = recordWrites()
      withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
      await useAccountStore.getState().refresh()

      // What has been carried so far, newest first, as the worker lists it.
      configMockServer.use(
        http.get(STACKS_URL, () =>
          HttpResponse.json(named.toReversed().map((name) => savedStack(name)))
        )
      )
      const { refresh } = useAccountStore.getState()
      await Promise.all([refresh(), refresh()])

      expect(named).toStrictEqual(["A", "B"])
    })

    // Signed out, the grid draws every local save and has no list to miss.
    it("is dropped on a sign-out", async () => {
      listFailing(serverError)
      await useAccountStore.getState().refresh()
      const before = listRefusal()

      configMockServer.resetHandlers()
      await useAccountStore.getState().refresh()

      expect({ before, after: listRefusal() }).toStrictEqual({
        before: "refused",
        after: null,
      })
    })
  })

  // The owner's ruling: a list read answering 401 after the session read
  // vouched for one is a session that ended mid-load. That is a list the
  // editor couldn't read, not an empty account; nor is it a sign-out.
  describe("on a session that ended between the sign-in check and the read", () => {
    const UNAUTHORIZED = 401

    const sessionEnded = () =>
      HttpResponse.json(UNAUTHORIZED_BODY, { status: UNAUTHORIZED })

    // A session that ended refuses the writes too. Ahead of `recordWrites`.
    const writesRefusedToo = () =>
      configMockServer.use(stackRefusedHandlerFor(UNAUTHORIZED))

    it("carries no save into it", async () => {
      listFailing(sessionEnded)
      const { posted } = recordWrites()
      carriedEarlier()

      await useAccountStore.getState().refresh()

      expect(posted).toStrictEqual([])
    })

    it("holds why the list could not be read", async () => {
      listFailing(sessionEnded)

      await useAccountStore.getState().refresh()

      expect(useAccountStore.getState().listRefusal).not.toBeNull()
    })

    // Refused writes would leave every save owed, and the next good read
    // would ask a new name for stacks the account already holds.
    it("marks no save as still owed, though the writes are refused too", async () => {
      listFailing(sessionEnded)
      recordWrites()
      writesRefusedToo()
      carriedEarlier()

      await useAccountStore.getState().refresh()

      expect(useSavedStackStore.getState().owed).toStrictEqual([])
    })

    it("asks no new name once the list reads again, listing the saves", async () => {
      listFailing(sessionEnded)
      recordWrites()
      writesRefusedToo()
      carriedEarlier()
      await useAccountStore.getState().refresh()

      accountNowLists([savedStack("B"), savedStack("A")])
      await useAccountStore.getState().refresh()

      expect(useAccountStore.getState().clashes).toStrictEqual([])
    })

    // Held back, not given up, as for any list that could not be read.
    it("carries each save once a later read finds the account empty", async () => {
      listFailing(sessionEnded)
      const { named } = recordWrites()
      withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
      await useAccountStore.getState().refresh()

      accountNowLists([])
      await useAccountStore.getState().refresh()

      expect(named).toStrictEqual(["A", "B"])
    })

    // The allowed case: the choice not taken would drop to the signed-out
    // view.
    it("is ready, and still names who is signed in", async () => {
      listFailing(sessionEnded)

      await useAccountStore.getState().refresh()

      const { ready, session } = useAccountStore.getState()
      expect({ ready, name: session?.user.name }).toStrictEqual({
        ready: true,
        name: SIGNED_IN_USER.name,
      })
    })
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

// A save of a different selection reaches no local save, so it must not clear
// that save's refusal.
describe("a save landing beside a refusal", () => {
  it("leaves the refusal standing and adds the row", async () => {
    accountHolding([])
    const refused = local("A", OUT_OF_SCOPE_PAYLOAD)
    withLocalSaves(refused)
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer()).toStrictEqual({
      stacks: [minted(NEXT_JS, STORED_ID)],
      unadopted: { [refused.id]: "unwritable" },
    })
  })

  it("adds the row and reports nothing when there was no refusal", async () => {
    accountHolding([])
    await useAccountStore.getState().refresh()

    const saved = await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    expect(saved.ok).toBe(true)
    expect(answer()).toStrictEqual({
      stacks: [minted(NEXT_JS, STORED_ID)],
      unadopted: {},
    })
  })
})

describe("the account before anything has been read", () => {
  // `ready` holds the rail's sign-in button back until the first answer.
  it("is not ready and holds no clash", () => {
    const { ready, clashes } = useAccountStore.getInitialState()

    expect({ ready, clashes }).toStrictEqual({ ready: false, clashes: [] })
  })

  it("is ready once a signed-out answer lands", async () => {
    await useAccountStore.getState().refresh()

    expect(useAccountStore.getState().ready).toBe(true)
  })

  it("is ready once a signed-in answer lands", async () => {
    accountHolding([])

    await useAccountStore.getState().refresh()

    expect(useAccountStore.getState().ready).toBe(true)
  })
})

// An owed save whose name the account lists is asked for a new name.
describe("an owed save whose name the account already lists", () => {
  const held = [savedStack("B"), savedStack("A")]

  const owedAndClashing = async (payload: SeedPayload) => {
    accountHolding(held)
    const clashing = local("a", payload)
    withLocalSaves(local("B", STORED_PAYLOAD), clashing)
    useSavedStackStore.setState({ owed: [clashing.id] })
    useAccountStore.setState({ clashes: [] })
    await useAccountStore.getState().refresh()
    return clashing
  }

  it("is asked for a new name", async () => {
    const clashing = await owedAndClashing(STORED_PAYLOAD)

    expect(useAccountStore.getState().clashes).toStrictEqual([clashing.id])
  })

  // The account would refuse it under any name.
  it("is not asked for one when the account would refuse it anyway", async () => {
    await owedAndClashing(OUT_OF_SCOPE_PAYLOAD)

    expect(useAccountStore.getState().clashes).toStrictEqual([])
  })

  it("is carried in under the new name, and owed no longer", async () => {
    const clashing = await owedAndClashing(STORED_PAYLOAD)
    const { named } = recordWrites()

    const carried = await useAccountStore
      .getState()
      .carryRenamed(clashing, "A renamed")

    expect(carried.ok).toBe(true)
    expect(named).toStrictEqual(["A renamed"])
    expect(useAccountStore.getState().stacks).toStrictEqual([
      minted("A renamed"),
      ...held,
    ])
    expect(useAccountStore.getState().clashes).toStrictEqual([])
    expect(useSavedStackStore.getState().owed).toStrictEqual([])
    expect(
      useSavedStackStore.getState().saves.map((save) => save.name)
    ).toStrictEqual(["B", "A renamed"])
  })

  it("stays owed under its old name when the account refuses the new one", async () => {
    const clashing = await owedAndClashing(STORED_PAYLOAD)
    recordWrites(new Set(["A renamed"]))

    const carried = await useAccountStore
      .getState()
      .carryRenamed(clashing, "A renamed")

    expect(carried).toStrictEqual({ ok: false, refusal: "refused" })
    expect(useAccountStore.getState().clashes).toStrictEqual([clashing.id])
    expect(useSavedStackStore.getState().owed).toStrictEqual([clashing.id])
  })

  // Deferred, it is asked again at the next sign-in, not before.
  it("stops being asked about once deferred, while staying owed", async () => {
    const clashing = await owedAndClashing(STORED_PAYLOAD)

    useAccountStore.getState().defer(clashing.id)

    expect(useAccountStore.getState().clashes).toStrictEqual([])
    expect(useSavedStackStore.getState().owed).toStrictEqual([clashing.id])
  })

  it("drops the question on a sign-out", async () => {
    await owedAndClashing(STORED_PAYLOAD)

    configMockServer.resetHandlers()
    await useAccountStore.getState().refresh()

    expect(useAccountStore.getState().clashes).toStrictEqual([])
  })
})

// The owed list is written only on a change: the slot is every tab's.
describe("the owed list a refresh settles", () => {
  it("is left as it was when the refresh changes nothing in it", async () => {
    accountHolding([])
    recordWrites(new Set(["A"]))
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
    await useAccountStore.getState().refresh()
    const owed = useSavedStackStore.getState().owed
    expect(owed).toStrictEqual(["local-A"])

    accountNowLists([savedStack("B")])
    await useAccountStore.getState().refresh()

    expect(useSavedStackStore.getState().owed).toBe(owed)
  })

  it("is rewritten when one id of a list the same length changed", async () => {
    accountHolding([])
    recordWrites(new Set(["A", "B"]))
    withLocalSaves(local("B", STORED_PAYLOAD), local("A", STORED_PAYLOAD))
    useSavedStackStore.setState({ owed: ["local-A", "local-gone"] })

    await useAccountStore.getState().refresh()

    expect(useSavedStackStore.getState().owed).toStrictEqual([
      "local-A",
      "local-B",
    ])
  })
})

describe("two owed saves whose names the account lists", () => {
  const bothClashing = async () => {
    accountHolding([savedStack("A"), savedStack("B")])
    const first = local("a", STORED_PAYLOAD)
    const second = local("b", STORED_PAYLOAD)
    withLocalSaves(second, first)
    useSavedStackStore.setState({ owed: [first.id, second.id] })
    useAccountStore.setState({ clashes: [] })
    await useAccountStore.getState().refresh()
    return { first, second }
  }

  it("keeps asking about the other once one is carried in", async () => {
    const { first, second } = await bothClashing()
    recordWrites()

    await useAccountStore.getState().carryRenamed(first, "A renamed")

    expect(useAccountStore.getState().clashes).toStrictEqual([second.id])
    expect(useSavedStackStore.getState().owed).toStrictEqual([second.id])
  })

  it("keeps asking about the other once one is deferred", async () => {
    const { first, second } = await bothClashing()

    useAccountStore.getState().defer(first.id)

    expect(useAccountStore.getState().clashes).toStrictEqual([second.id])
  })
})

// The grid matches the selection against them, as it does a local save's.
describe("the payload behind each of the account's stacks", () => {
  const MISSING_ID = "gone0001"

  // Each config id the store was asked to read, in order.
  const recordReads = () => {
    const read: string[] = []
    configMockServer.use(
      http.get<{ id: string }>(`${CONFIGS_URL}/:id`, ({ params }) => {
        read.push(params.id)
        return params.id === STORED_ID
          ? HttpResponse.json(STORED_PAYLOAD)
          : HttpResponse.json(null, { status: 404 })
      })
    )
    return read
  }

  const payloads = () => useAccountStore.getState().payloads

  it("is read for every stack the account lists", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    await useAccountStore.getState().refresh()

    await useAccountStore.getState().readPayloads()

    expect(payloads()).toStrictEqual({ [STORED_ID]: STORED_PAYLOAD })
  })

  it("is read once, however many stacks point at it and however often it is asked for", async () => {
    accountHolding([
      savedStack("Weekday", STORED_ID),
      savedStack("Client work"),
    ])
    const read = recordReads()
    await useAccountStore.getState().refresh()

    await useAccountStore.getState().readPayloads()
    await useAccountStore.getState().readPayloads()

    expect(read).toStrictEqual([STORED_ID])
  })

  it("is left out when the store holds nothing under its id, and asked for again next time", async () => {
    accountHolding([savedStack("Weekday", MISSING_ID)])
    const read = recordReads()
    await useAccountStore.getState().refresh()

    await useAccountStore.getState().readPayloads()
    await useAccountStore.getState().readPayloads()

    expect({ payloads: payloads(), read }).toStrictEqual({
      payloads: {},
      read: [MISSING_ID, MISSING_ID],
    })
  })

  it("is read for a stack saved since the last read", async () => {
    accountHolding([])
    await useAccountStore.getState().refresh()
    await useAccountStore.getState().save(NEXT_JS, STORED_ID)

    await useAccountStore.getState().readPayloads()

    expect(payloads()).toStrictEqual({ [STORED_ID]: STORED_PAYLOAD })
  })

  it("is forgotten on a sign-out", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    await useAccountStore.getState().refresh()
    await useAccountStore.getState().readPayloads()

    configMockServer.resetHandlers()
    await useAccountStore.getState().refresh()

    expect(payloads()).toStrictEqual({})
  })
})

// The switch question says a stack could not load only once its read has
// answered with a failure, and shows loading again while it is re-read.
describe("a read of an account's stack that failed", () => {
  const failedReads = () => useAccountStore.getState().failedReads

  // The worker answering this id's GET with 503 until `recover` is called.
  const failingUntilRecovered = (configId: string) => {
    let failing = true
    configMockServer.use(
      http.get(`${CONFIGS_URL}/${configId}`, () =>
        failing
          ? new HttpResponse(null, { status: SERVICE_UNAVAILABLE })
          : HttpResponse.json(STORED_PAYLOAD)
      )
    )
    return () => {
      failing = false
    }
  }

  it("is recorded under its config id", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    failingUntilRecovered(STORED_ID)
    await useAccountStore.getState().refresh()

    await useAccountStore.getState().readPayloads()

    expect({
      payloads: useAccountStore.getState().payloads,
      failedReads: failedReads(),
    }).toStrictEqual({ payloads: {}, failedReads: [STORED_ID] })
  })

  it("is not failed while it is read again, and failed again when that read fails too", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    failingUntilRecovered(STORED_ID)
    await useAccountStore.getState().refresh()
    await useAccountStore.getState().readPayloads()

    const reading = useAccountStore.getState().readPayloads()
    const whileReading = failedReads()
    await reading

    expect({ whileReading, after: failedReads() }).toStrictEqual({
      whileReading: [],
      after: [STORED_ID],
    })
  })

  it("gives way to the payload once a later read succeeds", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    const recover = failingUntilRecovered(STORED_ID)
    await useAccountStore.getState().refresh()
    await useAccountStore.getState().readPayloads()

    recover()
    await useAccountStore.getState().readPayloads()

    expect({
      payloads: useAccountStore.getState().payloads,
      failedReads: failedReads(),
    }).toStrictEqual({
      payloads: { [STORED_ID]: STORED_PAYLOAD },
      failedReads: [],
    })
  })

  it("is forgotten on a sign-out", async () => {
    accountHolding([savedStack("Weekday", STORED_ID)])
    failingUntilRecovered(STORED_ID)
    await useAccountStore.getState().refresh()
    await useAccountStore.getState().readPayloads()

    configMockServer.resetHandlers()
    await useAccountStore.getState().refresh()

    expect(failedReads()).toStrictEqual([])
  })
})
