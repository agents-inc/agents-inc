import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
} from "../support/catalog"
import {
  OUT_OF_DATE,
  STORED_ID,
  captureCreateConfigBodies,
  stubCreateConfig,
  stubCreateConfigRefusal,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

/**
 * THE PROVIDER IS CHOSEN HERE AND NOWHERE ELSE.
 *
 * The CLI's interactive flow gains no step (D2, superseded twice and settled by
 * the owner: *"this can be a simple button in the web editor. the cli flow
 * itself doesn't need to handle codex, only has to be able to install it using
 * --from etc."*), so this app is the ONLY producer of
 * `npx agents-inc init --from <id> --provider codex`. That is what puts these
 * specs on the feature's critical path rather than on its release checklist.
 *
 * THREE FACTS THE CONTROL HAS TO MAKE TRUE, and each is measured rather than
 * preferred — all three were established by running the pinned
 * `@openai/codex@0.155.1` under a scratch `HOME` and `CODEX_HOME`:
 *
 *   1. A Codex installation offers THREE of the four mode/scope cells. Plugin
 *      installation is machine-wide on Codex — no subcommand takes a scope, and
 *      `codex plugin add` run inside a project writes the switch to the global
 *      config and silently un-scopes it — so `plugin+project` has no mechanism
 *      behind it at all. The CLI refuses a configuration asking for it, by name
 *      (`refuseUnofferedPlacements`). A configuration THIS app produces must
 *      therefore never ask for it, and a user who already chose it has to be
 *      shown what it costs rather than have it quietly rewritten underneath
 *      them — "never fall back to eject" is kept, not overridden (D3).
 *   2. Sixteen of the eighteen sub-agents compile onto Codex. `agent-summoner`
 *      and `skill-summoner` are left out for v1 because their roster mechanics
 *      on Codex are not proven (D8) — and all seventeen shipped stacks list
 *      both, so there is no Codex configuration that avoids the fact. They are
 *      shown disabled WITH the reason rather than hidden (D18): a user toggling
 *      Claude → Codex must not watch two sub-agents vanish unexplained.
 *   3. THE PROVIDER IS NOT IN THE PAYLOAD (ruling 3). It is not a field in
 *      `config.ts`, it is not encoded in the share id, and it does not travel on
 *      the wire — it arrives at the CLI on the COMMAND. That is what keeps one
 *      saved setup installable on either provider and every already-minted share
 *      id working, and it is why the byte-identity spec below is not a nicety.
 *
 * COPY IS MIRRORED, NEVER IMPORTED — the rule `e2e/pages` and
 * `output-preview.spec.ts` both state. Every string below that the product also
 * renders is written out here, because an assertion importing the constant it
 * checks moves with it and can never fail.
 */

const { web } = DOMAINS
const { name: FRAMEWORK, first: REACT } = EXCLUSIVE_CATEGORY

// The same skill as an id rather than a display name, which is the form the
// saved selection and the preview's own rows are keyed by.
const REACT_ID = "web-framework-react"

// What the install command reads on each provider. `STORED_ID` is the double's
// own minted id, which is data rather than copy, so it is the one part of these
// two strings that is composed rather than written out.
const CLAUDE_COMMAND = `npx agents-inc init --from ${STORED_ID}`
const CODEX_COMMAND = `${CLAUDE_COMMAND} --provider codex`

// What the command falls back to when no id could be minted: `init` alone,
// which starts a fresh wizard. Under D15 `--provider` is INVALID without an id
// — `init --provider codex` with no `--from` exits INVALID_ARGS — so the flag
// must not ride along on this one.
const BARE_COMMAND = "npx agents-inc init"

const PROVIDER_FLAG = "--provider"

/**
 * The three cells a Codex installation offers, spelled the way a refusal names
 * them — `${mode}+${scope}`, the same shape `packages/cli`'s own
 * `e2e/fixtures/codex-install.ts` mirrors for the install side.
 *
 * A message that stops naming all three has to redden here: "not supported"
 * leaves the reader to guess which of the remaining cells to ask for, which is
 * exactly the failure `unbackedPluginInstallError` was written against.
 */
const CODEX_OFFERED_CELLS = [
  "plugin+global",
  "eject+global",
  "eject+project",
] as const

/** The fourth cell, which Codex has no mechanism for. */
const CODEX_REFUSED_CELL = "plugin+project"

/**
 * The two sub-agents no Codex install gets, as the roster draws their names —
 * lowercased, because the roster writes `agent.label.toLowerCase()` and the
 * uppercasing is CSS.
 */
const AGENTS_NOT_ON_CODEX = ["agent summoner", "skill summoner"] as const

/**
 * A sub-agent in the SAME roster band that Codex does get.
 *
 * The control for every assertion below about the two that it does not. Without
 * it, "the summoners are disabled on Codex" is equally satisfied by a roster
 * that disabled the whole Meta band, or all eighteen rows.
 */
const AGENT_ON_CODEX = "reviewer"

// Enough of a selection that the roster, the preview and the Install button all
// have something to draw. The same preamble `a11y.spec.ts` gives its audits.
const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

/**
 * A configuration sitting in the cell Codex does not offer, built on Claude
 * where it is perfectly legal.
 *
 * TWO CLICKS, AND THE SECOND IS NOT OPTIONAL: EDITOR-08 blocks Install on a
 * project-scoped skill whose sub-agents still rest at global, and every
 * sub-agent rests at global. `SINGLE_AGENT_SKILL` is the stack's one skill that
 * reaches a single sub-agent, which is what keeps that to one extra click
 * rather than seven — so the state this helper leaves is one that Install is
 * happy with, and the only thing that can block it afterwards is the provider.
 */
const withAProjectScopedPluginSkill = async (configure: ConfigurePage) => {
  await withSelection(configure)

  const skill = configure.skillIn(
    web,
    SINGLE_AGENT_SKILL.category,
    SINGLE_AGENT_SKILL.name
  )
  await skill.flipScope()
  await configure.roster.setScope(SINGLE_AGENT_SKILL.agentId, "project")

  return skill
}

test.describe("the provider control", () => {
  test("rests on Claude before anybody chooses", async ({ configure }) => {
    await expect(configure.provider.chosen).toHaveText(/claude/i)
  })

  // The other half of the same claim, and it is a different one: a row where
  // both segments read as chosen announces one configuration installing onto
  // two hosts, which is not a thing an installation can be.
  test("offers Codex as the alternative rather than as a second switch", async ({
    configure,
  }) => {
    await expect(configure.provider.option("codex")).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(configure.provider.chosen).toHaveCount(1)
  })

  test("moves to Codex when Codex is pressed", async ({ configure }) => {
    await configure.provider.choose("codex")

    await expect(configure.provider.chosen).toHaveText(/codex/i)
  })

  // Mutually exclusive means the choice comes BACK, too. A control that could
  // only be switched one way would leave a visitor who pressed Codex to read a
  // command they cannot undo without reloading the page.
  test("moves back to Claude", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.provider.choose("claude")

    await expect(configure.provider.chosen).toHaveText(/claude/i)
  })

  /**
   * The keyboard, which is the whole reason the row is a radiogroup rather than
   * two buttons: a radio row is ONE tab stop and the arrows move within it, so
   * a visitor reaches the control in one press instead of walking past both
   * halves of it. `moveToAdjacentRadio` in `packages/ui/src/lib/radio-row.ts`
   * is what implements that, and this is the assertion that it is wired here.
   */
  test("changes with the arrow keys once it has focus", async ({
    configure,
    page,
  }) => {
    await configure.provider.option("claude").focus()
    await page.keyboard.press("ArrowRight")

    await expect(configure.provider.chosen).toHaveText(/codex/i)
  })
})

test.describe("the command the app prints", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    // Opening the dialog mints an id, so the worker has to be answering before
    // the dialog is opened.
    stubCreateConfig(page)
    await withSelection(configure)
  })

  test("carries no provider flag on Claude", async ({ configure }) => {
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await expect(configure.installDialog.root).not.toContainText(PROVIDER_FLAG)
  })

  test("names Codex once Codex is chosen", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()
  })

  // The flag goes after the id, not before it, because the id is what the
  // reader is being handed and the provider is a qualifier on it — and because
  // the CLI's own fixture pairs them that way.
  test("copies the whole command, provider flag and all", async ({
    configure,
    page,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    await configure.installDialog.command(BARE_COMMAND).click()

    await expect(configure.installDialog.root).toContainText("copied")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      CODEX_COMMAND
    )
  })

  // Switching back has to take the flag off again. A command that acquired
  // `--provider codex` and kept it would install a Codex tree for somebody who
  // went to look and changed their mind.
  test("drops the flag again when the choice goes back to Claude", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.provider.choose("claude")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await expect(configure.installDialog.root).not.toContainText(PROVIDER_FLAG)
  })
})

/**
 * D15: `--provider` IS INVALID WITHOUT `--from`.
 *
 * `init --provider codex` with no id exits INVALID_ARGS, naming `--from` and
 * this editor — which is what makes "the interactive flow is Claude-only"
 * provable rather than conventional. So the mint-failed fallback, which is bare
 * `npx agents-inc init`, cannot take the flag: appending it would hand someone
 * whose worker is down a command that exits non-zero instead of one that starts
 * a wizard.
 *
 * And the absence has to be EXPLAINED, or the Codex visitor reads a Claude
 * command and finds out on their own machine.
 */
test.describe("the command when no id could be minted", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfigRefusal(page, OUT_OF_DATE)
    await withSelection(configure)
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
  })

  test("stays bare rather than carrying a flag the CLI would refuse", async ({
    configure,
  }) => {
    // The block's WHOLE text, not a substring of it: `command()` matches by
    // `hasText`, so a block reading `… --from <id> --provider codex` satisfies
    // a search for `npx agents-inc init` just as well as a bare one does.
    await expect(configure.installDialog.command(BARE_COMMAND)).toHaveText(
      BARE_COMMAND
    )
    await expect(configure.installDialog.root).not.toContainText(
      `${PROVIDER_FLAG} codex`
    )
  })

  test("says that the provider needs the id", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText("--from")
  })
})

/**
 * THE FOLDERS THE DIALOG NAMES, which are three hand-copied strings that no
 * shared constant moves.
 *
 * `install-dialog.tsx` carries a measured refusal to import the path from
 * `@workspace/compile`: a single import puts that package's 124.7 KB chunk on
 * the first-paint path and fails the 344.0 KB budget. Its own docblock says the
 * cost of copying is that the sentence "does not move on its own when Codex
 * lands", and names this suite as what says so. This is that spec.
 */
test.describe("what the install dialog says a Codex install writes", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
  })

  test("names the Codex config pair rather than the Claude one", async ({
    configure,
  }) => {
    await expect(configure.installDialog.root).toContainText(
      ".agents-inc/codex/config.ts"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".agents-inc/claude/config.ts"
    )
  })

  // A project skill on Codex is a committed file at `<repo>/.agents/skills/` —
  // Codex's OWN mechanism for a project skill, reaching the model in that repo
  // and nowhere else with no plugin, no marketplace and no trust entry. It is
  // not `.claude/skills/`, and it is not a degraded fallback.
  //
  // WITH A PROJECT SKILL EJECTED, because the step names an eject folder only
  // for a scope that ejects something: one named for nothing is a folder
  // nothing is copied to. Ejected first and moved second, because Codex has no
  // plugin at project scope to pass through on the way.
  test("names where an ejected skill actually lands", async ({ configure }) => {
    await configure.installDialog.close()
    const skill = configure.skillIn(
      web,
      SINGLE_AGENT_SKILL.category,
      SINGLE_AGENT_SKILL.name
    )
    await skill.setInstallMode("eject")
    await skill.setScope("project")
    await configure.roster.setScope(SINGLE_AGENT_SKILL.agentId, "project")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "into .agents/skills/"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".claude/skills/"
    )
  })

  // And a global one, which lands under the root Codex reads rather than in
  // the repository: `$CODEX_HOME/skills`, which on a clean machine is
  // `~/.codex/skills/`.
  test("names where an ejected global skill lands", async ({ configure }) => {
    await configure.installDialog.close()
    await configure.skillIn(web, FRAMEWORK, REACT).flipInstall()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "into ~/.codex/skills/"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".agents/skills/"
    )
  })

  // And the global half: `$CODEX_HOME`, which on a clean machine is `~/.codex`
  // (D14). `~/.agents/skills` also reaches the model and is deliberately not
  // this — uninstall and doctor have to agree with where Codex reads.
  test("names the global root Codex reads", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText("~/.codex")
    await expect(configure.installDialog.root).not.toContainText("~/.claude")
  })

  /**
   * WHAT A COMPILED SUB-AGENT IS WRITTEN AS, which is a different FILE on the two providers.
   *
   * The step said "sub-agent front-matter" on both until 2026-09-22, and on Codex that named a
   * file nothing writes: a Codex sub-agent is an agent role definition in TOML under
   * `.codex/agents/`, with no front-matter in it. A reader told to look for front-matter after a
   * Codex install finds none, and has no way to tell a naming difference from a failed install.
   */
  test("says role files rather than front-matter", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent role files"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "sub-agent front-matter"
    )
  })

  /**
   * WHAT AN UNTRUSTED PROJECT COSTS, beside the command that installs into one.
   *
   * Measured: an untrusted Codex project install is HALF live. Project skills at `.agents/skills`
   * reach the model with no trust entry and no config file at all, while the role files and plugin
   * enablement are ignored — in total silence, with no warning anywhere. That silence
   * is the reason this is a sentence on screen rather than something the install's own output can
   * be relied on to say, and the difference between a user recognising a silent failure and
   * filing a bug about it.
   */
  test("says what an untrusted project costs", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "only once the project is trusted"
    )
  })
})

/**
 * THE CLAUDE CONTROL FOR THE TWO SENTENCES ABOVE.
 *
 * Both are Codex facts. Drawn on Claude they would be a trust step nobody has to take and a file
 * name that is wrong there instead — so each absence is asserted where its presence is, which is
 * also what keeps "the dialog mentions role files" from being satisfied by a dialog that says it
 * on both.
 */
test.describe("what the install dialog says a Claude install writes", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.roster.installButton.click()
  })

  test("says front-matter rather than role files", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent front-matter"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "sub-agent role files"
    )
  })

  // The dialog's own Claude sentence is the subject guard: an absence read off
  // a dialog that drew nothing is satisfied for free.
  test("says nothing about trusting a project", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent front-matter"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "only once the project is trusted"
    )
  })
})

/**
 * NOTHING ELSE MOVES.
 *
 * The provider decides which folder an install creates and which renderer
 * writes into it. It is a LOCATION parameter, not a configuration value, so
 * pressing it must not touch a single thing the visitor chose — and the cheapest
 * way to say that is to compare the saved selection's own bytes across the
 * press.
 */
test.describe("what choosing Codex does not change", () => {
  test("leaves the saved selection byte-identical", async ({ configure }) => {
    await withSelection(configure)
    const before = await configure.storedConfig()

    await configure.provider.choose("codex")
    await expect(configure.provider.chosen).toHaveText(/codex/i)

    expect(await configure.storedConfig()).toBe(before)
  })

  // Its subject guard. A comparison of two empty slots passes for free, and a
  // visitor who has chosen nothing is the one state where that is what it would
  // be comparing.
  test("compares a selection that was actually saved", async ({
    configure,
  }) => {
    await withSelection(configure)

    expect(await configure.storedConfig()).toContain(REACT_ID)
  })

  test("leaves the skills where they were", async ({ configure }) => {
    await withSelection(configure)
    const skill = configure.skillIn(web, FRAMEWORK, REACT)

    await configure.provider.choose("codex")

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("global")
  })

  /**
   * `leaves the roster's counts alone` WAS HERE, AND IT WAS DEFENDING A BUG. Deleted rather than
   * rewritten (owner ruling 2026-08-19: prefer deleting a claim to rewriting it).
   *
   * It compared the Install button's whole label across the press and required it not to move, on
   * a comment that read: *"The two summoners rest OFF, so dropping them from a Codex install
   * cannot move this number."* Every one of the seventeen shipped stacks staffs both summoners,
   * `Next.js Full-Stack` — this file's own `withSelection` — included. So the button said
   * `11 agents` over an install that writes nine, and this assertion is what held it there.
   * Re-derive the staffing with:
   *
   *     bun -e 'import {MATRIX} from "./packages/matrix/src/read-model/source.ts";
   *       import {expandStack} from "./packages/matrix/src/read-model/stacks.ts";
   *       for (const s of MATRIX.suggestedStacks) { const e = expandStack(s.id);
   *         const on = new Set(Object.values(e.assignmentsBySkill).flat().map(t => t.agentId));
   *         console.log(s.id, on.size, [...on].filter(a => a.endsWith("-summoner")).length) }'
   *
   * What it was reaching for is covered, and covered better, by the two specs directly above —
   * the saved selection's own bytes, and the skills' own cells — plus the byte-identity spec
   * below. What replaces the count half is the next describe block, which asserts the number the
   * button states rather than asserting that it never changes.
   */
})

/**
 * WHAT WOULD INSTALL IS A FACT ABOUT THE CONFIGURATION **AND** THE PROVIDER.
 *
 * A Codex install drops `agent-summoner` and `skill-summoner` whatever the configuration says
 * (D8), and both are staffed by every shipped stack — so a provider-blind count states a number no
 * Codex install produces. It was stating it in two places at once, beside an output preview that
 * had already dropped both.
 *
 * NOTHING BELOW HARDCODES A NUMBER. The roster's own rows are the count, and the claim is that the
 * three surfaces agree about one install: the dialog lists N sub-agents, its footer says N, and the
 * button says N. A spec that recomputed N from the catalogue would be comparing the derivation to
 * itself, and a spec that wrote N out would go stale the day a stack or the roster moved.
 *
 * AND THE NUMBER HAS TO MOVE, which is the second half: three surfaces agreeing on eleven is
 * exactly the bug. So the Claude reading is taken as well, and the two are held apart by the two
 * sub-agents named at the top of this file.
 */
test.describe("how many sub-agents an install writes", () => {
  const openInstall = async (
    configure: ConfigurePage,
    provider: "claude" | "codex"
  ) => {
    await configure.provider.choose(provider)
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
  }

  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
  })

  test("says the same number in the dialog, its footer and the button", async ({
    configure,
  }) => {
    await openInstall(configure, "codex")
    const written = await configure.installDialog.agentRows.count()

    await expect(configure.installDialog.footerNote).toContainText(
      `${written} sub-agents`
    )
    await configure.installDialog.close()
    await expect(configure.roster.installButton).toContainText(
      `${written} agents`
    )
  })

  // The control, and the assertion that the number is the PROVIDER's rather
  // than one shape of arithmetic applied everywhere: Claude writes both
  // summoners, Codex writes neither, and this stack staffs both.
  test("writes two fewer of them on Codex than on Claude", async ({
    configure,
  }) => {
    await openInstall(configure, "claude")
    const onClaude = await configure.installDialog.agentRows.count()
    await configure.installDialog.close()

    await openInstall(configure, "codex")

    expect(await configure.installDialog.agentRows.count()).toBe(onClaude - 2)
  })

  // Which two. Without this the spec above is equally satisfied by an install
  // that dropped any two sub-agents, and the pane would be quietly one row
  // short of the roster with nothing saying why.
  test("names the two it left out rather than dropping them in silence", async ({
    configure,
  }) => {
    await openInstall(configure, "codex")

    for (const summoner of AGENTS_NOT_ON_CODEX) {
      await expect(configure.installDialog.agentsPane).toContainText(summoner)
    }
    await expect(configure.installDialog.agentsPane).toContainText(
      "not installed on Codex"
    )
  })

  // And the other end of it: on Claude they are ordinary rows in the list of
  // what gets written, with no sentence about anything being left out.
  test("lists them as ordinary rows on Claude", async ({ configure }) => {
    await openInstall(configure, "claude")

    for (const summoner of AGENTS_NOT_ON_CODEX) {
      await expect(configure.installDialog.agentsPane).toContainText(summoner)
    }
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "not installed on Codex"
    )
  })
})

/**
 * THE PAYLOAD IS THE SAME BYTES EITHER WAY.
 *
 * Ruling 3 in one assertion. If the provider ever reached the wire — as a
 * field, as a flavour of the id, as anything — then a setup saved on Codex
 * would be a different content address from the same setup saved on Claude, and
 * the promise that one share id installs on either would be gone. It would also
 * take every EXISTING id with it, since those were minted before any of this.
 *
 * The bytes rather than the parsed object, which is why this spec uses a spy of
 * its own: a parse normalises, and "the same payload" is a claim about what left
 * the browser.
 */
test.describe("the payload", () => {
  test("is byte-identical on either provider", async ({ configure, page }) => {
    const bodies = captureCreateConfigBodies(page)
    await withSelection(configure)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await configure.installDialog.close()

    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    // The subject guard, in the middle rather than at the end: without it, two
    // identical bodies are exactly what a provider control that does nothing at
    // all would produce, and this spec would be its loudest defender.
    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()

    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toBe(bodies[0])
  })

  // And the half byte-identity alone cannot carry: two payloads that BOTH named
  // a provider would be identical to each other and wrong about the wire.
  //
  // The quoted token rather than the parsed object, deliberately — this
  // describe's whole subject is what left the browser, and a parse would be
  // asking a different question. No catalogue id contains the word.
  test("carries no provider of its own", async ({ configure, page }) => {
    const bodies = captureCreateConfigBodies(page)
    await withSelection(configure)

    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toContain('"provider"')
  })
})

/**
 * THE CELL CODEX DOES NOT OFFER.
 *
 * Two directions, and they are different guards. Going IN is refused at the
 * control — the app must never produce a configuration asking for
 * `plugin+project`, so the press that would produce one does not take. ARRIVING
 * in it is not refusable, because the visitor may have chosen it on Claude and
 * then switched, and the answer there is to SHOW what it costs and let them
 * resolve it — never to rewrite it underneath them, which would be the "fall
 * back to eject" this product does not do.
 *
 * `aria-disabled` RATHER THAN `disabled`, and it is the reason that decides it:
 * a truly disabled control suppresses pointer events, so the tooltip carrying
 * the reason never opens. The roster's own Install button carries that note in
 * as many words, and the skill cell's incompatible state already takes this
 * route — `aria-disabled` with `title` as the accessible description.
 */
test.describe("a placement Codex does not offer", () => {
  test("refuses the press that would produce it", async ({ configure }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await expect(skill.installMode).toHaveText("plugin")

    await expect(skill.scopeCell("project")).toHaveAttribute(
      "aria-disabled",
      "true"
    )

    // And the press itself, because the attribute is a claim about what is
    // ANNOUNCED and this is the claim about what the app produces. A cell that
    // reads unavailable and still writes the value is the silent version of
    // exactly the defect this guard exists for.
    //
    // FORCED, and that is the assertion above arriving here rather than a way
    // around it: Playwright reads `aria-disabled="true"` as not enabled, so an
    // ordinary `click()` on the very element the line above pins waits out its
    // timeout instead of pressing anything — the two assertions cannot both be
    // made of one element any other way. Forcing dispatches the press the
    // product has to refuse, which is the stronger of the two readings.
    await skill.scopeCell("project").click({ force: true })
    await expect(skill.scope).toHaveText("global")
  })

  // The other way into the same cell: a project skill being switched from
  // eject to plugin. One guard on the scope pair alone would leave this one
  // wide open, and the app would produce the refused cell from the other side.
  test("refuses the press that would produce it from the other side", async ({
    configure,
  }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setInstallMode("eject")
    await skill.setScope("project")

    await expect(skill.installCell("plugin")).toHaveAttribute(
      "aria-disabled",
      "true"
    )

    // Forced for the reason the press above is: the line above pins this cell
    // as `aria-disabled`, which Playwright reads as not enabled.
    await skill.installCell("plugin").click({ force: true })
    await expect(skill.installMode).toHaveText("eject")
  })

  /**
   * THE PERMITTED CASE, in the same file, which is what makes the two above
   * mean anything.
   *
   * A refusal on its own cannot tell a correctly-scoped guard from one that has
   * swallowed its whole domain: a Codex grid that refused EVERY project press
   * would satisfy both specs above while making "install this into my project"
   * unreachable, and `eject+project` is a cell Codex actually offers.
   */
  test("leaves the project press open on a cell Codex does offer", async ({
    configure,
  }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setInstallMode("eject")
    await skill.setScope("project")

    await expect(skill.scope).toHaveText("project")
    await expect(skill.installMode).toHaveText("eject")
  })

  // And the provider control's own half of it: the same press on Claude, where
  // all four cells exist. Without this the guard could be unconditional and
  // every spec above would still be green.
  test("leaves the same press open on Claude", async ({ configure }) => {
    await withSelection(configure)

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setScope("project")

    await expect(skill.scope).toHaveText("project")
    await expect(skill.installMode).toHaveText("plugin")
  })

  test("names the three it does offer, and the one it does not", async ({
    configure,
  }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const refused = configure
      .skillIn(web, FRAMEWORK, REACT)
      .scopeCell("project")
    await expect(refused).toHaveAttribute("aria-disabled", "true")

    const reason = await refused.getAttribute("title")
    expect(reason).toContain(CODEX_REFUSED_CELL)
    for (const offered of CODEX_OFFERED_CELLS) {
      expect(reason).toContain(offered)
    }
  })
})

/**
 * ARRIVING IN IT, which is the case the control cannot prevent: the visitor
 * built a perfectly legal Claude configuration and then changed provider.
 */
test.describe("switching to Codex with that placement already chosen", () => {
  test("says which skill is asking for it, and what Codex offers", async ({
    configure,
  }) => {
    await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")

    await expect(configure.roster.placementNotice).toContainText(
      SINGLE_AGENT_SKILL.name
    )
    for (const offered of CODEX_OFFERED_CELLS) {
      await expect(configure.roster.placementNotice).toContainText(offered)
    }
  })

  // THE HALF THAT IS NOT ALLOWED TO HAPPEN. Ejecting the skill would make the
  // configuration installable and say nothing, and the visitor would find out
  // that their plugin became a copied directory when `update` stopped
  // refreshing it. The cell still reads what they chose.
  test("changes nothing the visitor chose", async ({ configure }) => {
    const skill = await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")

    await expect(configure.roster.placementNotice).toBeVisible()
    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("project")
  })

  /**
   * And it is a BLOCKER, on the one surface that can stop the app producing the
   * configuration: a command carrying `--provider codex` for a payload the CLI
   * refuses is worse than no command, which is word for word EDITOR-08's
   * argument about a share link that fails on the recipient.
   */
  test("refuses to hand over a command the CLI would reject", async ({
    configure,
  }) => {
    await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")

    await expect(configure.roster.installButton).toBeDisabled()
  })

  // Its control, and the pair is the point: the same configuration on Claude
  // installs, so the refusal above belongs to the provider rather than to a
  // project-scoped skill.
  test("installs the same configuration on Claude", async ({ configure }) => {
    await withAProjectScopedPluginSkill(configure)

    await expect(configure.roster.installButton).toBeEnabled()
  })

  test("clears once the skill is ejected", async ({ configure }) => {
    const skill = await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")
    await expect(configure.roster.placementNotice).toBeVisible()

    await skill.setInstallMode("eject")

    await expect(configure.roster.placementNotice).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
  })

  // The other resolution, because the notice names three cells and a visitor
  // may want either of the two that keep the plugin link. Moving the skill to
  // global is the one that does.
  test("clears once the skill moves to global instead", async ({
    configure,
  }) => {
    const skill = await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")
    await expect(configure.roster.placementNotice).toBeVisible()

    await skill.setScope("global")

    await expect(configure.roster.placementNotice).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
  })

  // And going back is a resolution too. The visitor asked a question about
  // Codex and got an answer; taking the question back has to take the block
  // with it, or the panel stays broken for a provider nobody is on.
  test("clears on the way back to Claude", async ({ configure }) => {
    await withAProjectScopedPluginSkill(configure)
    await configure.provider.choose("codex")
    await expect(configure.roster.placementNotice).toBeVisible()

    await configure.provider.choose("claude")

    await expect(configure.roster.placementNotice).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
  })
})

/**
 * THE TWO SUB-AGENTS CODEX DOES NOT GET.
 *
 * Shown disabled with the reason, rather than hidden (D18). Hiding makes every
 * stack's roster silently shorter on one provider and leaves a visitor watching
 * two rows disappear with no explanation — and it would invite a payload that
 * differed by provider, which ruling 3 forbids. The app writes both either way;
 * the CLI drops them at install with one line.
 */
test.describe("the sub-agents Codex leaves out", () => {
  test.beforeEach(async ({ configure }) => {
    await withSelection(configure)
  })

  test("are both named, with the reason, once Codex is chosen", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")

    for (const name of AGENTS_NOT_ON_CODEX) {
      const row = configure.roster.agentNamed(name)
      await expect(row).toHaveAttribute("aria-disabled", "true")
      expect(await row.getAttribute("title")).toMatch(/codex/i)
    }
  })

  // The control, in the same band. Without it "disabled on Codex" is satisfied
  // by a roster that went inert from top to bottom.
  test("leaves the rest of the roster alone", async ({ configure }) => {
    await configure.provider.choose("codex")

    await expect(
      configure.roster.agentNamed(AGENT_ON_CODEX)
    ).not.toHaveAttribute("aria-disabled", "true")
  })

  // And the provider's own half: on Claude they are ordinary rows.
  test("are ordinary rows on Claude", async ({ configure }) => {
    for (const name of AGENTS_NOT_ON_CODEX) {
      await expect(configure.roster.agentNamed(name)).not.toHaveAttribute(
        "aria-disabled",
        "true"
      )
    }
  })

  /**
   * Disabled means INERT, not merely dressed as unavailable.
   *
   * A row that still pins would put a sub-agent into a configuration the Codex
   * install then drops, so the roster and the install would disagree about what
   * is being installed. The press is asserted rather than the attribute alone
   * because a `title` and a grey are what a visitor READS, and neither of them
   * stops a click.
   */
  test("cannot be pinned on while Codex is chosen", async ({ configure }) => {
    await configure.provider.choose("codex")
    const row = configure.roster.agentNamed(AGENTS_NOT_ON_CODEX[0])

    await expect(row).toHaveAttribute("aria-pressed", "false")
    // Forced for the reason the refused cells above are: this row announces
    // itself `aria-disabled`, which Playwright reads as not enabled, so an
    // ordinary press would never be delivered to the handler that refuses it.
    await row.click({ force: true })

    await expect(row).toHaveAttribute("aria-pressed", "false")
  })

  // The same press, on the row beside it that Codex does compile. This is what
  // says the click above reached a live handler and was refused, rather than
  // landing on a roster that had stopped responding entirely.
  test("while the rest of the roster still responds", async ({ configure }) => {
    await configure.provider.choose("codex")
    const row = configure.roster.agentNamed(AGENT_ON_CODEX)

    await expect(row).toHaveAttribute("aria-pressed", "true")
    await row.click()

    await expect(row).toHaveAttribute("aria-pressed", "false")
  })
})

/**
 * THE PREVIEW.
 *
 * The dialog's whole value is that somebody can diff it against a real install
 * and have it survive — so on Codex it has to draw the Codex tree, not the
 * Claude one with different words. The BYTES of each compiled sub-agent are
 * held against `@workspace/compile`'s own renderer in
 * `src/features/configure/lib/codex-in-the-preview.test.ts`, where the renderer
 * can be called directly; what is asserted here is what needs a browser — that
 * the tree the dialog paints follows the provider the visitor chose.
 *
 * The paths are re-derived from the layout rather than taken from the plan's
 * prose: a Codex role file goes to `$CODEX_HOME/agents/<name>.toml` globally and
 * `<repo>/.codex/agents/<name>.toml` in a project, and the config pair goes to
 * `.agents-inc/codex/` under whichever root.
 */
test.describe("the output preview on Codex", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()
  })

  test("draws the Codex source folder", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    expect(paths).toContain("~/.agents-inc/codex/")
    expect(paths).not.toContain("~/.agents-inc/claude/")
  })

  // The control for the negative above, and the reason it is here rather than
  // in `output-preview.spec.ts`: the claim is that the row FOLLOWS the
  // provider, and a claim about a change needs both of its states.
  test("draws the Claude one when Claude is chosen", async ({ configure }) => {
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    expect(paths).toContain("~/.agents-inc/claude/")
    expect(paths).not.toContain("~/.agents-inc/codex/")
  })

  test("draws the sub-agents as Codex agent role files", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    // Named through the path rather than counted: a count cannot tell a swapped
    // row from an unchanged one, and the claim is about WHERE the file lands as
    // much as about what it is called.
    expect(paths).toContain("~/.codex/agents/web-developer.toml")
    expect(paths).not.toContain("~/.claude/agents/web-developer.md")
  })

  // The two that are not there. The assertion is the tree's WHOLE run of role
  // files, so a preview drawing eighteen of them fails here rather than passing
  // a membership check that only ever looked for sixteen.
  test("draws no role file for the two Codex leaves out", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    const roles = paths.filter(
      (path): path is string => path?.endsWith(".toml") === true
    )

    // The subject guard: a tree with no role files at all satisfies the
    // absence below for free, and that is exactly what a preview still drawing
    // Claude markdown would hand it.
    expect(roles).not.toHaveLength(0)
    expect(
      roles.filter(
        (path) =>
          path.endsWith("agent-summoner.toml") ||
          path.endsWith("skill-summoner.toml")
      )
    ).toStrictEqual([])
  })
})
