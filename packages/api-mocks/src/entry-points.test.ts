import { describe, expect, it, vi } from "vitest"

// A factory that THROWS rather than a list of package names: a list is a second
// description of the import graph, free to agree with the tree while being
// wrong about what actually loads. Throwing lets the module system answer.
const { MSW_ABSENT } = vi.hoisted(() => ({
  MSW_ABSENT: "msw cannot be loaded here",
}))

vi.mock("msw", () => {
  throw new Error(MSW_ABSENT)
})

vi.mock("msw/node", () => {
  throw new Error(MSW_ABSENT)
})

// Vitest wraps whatever a mock factory throws, so the reason arrives as the
// `cause` rather than as the message.
const because = (message: string) => ({
  cause: expect.objectContaining({ message }) as unknown,
})

describe("what ./fixtures costs a consumer", () => {
  it("loads where msw cannot", async () => {
    await expect(import("./fixtures")).resolves.toBeDefined()
  })

  // The control, and the pair is the point: on its own the assertion above
  // stays green when the mock has stopped intercepting, which is the state in
  // which it proves nothing at all.
  it("and the handlers beside it do not", async () => {
    await expect(import("./handlers")).rejects.toMatchObject(
      because(MSW_ABSENT)
    )
  })
})
