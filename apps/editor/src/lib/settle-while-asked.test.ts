import { describe, expect, it, vi } from "vitest"

import { settleWhileAsked } from "./settle-while-asked"

const deferred = <T>() => {
  let answer!: (value: T) => void
  const question = new Promise<T>((resolve) => {
    answer = resolve
  })
  return { question, answer }
}

describe("settling an answer while it is still asked", () => {
  it("settles an answer that arrives before the cleanup", async () => {
    const { question, answer } = deferred<string>()
    const settle = vi.fn()

    settleWhileAsked(() => question, settle)
    answer("in time")
    await question

    expect(settle).toHaveBeenCalledWith("in time")
  })

  it("drops an answer that arrives after the cleanup", async () => {
    const { question, answer } = deferred<string>()
    const settle = vi.fn()

    const stopAsking = settleWhileAsked(() => question, settle)
    stopAsking()
    answer("late")
    await question

    expect(settle).not.toHaveBeenCalled()
  })
})
