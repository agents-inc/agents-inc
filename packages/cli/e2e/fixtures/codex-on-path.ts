import { chmod, mkdtemp, rm, writeFile } from "fs/promises";
import { createRequire } from "node:module";
import os from "os";
import path from "path";
import { z } from "zod";

// The product spawns `codex` by name, so spawned CLIs need the PINNED `@openai/codex` on PATH. A folder
// per run, named to its workers in the environment, so no run's teardown removes another's shim.

const codexManifestSchema = z.object({
  version: z.string().min(1),
  bin: z.object({ codex: z.string().min(1) }),
});

const requireFromHere = createRequire(import.meta.url);
const CODEX_MANIFEST_PATH = requireFromHere.resolve("@openai/codex/package.json");
const CODEX_MANIFEST = codexManifestSchema.parse(requireFromHere(CODEX_MANIFEST_PATH));

/** Run `entry` with this process's Node rather than a `node` off PATH. */
export const PINNED_CODEX = {
  version: CODEX_MANIFEST.version,
  entry: path.join(path.dirname(CODEX_MANIFEST_PATH), CODEX_MANIFEST.bin.codex),
};

const CODEX_SHIM_PREFIX = "agents-inc-e2e-codex-bin-";
export const CODEX_SHIM_ENV = "AGENTS_INC_E2E_CODEX_BIN";

const CODEX_COMMAND = "codex";

// Runs under this process's Node (the one the pin was measured on); `exec "$@"` keeps args and exit code.
export async function installCodexOnPath(): Promise<() => Promise<void>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), CODEX_SHIM_PREFIX));

  const shim = path.join(dir, CODEX_COMMAND);
  await writeFile(
    shim,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(PINNED_CODEX.entry)} "$@"\n`,
  );
  await chmod(shim, 0o755);
  process.env[CODEX_SHIM_ENV] = dir;

  return () => rm(dir, { recursive: true, force: true });
}

function codexShimDir(): string {
  const dir = process.env[CODEX_SHIM_ENV];
  if (dir === undefined) {
    throw new Error(
      `${CODEX_SHIM_ENV} is unset: the codex shim is installed by e2e/global-setup.ts (or the hand-run harness), and this process was not started after either`,
    );
  }
  return dir;
}

// Prepended, never replacing: a spec's own PATH (e.g. one without `claude`) must survive.
export function withCodexOnIt(existing: string | undefined): string {
  return `${codexShimDir()}${path.delimiter}${existing ?? process.env["PATH"] ?? ""}`;
}
