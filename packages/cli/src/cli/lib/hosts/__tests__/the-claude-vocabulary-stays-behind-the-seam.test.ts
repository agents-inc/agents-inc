import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

const CLI_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];

/** Specs are excluded in both layouts: `__tests__/` and a `.test.ts` beside its module. */
const NOT_PRODUCT = ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"];
const THE_SEAM = "src/cli/lib/hosts/**";

/** Listed rather than prefix-matched: a bare `claude` is the provider's own name. */
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

/** The allowed half of the census: an extraction that emptied `exec.ts` would also pass it. */
const NAMES_EXEC_KEEPS = [
  "execCommand",
  "validateMarketplaceSource",
  "validatePluginName",
  "validatePluginPath",
] as const;

function declaresExportedFunction(source: string, name: string): boolean {
  return (
    source.includes(`export function ${name}(`) || source.includes(`export async function ${name}(`)
  );
}

type Hit = { file: string; name: string };

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
  // A glob that matched nothing would report a clean census.
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
