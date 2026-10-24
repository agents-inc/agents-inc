import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  STORED_PAYLOAD,
} from "@workspace/api-mocks"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StackRequest } from "@/stores/ui-store"

// Persist reads its slot at import, so the browser stands before it.
const inAFreshBrowser = () => {
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
}

// The public catalogue's saved configuration read, as the editor reads it once
// its catalogue is seated.
const onThePublicCatalogue = async () => {
  inAFreshBrowser()
  const { readSavedConfig } = await import("@/stores/config-store")
  await readSavedConfig()

  const { stackSwitchCost } = await import("./use-apply-stack-request")
  return stackSwitchCost
}

// As the opening leaves it when the stored marketplace's catalogue does not
// load: Acme chosen, its saved configuration not read.
const withAcmesRestoreParked = async () => {
  inAFreshBrowser()
  const { readSavedConfig, savedConfigurationOnScreen } =
    await import("@/stores/config-store")
  const { useCatalogStore } = await import("@/stores/catalog-store")
  const { useMarketplaceStore } = await import("@/stores/marketplace-store")
  const { stackSwitchCost } = await import("./use-apply-stack-request")

  useMarketplaceStore.getState().remember(MARKETPLACE_CANONICAL_REF, "")

  // What the parked restore runs once Acme's catalogue loads.
  const finishRestore = async () => {
    useCatalogStore
      .getState()
      .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)
    await readSavedConfig()
  }

  const facts = () => ({
    chosen: useMarketplaceStore.getState().current,
    read: savedConfigurationOnScreen(),
  })

  return { stackSwitchCost, finishRestore, facts }
}

// As `?fromId=` opens a link built on Acme in a browser that chose the public
// catalogue: its own saved configurations held, the link's catalogue seated.
const withAnAcmeLinkOpen = async () => {
  inAFreshBrowser()
  const { detachSavedConfig, isSharedConfigurationOpen } =
    await import("@/stores/config-store")
  const { activeMarketplace, useCatalogStore } =
    await import("@/stores/catalog-store")
  const { useMarketplaceStore } = await import("@/stores/marketplace-store")
  const { stackSwitchCost } = await import("./use-apply-stack-request")

  detachSavedConfig()
  useCatalogStore
    .getState()
    .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)

  const facts = () => ({
    chosen: useMarketplaceStore.getState().current,
    linkOpen: isSharedConfigurationOpen(),
    onScreen: activeMarketplace(),
  })

  return { stackSwitchCost, facts }
}

const ACCOUNT_STACK_ON_ACME: StackRequest = {
  kind: "remote",
  configId: MARKETPLACE_IMPORT_ID,
}

const ACCOUNT_STACK_ON_PUBLIC: StackRequest = {
  kind: "remote",
  configId: STORED_ID,
}

// What the grid has read of an account's stacks before any read answered.
const NOTHING_READ = { payloads: {}, failedReads: [] }

const BOTH_READ = {
  payloads: {
    [MARKETPLACE_IMPORT_ID]: MARKETPLACE_PAYLOAD,
    [STORED_ID]: STORED_PAYLOAD,
  },
  failedReads: [],
}

// Mirrored, not imported: a rendering assertion keeps its literal.
const OPENS_ITS_OWN = `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it. Your current setup stays saved with the public catalogue and reopens when you load it again.`
const OPENS_ITS_OWN_UNREAD = `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it. What is on screen is not saved.`
const OPENS_THE_PUBLIC_ONE_OVER_A_LINK =
  "Switching opens the public catalogue, and this stack replaces the configuration saved with it. This shared one is not saved here; its link still opens it."

// An account's payload is read after the grid draws, so the question can be
// asked before the stack's marketplace is known.
describe("what the switch question says of a stack", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is still reading an account's stack whose payload has not arrived", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(stackSwitchCost(ACCOUNT_STACK_ON_ACME, NOTHING_READ)).toStrictEqual({
      kind: "unread",
    })
  })

  it("names the marketplace once the payload arrives, and says the setup on screen stays saved", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(stackSwitchCost(ACCOUNT_STACK_ON_ACME, NOTHING_READ)).toStrictEqual({
      kind: "unread",
    })
    expect(
      stackSwitchCost(ACCOUNT_STACK_ON_ACME, {
        payloads: { [MARKETPLACE_IMPORT_ID]: MARKETPLACE_PAYLOAD },
        failedReads: [],
      })
    ).toStrictEqual({ kind: "elsewhere", consequence: OPENS_ITS_OWN })
  })

  it("replaces what is on screen for an account's stack built on the marketplace on screen", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ON_PUBLIC, {
        payloads: { [STORED_ID]: STORED_PAYLOAD },
        failedReads: [],
      })
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
      stackSwitchCost(ACCOUNT_STACK_ON_ACME, {
        payloads: {},
        failedReads: [MARKETPLACE_IMPORT_ID],
      })
    ).toStrictEqual({ kind: "failed" })
  })

  // The payload is the answer: it arrived, whatever an earlier read said.
  it("names the marketplace of a payload that arrived beside a failed read of it", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ON_ACME, {
        payloads: { [MARKETPLACE_IMPORT_ID]: MARKETPLACE_PAYLOAD },
        failedReads: [MARKETPLACE_IMPORT_ID],
      })
    ).toStrictEqual({ kind: "elsewhere", consequence: OPENS_ITS_OWN })
  })

  // Another stack's failed read says nothing about this one.
  it("is still reading an account's stack when only another stack's read failed", async () => {
    const stackSwitchCost = await onThePublicCatalogue()

    expect(
      stackSwitchCost(ACCOUNT_STACK_ON_ACME, {
        payloads: {},
        failedReads: [STORED_ID],
      })
    ).toStrictEqual({ kind: "unread" })
  })

  // The stored choice names the marketplace a restore WILL read; the question
  // asks which saved configuration WAS read. Each state below holds the two
  // apart, and each guards that it does before asking.
  describe("while the saved configuration on screen is not the stored choice", () => {
    it("opens the stored marketplace's own configuration for a stack built on it while its restore waits", async () => {
      const { stackSwitchCost, facts } = await withAcmesRestoreParked()
      expect(facts()).toStrictEqual({
        chosen: MARKETPLACE_CANONICAL_REF,
        read: null,
      })

      expect(stackSwitchCost(ACCOUNT_STACK_ON_ACME, BOTH_READ)).toStrictEqual({
        kind: "elsewhere",
        consequence: OPENS_ITS_OWN_UNREAD,
      })
    })

    // The control: the same stack once the restore has read Acme's own.
    it("replaces what is on screen for that stack once the restore has read its configuration", async () => {
      const { stackSwitchCost, finishRestore, facts } =
        await withAcmesRestoreParked()
      await finishRestore()
      expect(facts()).toStrictEqual({
        chosen: MARKETPLACE_CANONICAL_REF,
        read: MARKETPLACE_CANONICAL_REF,
      })

      expect(stackSwitchCost(ACCOUNT_STACK_ON_ACME, BOTH_READ)).toStrictEqual({
        kind: "replaces",
      })
    })

    it("replaces the shared configuration on screen for a stack built on the link's marketplace", async () => {
      const { stackSwitchCost, facts } = await withAnAcmeLinkOpen()
      expect(facts()).toStrictEqual({
        chosen: "",
        linkOpen: true,
        onScreen: MARKETPLACE_CANONICAL_REF,
      })

      expect(stackSwitchCost(ACCOUNT_STACK_ON_ACME, BOTH_READ)).toStrictEqual({
        kind: "replaces",
      })
    })

    // Beside it, in the same state: the marketplace this browser chose is
    // elsewhere while the link is open.
    it("opens this browser's own configuration for a stack built on the marketplace it chose", async () => {
      const { stackSwitchCost, facts } = await withAnAcmeLinkOpen()
      expect(facts()).toStrictEqual({
        chosen: "",
        linkOpen: true,
        onScreen: MARKETPLACE_CANONICAL_REF,
      })

      expect(stackSwitchCost(ACCOUNT_STACK_ON_PUBLIC, BOTH_READ)).toStrictEqual(
        {
          kind: "elsewhere",
          consequence: OPENS_THE_PUBLIC_ONE_OVER_A_LINK,
        }
      )
    })
  })
})
