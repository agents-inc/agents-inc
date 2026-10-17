import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const EDIT_COMMAND = path.join(CLI_ROOT, "src", "cli", "commands", "edit.tsx");

/** Each way a layer of `edit` could decide its own directory, pinned to the sites allowed to. */
const SCOPE_CRITERIA = [
  {
    token: "isHomeDirectory(",
    sites: 1,
    sanctionedSite: "resolveEditRoot, which is the only place the criterion is computed",
  },
  {
    token: "process.cwd()",
    sites: 1,
    sanctionedSite:
      "applyEdit, which hands it to resolveEditRoot and to the two pre-detection guards",
  },
  {
    token: "os.homedir()",
    sites: 0,
    sanctionedSite:
      "none — the global config a project run holds as installed is read by readInstalledGlobal in lib/seed/seed-apply.ts",
  },
] as const;

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

/**
 * `resolveEditRoot` decides the installation once and every layer takes it as a parameter. A count
 * over the source, because the property is the command's shape, which no run can observe.
 */
describe("the edit command decides which installation it is editing once", () => {
  it.each(SCOPE_CRITERIA)(
    "reads `$token` at $sites site(s) only — $sanctionedSite",
    async ({ token, sites, sanctionedSite }) => {
      const source = await readFile(EDIT_COMMAND, "utf8");

      expect(
        occurrences(source, token),
        `every scope decision in edit.tsx reads EditRoot; the sanctioned '${token}' sites are: ${sanctionedSite}`,
      ).toBe(sites);
    },
  );
});
