import { describe, expect, it, vi } from "vitest"

// Throwing factories let the module system say what loads.
const { MSW_ABSENT } = vi.hoisted(() => ({
  MSW_ABSENT: "msw cannot be loaded here",
}))

vi.mock("msw", () => {
  throw new Error(MSW_ABSENT)
})

vi.mock("msw/node", () => {
  throw new Error(MSW_ABSENT)
})

// Vitest wraps a factory's throw, so the reason arrives as `cause`.
// `as unknown` contains the matcher's `any`.
const because = (message: string) => ({
  cause: expect.objectContaining({ message }) as unknown,
})

describe("what ./fixtures costs a consumer", () => {
  it("loads where msw cannot", async () => {
    await expect(import("./fixtures")).resolves.toBeDefined()
  })

  // The control: without it the test above stays green if the mock stops intercepting.
  it("and the handlers beside it do not", async () => {
    await expect(import("./handlers")).rejects.toMatchObject(
      because(MSW_ABSENT)
    )
  })
})
