/**
 * No product file outside `lib/hosts/` names a `claude*` plugin function any more.
 *
 * This is the plan's own C3 verification — *"`grep -rn "claudePlugin" src/cli --include='*.ts*' |
 * grep -v "hosts/\|__tests__"` prints nothing"* — kept as a spec rather than performed once. A
 * census run by hand at the end of a step reports the tree of that minute; the same census as a
 * gate reports the next caller, on the day it is written.
 *
 * **The plan's grep as written cannot print nothing, and the correction is in this file's roster.**
 * It excludes `hosts/` and `__tests__/` but not a spec sitting beside its module, and on 2026-09-21
 * five of those named these functions (`utils/exec.test.ts`, `mode-migrator.test.ts`,
 * `install-plugin-skills.test.ts`, `uninstall-plugin-skills.test.ts`,
 * `ensure-marketplace.test.ts`), as did a comment in `permission-checker.test.tsx`. So the scan
 * below excludes every spec by suffix as well as by directory, and asks its question of PRODUCT
 * code — which is the question the plan meant: a spec naming a function is not a caller of it.
 *
 * **What this gate does NOT cover, stated so the green run is not read as wider than it is.** It
 * reads `src/`. The `e2e/` tree reaches these functions too — `e2e/helpers/test-utils.ts`
 * re-exports seven of them, and `e2e/global-setup.ts`, `e2e/smoke/home-isolation.smoke.test.ts`,
 * `e2e/smoke/plugin-install.smoke.test.ts`, `e2e/smoke/plugin-chain-poc.smoke.test.ts` and
 * `e2e/commands/plugin-uninstall-core.e2e.test.ts` import from there — and those imports must
 * follow the move in the same turn or the e2e project stops type-checking. Re-derive rather than
 * trusting that list; run from `packages/cli`:
 *
 * ```
 * grep -rn "claudePlugin\|isClaudeCLIAvailable" e2e --include='*.ts'
 * ```
 *
 * The same turn also owes `src/cli/lib/__tests__/tested-exports-reach-production.test.ts` its one
 * row: it names `claudePluginMarketplaceRemove` at `src/cli/utils/exec.ts`, and the roster is
 * compared against the tree, so the file path moves with the function.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** Everything the CLI ships, before the two exclusions below. */
const CLI_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];

/**
 * What a census of PRODUCT code leaves out.
 *
 * A spec may name whatever it is about, and the seam's own modules are where these names are meant
 * to live — that is the whole point of the step. Both spellings of a spec are excluded because the
 * package keeps them both ways round: `__tests__/` directories, and a `.test.ts` beside its module.
 */
const NOT_PRODUCT = ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"];
const THE_SEAM = "src/cli/lib/hosts/**";

/**
 * The names that may not appear outside the seam, written out rather than matched by a prefix.
 *
 * A bare `claude` would condemn the provider's own name, which is a legitimate value everywhere;
 * `claudePlugin` alone would leave `isClaudeCLIAvailable` behind, and that one is the availability
 * probe two commands gate their plugin work on — a caller holding it is a caller that has decided
 * which host it is talking to.
 */
const NAMES_BEHIND_THE_SEAM = [
  "claudePluginInstall",
  "claudePluginUninstall",
  "claudePluginUninstallBestEffort",
  "claudePluginMarketplaceAdd",
  "claudePluginMarketplaceExists",
  "claudePluginMarketplaceList",
  "claudePluginMarketplaceRemove",
  "claudePluginMarketplaceUpdate",
  "isClaudeCLIAvailable",
] as const;

/**
 * What `utils/exec.ts` keeps, and the paired ALLOWED case for the roster above.
 *
 * A census asserting only an absence cannot tell a correct extraction from one that emptied the
 * module: both leave the scan green, and the second takes the spawn wrapper and the argument
 * validators with it. The plan is explicit — *"`exec.ts` keeps `execCommand` and the
 * validators"* — and these are the names every host is built on.
 *
 * **The three validators were named in the assertion below and absent from this list until
 * 2026-09-22**, so the case claimed a check on them that it did not perform. Deleting all three
 * from `exec.ts` left it green: the roster held one name, and the matcher it was read with —
 * `export async function <name>` — could not have matched a synchronous declaration even if they
 * had been listed. A spec whose name claims more than it checks is this repository's own
 * anti-pattern (`standards/e2e/anti-patterns.md`, "Never name a spec for a source whose data the
 * fixture does not ship"), and the reason it matters here is that the validators are the half a
 * host extraction is most likely to take with it — every one of them is called only from the
 * host module now.
 */
const NAMES_EXEC_KEEPS = [
  "execCommand",
  "validateMarketplaceSource",
  "validatePluginName",
  "validatePluginPath",
] as const;

/** Whether `source` declares `name` as an exported function, synchronous or not. */
function declaresExportedFunction(source: string, name: string): boolean {
  return (
    source.includes(`export function ${name}(`) || source.includes(`export async function ${name}(`)
  );
}

type Hit = { file: string; name: string };

/** Every (file, name) pair the scan found, sorted so a diff reads as a list rather than a shuffle. */
async function namesFoundIn(globs: string[], ignore: string[]): Promise<Hit[]> {
  const files = await fg(globs, { cwd: CLI_ROOT, ignore, onlyFiles: true });
  const perFile = await Promise.all(
    files.sort().map(async (file) => {
      const source = await readFile(path.join(CLI_ROOT, file), "utf8");
      return NAMES_BEHIND_THE_SEAM.filter((name) => source.includes(name)).map((name) => ({
        file,
        name,
      }));
    }),
  );

  return perFile.flat();
}

describe("Claude's plugin vocabulary", () => {
  /**
   * The subject guard. A glob that matched nothing reports a clean census for a tree full of
   * callers, and every judgement below would hold for that reason.
   */
  it("has a product tree to scan at all", async () => {
    const files = await fg(CLI_SOURCES, { cwd: CLI_ROOT, ignore: NOT_PRODUCT, onlyFiles: true });

    expect(
      files.length,
      "the scan matched no product file, so an empty result says nothing about the tree",
    ).toBeGreaterThan(100);
  });

  it("is named in no product file outside the hosts seam", async () => {
    expect(
      await namesFoundIn(CLI_SOURCES, [...NOT_PRODUCT, THE_SEAM]),
      "a caller still spelling one host's function is a caller that cannot be pointed at another host, whatever the seam beside it says",
    ).toStrictEqual([]);
  });

  it("is named inside the hosts seam, which is where it belongs", async () => {
    const inside = await namesFoundIn([THE_SEAM], NOT_PRODUCT);

    expect(
      inside.length,
      "the names are nowhere at all, so the extraction deleted the Claude host rather than moving it",
    ).toBeGreaterThan(0);
  });

  it("leaves the spawn wrapper and the argument validators where every host reaches them", async () => {
    const source = await readFile(path.join(CLI_ROOT, "src/cli/utils/exec.ts"), "utf8");

    expect(
      NAMES_EXEC_KEEPS.filter((name) => declaresExportedFunction(source, name)),
      "exec.ts was emptied rather than narrowed: a host now spawns its own child process, or validates its own arguments — and an injection guard that moved into one host is an injection guard the next host does not have",
    ).toStrictEqual([...NAMES_EXEC_KEEPS]);
  });
});
