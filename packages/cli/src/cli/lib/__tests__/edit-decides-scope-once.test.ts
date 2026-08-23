import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EDIT_COMMAND = path.join(CLI_ROOT, "src", "cli", "commands", "edit.tsx");

/**
 * The three ways a layer of `edit` can decide for itself which directory it is acting on, each
 * paired with the ONE site the command is allowed to use it at.
 *
 * `resolveEditRoot` answers "which installation is this run editing, and is it the global one"
 * once, and every layer below takes that answer as a parameter. These counts are what stops a
 * layer computing it again: a seventh layer inventing a seventh criterion has to reach for one
 * of these three, and each is pinned to the single site that legitimately holds it.
 */
const SCOPE_CRITERIA = [
  {
    token: "isHomeDirectory(",
    sanctionedSite: "resolveEditRoot, which is the only place the criterion is computed",
  },
  {
    token: "process.cwd()",
    sanctionedSite:
      "applyEdit, which hands it to resolveEditRoot and to the two pre-detection guards",
  },
  {
    token: "os.homedir()",
    sanctionedSite:
      "otherRegisteredProjects, which READS the global config rather than comparing against it",
  },
] as const;

/** How many times `token` appears in `source`. */
function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

/**
 * `edit` decides which installation it is acting on ONCE, and every layer reads that decision.
 *
 * Six layers used to answer it separately — the wizard's scope toggle, the config write, the
 * compile, two skill discoveries and the plugin registration — and three of them read the
 * working directory, so a run started outside an install disagreed with itself: the wizard
 * offered a project scope that did not exist while the write fabricated one beside an unrelated
 * checkout. Six behavioural assertions would have caught that arrangement; none of them would
 * catch the seventh layer, which is what this holds instead.
 *
 * A raw count over the source rather than a behavioural check, deliberately: the property is
 * about the SHAPE of the command, and no run can observe a criterion a layer has not yet been
 * given a reason to disagree about.
 */
describe("the edit command decides which installation it is editing once", () => {
  it.each(SCOPE_CRITERIA)(
    "reads `$token` at one site only — $sanctionedSite",
    async ({ token, sanctionedSite }) => {
      const source = await readFile(EDIT_COMMAND, "utf8");

      expect(
        occurrences(source, token),
        `every scope decision in edit.tsx reads EditRoot; the only sanctioned '${token}' is in ${sanctionedSite}`,
      ).toBe(1);
    },
  );
});
