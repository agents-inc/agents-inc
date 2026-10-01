import { chmod, mkdir, writeFile } from "fs/promises";
import { createRequire } from "node:module";
import os from "os";
import path from "path";
import { z } from "zod";

/**
 * The `codex` binary a SPAWNED CLI resolves, and the one thing without which every Codex spec here
 * changes its failure mode instead of passing.
 *
 * **The product resolves the binary BY NAME.** `codex-host.ts` calls `execCommand("codex", …)`,
 * which is `child_process.spawn` with no shell and no path — so the host finds whatever `codex` the
 * spawned process's `PATH` happens to carry. A spec drives the product through
 * `node bin/run.js`, a separate process, and nothing in this suite has ever put a `codex` on that
 * process's `PATH`. `e2e/fixtures/codex.ts` pins the binary for the spec's OWN measurements and
 * cannot reach the child at all.
 *
 * Without this the Codex specs do not fail honestly: `isAvailable` answers `false`, `init` reports
 * the Codex CLI missing, and every assertion about a plugin becomes an assertion about a machine.
 *
 * **It is the pinned `@openai/codex`, never a developer's own.** The package is a devDependency at
 * one exact version, so a Codex release that moves an output format fails this lane on the day the
 * pin is bumped rather than on whichever machine happens to have a newer `codex` installed.
 * Resolving the real thing off `PATH` would make that pin decorative and would give two developers
 * two different suites.
 *
 * **A fixed path in `os.tmpdir()`, which carries the rule `shared-source.ts` states**: a fixed path
 * belongs to the MACHINE rather than to the run, so exactly one writer owns it — `globalSetup`,
 * through {@link installCodexOnPath} — and every spec only reads it. Per-run directories were the
 * alternative and cost a second variable on every `CLI.run`; the shim's content is one line derived
 * from the pin, so a stale copy from an interrupted run is byte-identical to a fresh one.
 */

/** What this lane reads from the pinned package's manifest — where its entry script is. */
const codexManifestSchema = z.object({
  bin: z.object({ codex: z.string().min(1) }),
});

const requireFromHere = createRequire(import.meta.url);
const CODEX_MANIFEST_PATH = requireFromHere.resolve("@openai/codex/package.json");
const CODEX_ENTRY = path.join(
  path.dirname(CODEX_MANIFEST_PATH),
  codexManifestSchema.parse(requireFromHere(CODEX_MANIFEST_PATH)).bin.codex,
);

/** The directory holding the shim, prepended to a spawned CLI's `PATH`. */
const CODEX_SHIM_DIR = path.join(os.tmpdir(), "agents-inc-e2e-codex-bin");

/** The name the product spawns, which is the whole of what the shim has to be called. */
const CODEX_COMMAND = "codex";

/**
 * Writes the shim. Called once from `globalSetup`, before a spec is collected.
 *
 * The shim runs the pinned entry under THIS process's Node — `process.execPath` — rather than a
 * `node` off `PATH`, for the reason `codex.ts` gives: the suite's own Node is the version the pin
 * was measured on, and a machine whose `PATH` Node is older would fail inside Codex with an error
 * about neither the product nor the pin.
 *
 * `"$@"` rather than `$*`, so an argument carrying a space survives; and `exec`, so the shim
 * contributes no process of its own to wait on and the exit code the host reads is Codex's.
 */
export async function installCodexOnPath(): Promise<void> {
  await mkdir(CODEX_SHIM_DIR, { recursive: true });

  const shim = path.join(CODEX_SHIM_DIR, CODEX_COMMAND);
  await writeFile(
    shim,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(CODEX_ENTRY)} "$@"\n`,
  );
  await chmod(shim, 0o755);
}

/**
 * The shim directory in front of `existing` — the caller's own PATH, or this process's.
 *
 * **Prepended, never replacing**, and the caller's value wins the rest of the variable. A spec that
 * names its own PATH is naming it for a reason: `update`'s "the Claude CLI is missing" cases hand
 * over a PATH with no `claude` on it, and replacing that with this process's would hand the
 * developer's own binaries back and make every one of them a test of this machine. The shim
 * directory holds exactly one file, so putting it first shadows a real `codex` and nothing else —
 * which is deliberate, because the pin is what this lane measures against.
 */
export function withCodexOnIt(existing: string | undefined): string {
  return `${CODEX_SHIM_DIR}${path.delimiter}${existing ?? process.env["PATH"] ?? ""}`;
}
