import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { afterEach, describe, expect, it } from "vitest"

import { activeMarketplace, useCatalogStore } from "@/stores/catalog-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"

import { droppedNotice, parkedNotice, seatCatalog } from "./seat-catalog"

// Every request a seat made, so a spec can say it asked GitHub nothing.
const requestsDuring = async (seat: () => Promise<unknown>) => {
  const seen: string[] = []
  const listen = ({ request }: { request: Request }) => {
    seen.push(request.url)
  }
  configMockServer.events.on("request:start", listen)
  await seat()
  configMockServer.events.removeListener("request:start", listen)
  return seen
}

afterEach(() => {
  useCatalogStore.getState().reset()
  useMarketplaceStore.setState({ current: "", saved: {} })
})

describe("seatCatalog", () => {
  it("seats a payload's marketplace under its canonical ref", async () => {
    expect(await seatCatalog(MARKETPLACE_REF)).toBeNull()

    expect(activeMarketplace()).toBe(MARKETPLACE_CANONICAL_REF)
  })

  it("asks GitHub nothing for the marketplace already seated", async () => {
    await seatCatalog(MARKETPLACE_REF)

    expect(
      await requestsDuring(() => seatCatalog(MARKETPLACE_REF))
    ).toStrictEqual([])
  })

  // Keyed by marketplace: only the token filed under that repository is spent.
  it("reaches a private marketplace with the token this browser filed under it", async () => {
    useMarketplaceStore
      .getState()
      .remember(PRIVATE_MARKETPLACE_CANONICAL_REF, MARKETPLACE_TOKEN)

    expect(await seatCatalog(PRIVATE_MARKETPLACE_REF)).toBeNull()

    expect(activeMarketplace()).toBe(PRIVATE_MARKETPLACE_CANONICAL_REF)
  })

  it("answers with the failure, under the canonical ref, for a marketplace it cannot read", async () => {
    expect(await seatCatalog(PRIVATE_MARKETPLACE_REF)).toStrictEqual({
      marketplace: PRIVATE_MARKETPLACE_CANONICAL_REF,
      failure: {
        ok: false,
        kind: "unauthorized",
        error:
          "acme/private-skills could not be read (404) — if it is private, a token with repo access will reach it",
      },
    })
    expect(activeMarketplace()).toBeNull()
  })

  it("goes back to the public catalogue for a payload naming no marketplace", async () => {
    await seatCatalog(MARKETPLACE_REF)

    expect(await seatCatalog(undefined)).toBeNull()

    expect(activeMarketplace()).toBeNull()
  })

  // Re-seating would drop this session's added skills.
  it("leaves the public catalogue seated as it was when it is already seated", async () => {
    const before = useCatalogStore.getState()

    await seatCatalog(undefined)

    expect(useCatalogStore.getState()).toBe(before)
  })
})

describe("parkedNotice", () => {
  it("says what was not applied, from where, and how to finish", () => {
    expect(parkedNotice("This link", MARKETPLACE_CANONICAL_REF)).toBe(
      `This link's skills come from ${MARKETPLACE_CANONICAL_REF}, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.`
    )
  })
})

describe("droppedNotice", () => {
  it("says nothing when nothing was dropped", () => {
    expect(droppedNotice([])).toBeNull()
  })

  it("names every dropped id against the public catalogue", () => {
    expect(droppedNotice(["acme-web-widgets", "acme-api-gateway"])).toBe(
      "Not in the public catalogue, so not applied: acme-web-widgets, acme-api-gateway."
    )
  })

  it("names the marketplace seated when one is", async () => {
    await seatCatalog(MARKETPLACE_REF)

    expect(droppedNotice(["web-framework-react"])).toBe(
      `Not in ${MARKETPLACE_CANONICAL_REF}, so not applied: web-framework-react.`
    )
  })
})
