import {
  SIGNED_IN_SESSION,
  STORED_ID,
  STORED_PAYLOAD,
  savedStack,
  signedInHandlers,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { beforeEach, describe, expect, it } from "vitest"

import { useAccountStore } from "@/stores/account-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"

import { saveStack } from "./save-stack"

const NAME = "Weekday"

beforeEach(() => {
  useAccountStore.setState({ session: null, stacks: [], listRefusal: null })
  useSavedStackStore.setState({ saves: [], owed: [] })
})

// Every request a save made, so a spec can say it posted nothing.
const requestsDuring = async <T>(save: () => Promise<T>) => {
  const seen: string[] = []
  const listen = ({ request }: { request: Request }) => {
    seen.push(`${request.method} ${request.url}`)
  }
  configMockServer.events.on("request:start", listen)
  const outcome = await save()
  configMockServer.events.removeListener("request:start", listen)
  return { outcome, seen }
}

describe("saveStack", () => {
  it("keeps the stack in this browser for a visitor who is signed out", async () => {
    expect(await saveStack(NAME, STORED_PAYLOAD)).toMatchObject({ ok: true })

    expect(
      useSavedStackStore.getState().saves.map((save) => save.name)
    ).toStrictEqual([NAME])
    expect(useAccountStore.getState().stacks).toStrictEqual([])
  })

  it("saves it to the account for a visitor who is signed in, leaving this browser's saves alone", async () => {
    configMockServer.use(...signedInHandlers)
    useAccountStore.setState({ session: SIGNED_IN_SESSION })

    expect(await saveStack(NAME, STORED_PAYLOAD)).toMatchObject({ ok: true })

    expect(useAccountStore.getState().stacks).toStrictEqual([
      savedStack(NAME, STORED_ID),
    ])
    expect(useSavedStackStore.getState().saves).toStrictEqual([])
  })
})

// Owner ruling, 2026-10-24: while the account's list is unread, the name may
// be one it holds, so Save waits for a read. The signed-in save above is the
// allowed case.
describe("saveStack while the account's list could not be read", () => {
  for (const listRefusal of ["refused", "unreachable"] as const) {
    it(`posts nothing, and keeps nothing in this browser, after a read that was ${listRefusal}`, async () => {
      configMockServer.use(...signedInHandlers)
      useAccountStore.setState({ session: SIGNED_IN_SESSION, listRefusal })

      const { outcome, seen } = await requestsDuring(() =>
        saveStack(NAME, STORED_PAYLOAD)
      )

      expect(outcome.ok).toBe(false)
      expect(seen).toStrictEqual([])
      expect(useAccountStore.getState().stacks).toStrictEqual([])
      expect(useSavedStackStore.getState().saves).toStrictEqual([])
    })
  }
})
