import type { Locator, Page } from "@playwright/test"

// Base UI's names, not the app's: the live region and each toast in it.
const REGION_NAME = "Notifications"
const CLOSE_NAME = "Close"

// Each toast is a non-modal dialog named by its message.
export class Toasts {
  readonly region: Locator
  readonly all: Locator

  constructor(page: Page) {
    this.region = page.getByRole("region", { name: REGION_NAME })
    this.all = this.region.getByRole("dialog")
  }

  named(message: string): Locator {
    return this.region.getByRole("dialog", { name: message, exact: true })
  }

  // Base UI hides the ✕ from the accessibility tree until the toasts are
  // hovered or focused, so the live region reads the message alone.
  closeButton(message: string): Locator {
    return this.named(message).getByRole("button", { name: CLOSE_NAME })
  }

  async close(message: string) {
    await this.named(message).hover()
    await this.closeButton(message).click()
  }
}
