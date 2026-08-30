import type { Locator, Page } from "@playwright/test"

// The whole text of each scope-mode band, destination and count together. The
// `~` and the `.` are regex metacharacters, so the two are written out rather
// than built from the paths — a builder would need escaping logic, and logic
// in a page object is logic nothing tests.
//
// The paths appear again, as literals, in the specs that assert on them. That
// duplication is the design and not an oversight: an assertion that imports
// the string its own locator was built from cannot fail, because both halves
// move together. Locating is this file's job; expecting is the spec's.
const SCOPE_BAND_TEXT = {
  global: /^~\/\.claude · global \d+ of \d+$/,
  project: /^\.\/\.claude · project \d+ of \d+$/,
} as const

// The panel header's label. Sentence case in the DOM, uppercased by CSS, so
// this is the text node rather than what is painted — and it is the LOCATOR's
// copy of it, for the reason above.
const ROSTER_HEADER_LABEL = "Sub-agents grouped by"

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
  // The recessed field between Share and Install — "you preview, then you
  // install". Its label is fixed and carries no count, so unlike the three
  // buttons around it this one is located by the whole of its own name.
  readonly previewButton: Locator
  // The grouping control in the panel header, and the flat two-item menu it
  // opens. Located by an `aria-label` rather than by its visible text, because
  // that text is the current VALUE — `domain ▾` says nothing about what the
  // control does, and it changes the moment the control is used.
  readonly groupControl: Locator

  constructor(private page: Page) {
    this.root = page.getByRole("complementary")
    this.heading = this.root.getByText(ROSTER_HEADER_LABEL, { exact: true })
    // Its label carries the counts — `Install 4 sub-agents and 1 skill` — so
    // specs assert the numbers on the button itself.
    this.installButton = this.root.getByRole("button", { name: /^Install / })
    // Its accessible name narrates the share lifecycle ("Share", "Link
    // copied", …), so specs asserting an outcome locate it by that state.
    this.shareButton = this.root.getByRole("button", { name: "Share" })
    // Sits above Share, and snapshots the selection into the stack grid — so
    // like Share it has nothing to offer a selection holding no skills.
    this.saveButton = this.root.getByRole("button", { name: "Save" })
    this.previewButton = this.root.getByRole("button", {
      name: /preview generated code/i,
    })
    this.groupControl = this.root.getByRole("button", {
      name: /^Group sub-agents by/,
    })
  }

  // One row of the grouping menu. The tick beside the active one is decorative
  // — the state is `aria-checked` — so the name is the bare mode.
  groupOption(value: "domain" | "scope"): Locator {
    return this.page.getByRole("menuitemradio", { name: value, exact: true })
  }

  // The sticky band, named by its whole text: "web 4 of 7".
  domainBand(domainId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^${domainId} \\d+ of \\d+$`),
    })
  }

  // The scope-mode band, named by its destination rather than by a domain:
  // "~/.claude · global 13 of 23". Added beside `domainBand` rather than
  // widening it — a regex loose enough to match both would match a band that
  // is neither.
  scopeBand(scope: keyof typeof SCOPE_BAND_TEXT): Locator {
    return this.root.getByRole("button", { name: SCOPE_BAND_TEXT[scope] })
  }

  // The band's own label span. The button spans the panel, so its box says
  // nothing about where its ink starts — and where its ink starts is the 17px
  // flush edge the header, the agent names and the skill bullets all share.
  bandLabel(domainId: string): Locator {
    return this.domainBand(domainId).locator("span").first()
  }

  // The header's trailing rule. A hairline carries no role and no text, so it
  // cannot be reached the way everything else in this file is; it is located
  // as the hinge's last span, with the reason written here — the exception
  // `InstallDialog.sheet` documents, for the same cause.
  get headerRule(): Locator {
    return this.root.locator('[data-slot="hinge"] > span').last()
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

  // The same row reached by its whole name instead of through its band, which
  // is the only way to reach it in scope mode: the band no longer names the
  // domain, so the row does — `web · developer` there, the bare `developer`
  // in domain mode. Asserting the absence of one form needs the other to be
  // reachable over the same locator, or the negative carries nothing.
  agentNamed(name: string): Locator {
    return this.root.getByRole("button", { name, exact: true })
  }

  // The controls right-aligned on the agent's name row. Each is a sibling
  // of the pin button rather than a child of it, so clicking one configures
  // the agent without also flipping it on or off. Their accessible names carry
  // the current value.
  modelWord(agentId: string): Locator {
    return this.root.getByRole("button", {
      name: new RegExp(`^Model for ${agentId}:`),
    })
  }

  effortWord(agentId: string): Locator {
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

  // The assignment line's SELECTION TARGET, e.g. "React on web-developer".
  //
  // Kept as the button because that is what a spec clicks and what carries the
  // row's state. Its container is `skillRowCell`, and the two stopped being the
  // same element on 2026-08-29: EDITOR-58's `nested-interactive` fix made this
  // an overlay button that is a SIBLING of the row's content rather than its
  // wrapper, because a button holding other buttons is unreachable to a screen
  // reader. Anything found INSIDE the row now has to be found from the cell.
  skillRow(skillName: string, agentId: string): Locator {
    return this.root.getByRole("button", {
      name: `${skillName} on ${agentId}`,
    })
  }

  /** What contains that target — the load word, the marker and the count. */
  skillRowCell(skillName: string, agentId: string): Locator {
    return this.skillRow(skillName, agentId).locator("..")
  }

  // The row's `pre` / `lazy` word; its accessible name carries the full state.
  loadWord(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /^Load mode:/,
    })
  }

  // The error marker on a row whose two scopes cannot meet. A real button, like
  // the options panel's info glyph, so the explanation is reachable without a
  // pointer — and its accessible name IS the explanation.
  scopeError(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /must be set to project scope/,
    })
  }

  whereUsed(skillName: string, agentId: string): Locator {
    return this.skillRowCell(skillName, agentId).getByRole("button", {
      name: /^Used by /,
    })
  }

  get whereUsedTip(): Locator {
    return this.page.getByRole("tooltip")
  }

  async toggleDomain(domainId: string) {
    await this.domainBand(domainId).click()
  }

  async groupBy(value: "domain" | "scope") {
    await this.groupControl.click()
    await this.groupOption(value).click()
  }
}
