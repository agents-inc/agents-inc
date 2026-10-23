import {
  BIGCO_CANONICAL_REF,
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  MARKETPLACE_REF,
} from "@workspace/api-mocks"
import { CATALOG, MATRIX, STACKS } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import {
  persistedConfig,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"

import {
  dropsSelection,
  landingOf,
  loadCost,
  stackElsewhere,
  switchConsequence,
  type Leaving,
} from "./marketplace-switch"

// The vendored catalogue holds at least two skills.
const [FIRST, SECOND] = Object.keys(CATALOG.skillsById) as [string, string]

const nameOf = (skillId: string) => CATALOG.skillsById[skillId]!.displayName

describe("switchConsequence", () => {
  // Marketplace ids carry their own name, so a real switch drops everything.
  it("names the skills the target does not carry", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      FIRST,
      SECOND,
    ])

    expect(said).toContain(MARKETPLACE_REF)
    expect(said).toContain("2 of your 2 skills")
    expect(said).toContain(nameOf(FIRST))
    expect(said).toContain(nameOf(SECOND))
  })

  it("counts only what is dropped, against everything selected", () => {
    const target = {
      ...MARKETPLACE_CATALOG,
      skills: { ...MARKETPLACE_CATALOG.skills, [FIRST]: MATRIX.skills[FIRST]! },
    }

    const said = switchConsequence(MARKETPLACE_REF, target, [FIRST, SECOND])

    expect(said).toContain("1 of your 2 skills")
    expect(said).toContain(nameOf(SECOND))
    expect(said).not.toContain(nameOf(FIRST))
  })

  it("says so plainly when the target carries every selected skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MATRIX, [FIRST, SECOND])

    expect(said).toContain("loses nothing")
    expect(said).not.toContain(nameOf(FIRST))
  })

  it("says so plainly when nothing is selected", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [])

    expect(said).toContain("loses nothing")
  })

  it("counts one skill in the singular", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      FIRST,
    ])

    expect(said).toContain("1 of your 1 skill:")
  })

  it("falls back to the id when nothing can name the skill", () => {
    const said = switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [
      "external-web-framework-mystery",
    ])

    expect(said).toContain("external-web-framework-mystery")
  })
})

describe("dropsSelection", () => {
  it("is true when the target cannot carry a selected skill", () => {
    expect(dropsSelection(MARKETPLACE_CATALOG, [FIRST, SECOND])).toBe(true)
  })

  it("is true when the target carries only some of them", () => {
    const target = {
      ...MARKETPLACE_CATALOG,
      skills: { ...MARKETPLACE_CATALOG.skills, [FIRST]: MATRIX.skills[FIRST]! },
    }

    expect(dropsSelection(target, [FIRST, SECOND])).toBe(true)
  })

  it("is false when the target carries every selected skill", () => {
    expect(dropsSelection(MATRIX, [FIRST, SECOND])).toBe(false)
  })

  it("is false for a selection with nothing in it", () => {
    expect(dropsSelection(MARKETPLACE_CATALOG, [])).toBe(false)
  })
})

describe("the sentence switchConsequence says", () => {
  it("lists the dropped skills by name, comma-separated, after the count", () => {
    expect(
      switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [FIRST, SECOND])
    ).toBe(
      `Switching to ${MARKETPLACE_REF} will drop 2 of your 2 skills: ${nameOf(FIRST)}, ${nameOf(SECOND)}.`
    )
  })
})

const STACK_ID = STACKS[0]!.id

// Mirrored, not imported: a rendering assertion keeps its literal.
const OPENS_ITS_OWN = `Switching to ${MARKETPLACE_REF} opens the configuration saved with it, or a new one.`
const STAYS_WITH_BIGCO = `This one stays saved with ${BIGCO_CANONICAL_REF} and reopens when you load it again.`
const LINK_NOT_SAVED =
  "This shared one is not saved here; its link still opens it."
const UNREAD_STAYS_WITH_BIGCO = `What is on screen is not saved; the configuration saved with ${BIGCO_CANONICAL_REF} stays there.`

// Selects something of every kind the screen draws.
const everyKindSelected = () =>
  persistedConfig({
    stackId: STACK_ID,
    skills: { [FIRST]: skillEntry(), [SECOND]: skillEntry() },
    agents: { "web-developer": { on: true } },
  })

const ITS_OWN_ON_BIGCO: Leaving = { kind: "own", name: BIGCO_CANONICAL_REF }

const toAnother = (
  selection = everyKindSelected(),
  leaving: Leaving = ITS_OWN_ON_BIGCO
) => ({
  name: MARKETPLACE_REF,
  catalogue: MARKETPLACE_CATALOG,
  landing: "another" as const,
  selection,
  leaving,
})

describe("landingOf", () => {
  it("lands on another marketplace when it is neither standing nor waited on", () => {
    expect(
      landingOf(BIGCO_CANONICAL_REF, {
        standing: MARKETPLACE_CANONICAL_REF,
        parked: undefined,
      })
    ).toBe("another")
  })

  it("rereads the marketplace the configuration on screen belongs to", () => {
    expect(
      landingOf(MARKETPLACE_CANONICAL_REF, {
        standing: MARKETPLACE_CANONICAL_REF,
        parked: undefined,
      })
    ).toBe("reread")
  })

  // Loading it finishes what was parked rather than replacing it.
  it("finishes what a parked configuration waits on", () => {
    expect(
      landingOf(BIGCO_CANONICAL_REF, {
        standing: "",
        parked: BIGCO_CANONICAL_REF,
      })
    ).toBe("recovery")
  })

  // A saved configuration parked unread stands nowhere yet, so the public
  // catalogue drawn meanwhile is not where it stands.
  it("counts the public catalogue as another from a saved configuration parked unread", () => {
    expect(
      landingOf("", {
        standing: null,
        parked: MARKETPLACE_CANONICAL_REF,
      })
    ).toBe("another")
  })

  // Something else took its place in waiting, so loading it opens its own:
  // nothing of it was read, so there is nothing to read again.
  it("counts the marketplace a saved configuration was parked on as another once it no longer waits on it", () => {
    expect(
      landingOf(MARKETPLACE_CANONICAL_REF, {
        standing: null,
        parked: BIGCO_CANONICAL_REF,
      })
    ).toBe("another")
  })

  it("counts the public catalogue as another from a marketplace", () => {
    expect(
      landingOf("", { standing: MARKETPLACE_CANONICAL_REF, parked: undefined })
    ).toBe("another")
  })

  it("rereads the public catalogue from itself", () => {
    expect(landingOf("", { standing: "", parked: undefined })).toBe("reread")
  })
})

describe("loadCost on another marketplace", () => {
  // Nothing is cleared: the selection stays with the marketplace it was
  // saved with.
  it("says the selection stays saved with its marketplace", () => {
    expect(loadCost(toAnother())).toBe(`${OPENS_ITS_OWN} ${STAYS_WITH_BIGCO}`)
  })

  it("asks over a stack alone", () => {
    expect(loadCost(toAnother(persistedConfig({ stackId: STACK_ID })))).toBe(
      `${OPENS_ITS_OWN} ${STAYS_WITH_BIGCO}`
    )
  })

  it("asks over a sub-agent choice alone", () => {
    expect(
      loadCost(
        toAnother(
          persistedConfig({ agents: { "web-developer": { model: "opus" } } })
        )
      )
    ).toBe(`${OPENS_ITS_OWN} ${STAYS_WITH_BIGCO}`)
  })

  // A shared configuration is saved nowhere in this browser.
  it("says a shared configuration is not saved, and its link still opens it", () => {
    expect(loadCost(toAnother(everyKindSelected(), { kind: "link" }))).toBe(
      `${OPENS_ITS_OWN} ${LINK_NOT_SAVED}`
    )
  })

  // Picked while a saved configuration waits unread, so saved nowhere.
  it("says picks made before the saved configuration was read are not saved", () => {
    expect(
      loadCost(
        toAnother(everyKindSelected(), {
          kind: "unread",
          name: BIGCO_CANONICAL_REF,
        })
      )
    ).toBe(`${OPENS_ITS_OWN} ${UNREAD_STAYS_WITH_BIGCO}`)
  })

  // The control: the press that asked loads it.
  it("costs nothing with nothing selected", () => {
    expect(loadCost(toAnother(persistedConfig()))).toBeNull()
  })

  // No saved configuration is cleared any more, so one out of sight is no
  // reason to ask.
  it("costs nothing with nothing selected on a shared link either", () => {
    expect(loadCost(toAnother(persistedConfig(), { kind: "link" }))).toBeNull()
  })
})

describe("loadCost on the marketplace already there", () => {
  it("names the skills a reread catalogue no longer carries", () => {
    expect(loadCost({ ...toAnother(), landing: "reread" })).toBe(
      switchConsequence(MARKETPLACE_REF, MARKETPLACE_CATALOG, [FIRST, SECOND])
    )
  })

  // Every kind selected, so it is the marketplace and not the selection that
  // keeps this free.
  it("costs nothing while it still carries every selected skill", () => {
    expect(
      loadCost({ ...toAnother(), catalogue: MATRIX, landing: "reread" })
    ).toBeNull()
  })
})

// What was parked replaces the screen, and what it replaces stays where it
// was saved.
describe("loadCost on what a parked configuration waits on", () => {
  it("costs nothing, whatever is selected", () => {
    expect(loadCost({ ...toAnother(), landing: "recovery" })).toBeNull()
  })
})

const REPLACES_ITS_OWN = `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it.`

// Nothing on screen is discarded: the stack opens on its own marketplace.
describe("stackElsewhere", () => {
  it("says the setup on screen stays saved with its marketplace", () => {
    expect(stackElsewhere(MARKETPLACE_CANONICAL_REF, ITS_OWN_ON_BIGCO)).toBe(
      `${REPLACES_ITS_OWN} Your current setup stays saved with ${BIGCO_CANONICAL_REF} and reopens when you load it again.`
    )
  })

  it("says a shared configuration is not saved, and its link still opens it", () => {
    expect(stackElsewhere(MARKETPLACE_CANONICAL_REF, { kind: "link" })).toBe(
      `${REPLACES_ITS_OWN} ${LINK_NOT_SAVED}`
    )
  })

  // The stack may be built on the marketplace whose configuration waits
  // unread, and then that one does not stay.
  it("says only that picks made before a saved configuration was read are not saved", () => {
    expect(
      stackElsewhere(MARKETPLACE_CANONICAL_REF, {
        kind: "unread",
        name: MARKETPLACE_CANONICAL_REF,
      })
    ).toBe(`${REPLACES_ITS_OWN} What is on screen is not saved.`)
  })
})
