import { describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { PROVIDER_CLAUDE, PROVIDER_CODEX } from "../fixtures/codex-install.js";
import { cleanupTempDir, createTempDir, flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * `--provider` is on the help screen of every command that acts on one installation, with both
 * provider names; `doctor`, which reports every scope, does not advertise it. Hidden is not
 * disabled, so only help output shows the flag shipped.
 */

const FLAG = "--provider";

const CLAUDE = PROVIDER_CLAUDE[1];
const CODEX = PROVIDER_CODEX[1];

/**
 * Pinned on the flag's own line: `init`'s description mentions `.claude/`, so a screen-wide name
 * check cannot fail.
 */
const FLAG_WITH_ROSTER = `${FLAG}=<${CLAUDE}|${CODEX}>`;

/** The same roster `provider-arrives-on-the-command.e2e.test.ts` refuses an ambiguous run on. */
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
