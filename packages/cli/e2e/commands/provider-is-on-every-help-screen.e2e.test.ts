import { describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { PROVIDER_CLAUDE, PROVIDER_CODEX } from "../fixtures/codex-install.js";
import { cleanupTempDir, createTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * `--provider` is on the help screen of every command that declares it — the release half of
 * C7b, and the only half of the flag a user can find without being told it exists.
 *
 * **Hidden is not disabled, which is why this claim needs its own file.** oclif parses a hidden
 * flag exactly as it parses any other, so every behavioural spec in
 * `provider-arrives-on-the-command.e2e.test.ts` was green throughout C4-C6 with `hidden: true`
 * on the definition. Nothing those specs assert can tell a shipped flag from an undiscoverable
 * one; help output is the only surface that can, and it had nothing asserted about it at all.
 *
 * **Two claims, and the second is what stops it being a grep for a string.**
 *
 * 1. Each command that ACTS on one installation advertises the flag, and advertises
 *    both provider names with it. A help line reading `--provider=<value>` names a flag whose
 *    legal values the user then has to discover by being refused — `helpValue` is what makes the
 *    roster readable, and it is the part a hidden flag never had to get right.
 * 2. The command that describes EVERY scope does not advertise it. `doctor` takes no `--provider`
 *    and must not grow one: it reports on each installation in play rather than acting on one, so
 *    a flag selecting between them would narrow the one report whose value is that it does not.
 *    Without this half, "unhide the flag" is satisfied by putting it on everything.
 *
 * **`compile` moved from the second roster to the first on 2026-09-23, and `update` and `list`
 * joined it.** The reasoning that put them there read "the folder on disk is the whole record of
 * a provider after an install" — which is true of a folder and false of a SCOPE, because a scope
 * can hold one installation of each, and `providerInUse` then answers by roster order. So the two
 * commands that write acted on one of a user's two installations in silence and the one whose job
 * is to say what is installed reported one of them with nothing saying so.
 *
 * Red before the unhide on all five of the first claim's rows — oclif omits a `hidden` flag from
 * `--help` entirely — and green on both of the second's, which is what says the control was
 * already a control rather than an artefact of the change.
 */

/** How oclif spells the flag on a help screen, which is the string a user reads. */
const FLAG = "--provider";

/** Both provider names, taken from the flag pairs the Codex lane already drives the CLI with. */
const CLAUDE = PROVIDER_CLAUDE[1];
const CODEX = PROVIDER_CODEX[1];

/**
 * The flag's own help line, roster included, as oclif renders its `helpValue`.
 *
 * The provider names are pinned HERE rather than anywhere on the screen, because the screen names
 * them elsewhere: `init`'s description says `copy to .claude/`, so a screen-wide
 * `toContain("claude")` stayed green over a roster that had dropped `claude` — measured on
 * 2026-09-26 by breaking the roster in a scratch copy of the built CLI, where the line assertion
 * below went red and the name checks beside it did not.
 */
const FLAG_WITH_ROSTER = `${FLAG}=<${CLAUDE}|${CODEX}>`;

/**
 * Every command that acts on exactly one installation and therefore declares the flag.
 *
 * The same roster `provider-arrives-on-the-command.e2e.test.ts` refuses an ambiguous run on, and
 * a command missing from it is one whose users cannot discover how to answer the refusal they
 * were just shown.
 */
const DECLARES_THE_FLAG = [
  { label: "init", argv: ["init"] },
  { label: "edit", argv: ["edit"] },
  { label: "uninstall", argv: ["uninstall"] },
  { label: "share", argv: ["share"] },
  { label: "eject", argv: ["eject"] },
  { label: "compile", argv: ["compile"] },
  { label: "update", argv: ["update"] },
  { label: "list", argv: ["list"] },
] as const;

/** The command that reports on every scope, and must not advertise a flag that narrows it. */
const REPORTS_EVERY_SCOPE = [{ label: "doctor", argv: ["doctor"] }] as const;

describe("the provider flag is on the help screens", () => {
  async function helpFor(argv: readonly string[]): Promise<string> {
    const dir = await createTempDir();
    try {
      const result = await CLI.run([...argv, "--help"], { dir });
      const said = flattenCliOutput(result.output);
      expect(result.exitCode, said).toBe(EXIT_CODES.SUCCESS);
      return said;
    } finally {
      await cleanupTempDir(dir);
    }
  }

  it.each(DECLARES_THE_FLAG)("$label advertises it, and names both providers", async ({ argv }) => {
    const said = await helpFor(argv);

    expect(said, "the flag is still hidden, so nothing on screen says it exists").toContain(FLAG);
    for (const provider of [CLAUDE, CODEX]) {
      expect(said, provider).toContain(provider);
    }
    expect(said, "the flag's own line does not name both providers it takes").toContain(
      FLAG_WITH_ROSTER,
    );
  });

  it.each(REPORTS_EVERY_SCOPE)(
    "$label does not, because it reports on all of them",
    async ({ argv }) => {
      const said = await helpFor(argv);

      expect(
        said,
        "a command that reports on every installation in the scope grew a flag that selects one",
      ).not.toContain(FLAG);
    },
  );
});
