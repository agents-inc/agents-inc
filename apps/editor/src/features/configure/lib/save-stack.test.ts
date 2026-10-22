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
  useAccountStore.setState({ session: null, stacks: [] })
  useSavedStackStore.setState({ saves: [], owed: [] })
})

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
