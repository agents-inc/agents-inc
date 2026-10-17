import { chmod, mkdir, writeFile } from "fs/promises";
import { createRequire } from "node:module";
import os from "os";
import path from "path";
import { z } from "zod";

// The product spawns `codex` by name, so spawned CLIs need the PINNED `@openai/codex` on PATH. The shim
// sits at a fixed tmpdir path written only by globalSetup.

const codexManifestSchema = z.object({
  bin: z.object({ codex: z.string().min(1) }),
});

const requireFromHere = createRequire(import.meta.url);
const CODEX_MANIFEST_PATH = requireFromHere.resolve("@openai/codex/package.json");
const CODEX_ENTRY = path.join(
  path.dirname(CODEX_MANIFEST_PATH),
  codexManifestSchema.parse(requireFromHere(CODEX_MANIFEST_PATH)).bin.codex,
);

const CODEX_SHIM_DIR = path.join(os.tmpdir(), "agents-inc-e2e-codex-bin");

const CODEX_COMMAND = "codex";

// Runs under this process's Node (the one the pin was measured on); `exec "$@"` keeps args and exit code.
export async function installCodexOnPath(): Promise<void> {
  await mkdir(CODEX_SHIM_DIR, { recursive: true });

  const shim = path.join(CODEX_SHIM_DIR, CODEX_COMMAND);
  await writeFile(
    shim,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(CODEX_ENTRY)} "$@"\n`,
  );
  await chmod(shim, 0o755);
}

// Prepended, never replacing: a spec's own PATH (e.g. one without `claude`) must survive.
export function withCodexOnIt(existing: string | undefined): string {
  return `${CODEX_SHIM_DIR}${path.delimiter}${existing ?? process.env["PATH"] ?? ""}`;
}
