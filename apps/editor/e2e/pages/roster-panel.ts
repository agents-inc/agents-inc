import type { Locator, Page } from "@playwright/test"

// The right column: domain accordions, agents with their assignments inline,
// and the footer pair of buttons. Everything is derived from `assignments` +
// `agents`, so it is the natural place to assert that a change in the grid
// propagated.
export class RosterPanel {
  readonly root: Locator
  readonly heading: Locator
  readonly installButton: Locator
  readonly shareButton: Locator
  readonly saveButton: Locator

  constructor(private page: Page) {
    this.root = page.getByRole("complementary")
    this.heading = this.root.getByText("Sub-agents", { exact: true })
    // Its label carries the counts — `Install 4 sub-agents and 1 skill` — so
    // specs assert the numbers on the button itself.
    this.installButton = this.root.getByRole("button", { name: /^Install / })
    // Its accessible name narrates the share lifecycle ("Share", "Link
    // copied", …), so specs asserting an outcome locate it by that state.
    this.shareButton = this.root.getByRole("button", { name: "Share" })
    // Sits above Share, and snapshots the selection into the stack grid — so
    // like Share it has nothing to offer a selection holding no skills.
    this.saveButton = this.root.getByRole("button", { name: "Save" })
  }

  // The sticky band, named by its whole text: "web 4 of 7".
  domainBand(domainId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^${domainId} \\d+ of \\d+$`),
    })
  }

  domainSection(domainId: string): Locator {
    return this.root.locator("section").filter({
      has: this.page.getByRole("button", {
        name: new RegExp(`^${domainId} \\d+ of \\d+$`),
      }),
    })
  }

  // The agent's own row — colour-only state, exposed as `aria-pressed`.
  agentButton(domainId: string, role: string): Locator {
    return this.domainSection(domainId).getByRole("button", {
      name: role,
      exact: true,
    })
  }

  // The controls right-aligned on the agent's name row. Each is a sibling
  // of the pin button rather than a child of it, so clicking one configures
  // the agent without also flipping it on or off. Their accessible names carry
  // the current value — the model word shows it, the meter only draws it.
  modelWord(agentId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^Model for ${agentId}:`),
    })
  }

  effortMeter(agentId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^Effort for ${agentId}:`),
    })
  }

  // Where this agent's front-matter is written: the project, or the user's own
  // ~/.claude. Named like the other two, since there is no room on the row to
  // write the value out in full.
  scopeControl(agentId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^Scope for ${agentId}:`),
    })
  }

  // One assignment line under one agent, e.g. "React on web-developer".
  skillRow(skillName: string, agentId: string): Locator {
    return this.root.getByRole("button", {
      name: `${skillName} on ${agentId}`,
    })
  }

  // The row's `pre` / `lazy` word; its accessible name carries the full state.
  loadWord(skillName: string, agentId: string): Locator {
    return this.skillRow(skillName, agentId).getByRole("button", {
      name: /^Load mode:/,
    })
  }

  // The error marker on a row whose two scopes cannot meet. A real button, like
  // the options panel's info glyph, so the explanation is reachable without a
  // pointer — and its accessible name IS the explanation.
  scopeError(skillName: string, agentId: string): Locator {
    return this.skillRow(skillName, agentId).getByRole("button", {
      name: /must be set to project scope/,
    })
  }

  whereUsed(skillName: string, agentId: string): Locator {
    return this.skillRow(skillName, agentId).getByRole("button", {
      name: /^Used by /,
    })
  }

  get whereUsedTip(): Locator {
    return this.page.getByRole("tooltip")
  }

  async toggleDomain(domainId: string) {
    await this.domainBand(domainId).click()
  }
}
