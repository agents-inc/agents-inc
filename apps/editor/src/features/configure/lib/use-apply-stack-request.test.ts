import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  STORED_PAYLOAD,
} from "@workspace/api-mocks"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StackRequest } from "@/stores/ui-store"

// Persist reads its slot at import, so the browser stands before it; then the
// public catalogue's saved configuration is read, as the editor reads it once
// its catalogue is seated.
const onThePublicCatalogue = async () => {
  const held = new Map<string, string>()

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => {
        held.set(key, value)
      },
      removeItem: (key: string) => {
        held.delete(key)
      },
    },
  })

  vi.resetModules()
  const { readSavedConfig } = await import("@/stores/config-store")
  await readSavedConfig()

  const { stackSwitchCost } = await import("./use-apply-stack-request")
  return stackSwitchCost
}

const ACCOUNT_STACK_ELSEWHERE: StackRequest = {
  kind: "remote",
  configId: MARKETPLACE_IMPORT_ID,
}

// What the grid has read of an account's stacks before any read answered.
const NOTHING_READ = { payloads: {}, failedReads: [] }

// Mirrored, not imported: a rendering assertion keeps its literal.
const OPENS_ITS_OWN = `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it. Your current setup stays saved with the public catalogue and reopens when you load it again.`

// An account's payload is read after the grid draws, so the question can be
// asked before the stack's marketplace is known.
describe("what the switch question says of a stack", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is still reading an account's stack whose payload has not arrived", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, NOTHING_READ)
    ).toStrictEqual({
      kind: "unread",
    })
  })

  it("names the marketplace once the payload arrives, and says the setup on screen stays saved", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, NOTHING_READ)
    ).toStrictEqual({
      kind: "unread",
    })
    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, {
        payloads: { [MARKETPLACE_IMPORT_ID]: MARKETPLACE_PAYLOAD },
        failedReads: [],
      })
    ).toStrictEqual({ kind: "elsewhere", consequence: OPENS_ITS_OWN })
  })

  it("replaces what is on screen for an account's stack built on the marketplace on screen", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(
        { kind: "remote", configId: STORED_ID },
        { payloads: { [STORED_ID]: STORED_PAYLOAD }, failedReads: [] }
      )
    ).toStrictEqual({ kind: "replaces" })
  })

  // Only an account's stack waits on a read.
  it("never reads a catalogue stack as unread", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost({ kind: "stack", stackId: null }, NOTHING_READ)
    ).toStrictEqual({ kind: "replaces" })
  })

  it("could not read an account's stack whose read failed", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, {
        payloads: {},
        failedReads: [MARKETPLACE_IMPORT_ID],
      })
    ).toStrictEqual({ kind: "failed" })
  })

  // The payload is the answer: it arrived, whatever an earlier read said.
  it("names the marketplace of a payload that arrived beside a failed read of it", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, {
        payloads: { [MARKETPLACE_IMPORT_ID]: MARKETPLACE_PAYLOAD },
        failedReads: [MARKETPLACE_IMPORT_ID],
      })
    ).toStrictEqual({ kind: "elsewhere", consequence: OPENS_ITS_OWN })
  })

  // Another stack's failed read says nothing about this one.
  it("is still reading an account's stack when only another stack's read failed", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ELSEWHERE, {
        payloads: {},
        failedReads: [STORED_ID],
      })
    ).toStrictEqual({ kind: "unread" })
  })
})
