import type { Locator, Page } from "@playwright/test"

/**
 * The Claude | Codex control on the configure screen.
 *
 * A RADIOGROUP, not a pair of toggles, and that is the claim rather than a
 * locator's convenience: an installation belongs to exactly one provider, so
 * the row is one choice among two — the same reading `packages/ui`'s
 * `segmented.tsx` already takes for install mode and install scope, and the
 * reason those rows carry `aria-checked` instead of `aria-pressed`. A spec
 * asking "which provider is this?" is therefore asking the accessibility tree,
 * and a control that made the two independently pressable would fail here
 * before any assertion about the command ran.
 *
 * NAMED "Provider" AND MATCHED CASE-INSENSITIVELY. Three other radiogroups are
 * on the screen at once — the skills hinge's `Show only selected skills`, and
 * `Install mode` and `Scope` inside every skill cell — so the group's name is
 * what tells this one from those. The segment labels are matched without
 * `exact`, which is Playwright's case-insensitive whole-string match: whether
 * the words are drawn `claude` or `Claude` is a design decision, and pinning it
 * here would make a capitalisation change read as a broken provider.
 */
export class ProviderControl {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.getByRole("radiogroup", { name: "Provider" })
  }

  /** One segment, by the provider it selects. */
  option(provider: "claude" | "codex"): Locator {
    return this.root.getByRole("radio", { name: provider })
  }

  /**
   * Whichever segment is on — the question "what is this configuration for?"
   * asked without naming an answer.
   *
   * `aria-checked` rather than a class, for the reason every other state read
   * in this directory goes through the tree: a control that looks chosen and
   * announces nothing is a defect worth failing on.
   */
  get chosen(): Locator {
    return this.root.locator('[aria-checked="true"]')
  }

  async choose(provider: "claude" | "codex") {
    await this.option(provider).click()
  }
}
