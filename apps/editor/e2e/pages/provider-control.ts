import type { Locator, Page } from "@playwright/test"

// Step 01's provider cards: a radiogroup, because an install has exactly one
// provider. Scoped to `main`, so a provider control elsewhere cannot answer for
// it. `option` names are not `exact`, which in Playwright is a case-insensitive
// substring match: `codex` finds a card named `Codex` whatever else it reads.
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
