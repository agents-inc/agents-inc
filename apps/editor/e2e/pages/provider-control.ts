import type { Locator, Page } from "@playwright/test"

// Step 01's provider radiogroup, scoped to `main`. Option names are
// case-insensitive substring matches.
export class ProviderControl {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page
      .getByRole("main")
      .getByRole("radiogroup", { name: "Provider", exact: true })
  }

  option(provider: "claude" | "codex"): Locator {
    return this.root.getByRole("radio", { name: provider })
  }

  get chosen(): Locator {
    return this.root.locator('[aria-checked="true"]')
  }

  get cards(): Locator {
    return this.root.locator('[data-slot="lattice-cell"]')
  }

  async choose(provider: "claude" | "codex") {
    await this.option(provider).click()
  }
}
