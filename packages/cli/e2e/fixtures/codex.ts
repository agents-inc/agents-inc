import { execa } from "execa";
import { mkdir, rm } from "fs/promises";
import { createRequire } from "node:module";
import path from "path";
import { z } from "zod";
import { cleanupTempDir, codexHome, createTempDir } from "../helpers/test-utils.js";

/**
 * The Codex test lane's runner: the PINNED `@openai/codex` binary, started under a HOME and a
 * `CODEX_HOME` the spec owns.
 *
 * **Pinned, never PATH.** `@openai/codex` is a devDependency at one exact version, so a Codex
 * release that moves an output format fails this lane on the day the pin is bumped rather than on
 * whichever machine happens to have a newer `codex` installed. Resolving `codex` off PATH would
 * give every developer a different binary and make that pin decorative.
 *
 * **Both state variables, always.** `CODEX_HOME` beats `HOME` in Codex, so a run handed only a
 * fake HOME still writes into a developer's exported `CODEX_HOME`. Something has already written
 * into a real `~/.codex/tmp/arg0` from this machine. Every run pins both, after the inherited
 * environment, the way the CLI's own spawn doors pin `CLAUDE_CONFIG_DIR`.
 */

/** The flag that makes each Codex subcommand this lane runs print its result as JSON. */
const JSON_FLAG = "--json";

/**
 * The one subcommand that answers `--json` with a STREAM — one JSON event per line — where every
 * other subcommand prints a single JSON document. `e` is its alias.
 */
const EVENT_STREAM_SUBCOMMANDS = ["exec", "e"];

/** What this lane reads from the pinned package's manifest — where its entry is, and which release. */
const codexManifestSchema = z.object({
  version: z.string().min(1),
  bin: z.object({ codex: z.string().min(1) }),
});

const requireFromHere = createRequire(import.meta.url);
const CODEX_MANIFEST_PATH = requireFromHere.resolve("@openai/codex/package.json");
const CODEX_MANIFEST = codexManifestSchema.parse(requireFromHere(CODEX_MANIFEST_PATH));

/** The pinned package's own entry script, run with this process's Node rather than a `node` off PATH. */
const CODEX_ENTRY = path.join(path.dirname(CODEX_MANIFEST_PATH), CODEX_MANIFEST.bin.codex);

/** One run of the pinned binary. */
export type CodexRun = {
  exitCode: number;
  /**
   * Every JSON value stdout carried, in order: the one document a `--json` result prints, or one
   * event per line for `exec --json`. Stdout is ONLY ever read as JSON, because it is only ever
   * asked for JSON.
   */
  json: unknown[];
  /**
   * What Codex wrote to stderr, for a failure message and nothing else. Under a `CODEX_HOME` in
   * `/tmp` it opens with a `WARNING: proceeding, even though we could not create PATH aliases`
   * line on every run: Codex refuses to put helper binaries in a temporary directory, which every
   * spec's HOME is. It is a notice, not a failure, and the exit code is the verdict.
   */
  stderr: string;
};

/**
 * Whether the pinned binary runs on this machine and reports the pinned release.
 *
 * The binary itself arrives as a per-platform optional dependency of the pin, so an install on a
 * platform Codex does not ship for — or one that skipped optional dependencies — has the package
 * and no binary. That is the only case this answers `false` for. A spec whose subject needs Codex
 * should assert this is `true` rather than skip on it: the pin exists so the lane never skips
 * silently, and a skip here reads as a green run.
 *
 * Even `--version` runs under a HOME of its own, because Codex writes on every start whose
 * `CODEX_HOME` is NOT under the temp dir: it links its helper binaries into
 * `$CODEX_HOME/tmp/arg0/codex-arg0<random>/` before it reads a single argument. Under a temp dir it
 * refuses, writes nothing, and prints the `WARNING` line {@link CodexRun.stderr} describes — so
 * this probe, whose HOME is a temp directory, writes nothing either. The pinning is for the
 * UNPINNED probe: a developer's exported `CODEX_HOME` is an ordinary directory, and a version
 * check is enough to write into it.
 *
 * Re-derived on `@openai/codex` 0.155.1, 2026-09-20, a sample of one each:
 *
 *     env -i PATH=/usr/bin:/bin HOME=<s> CODEX_HOME=<s>/.codex node <codex.js> --version
 *     # exit 0, the WARNING, <s>/.codex still empty
 *     env -i PATH=/usr/bin:/bin HOME=<s> CODEX_HOME=<s>/.codex TMPDIR=<s>/elsewhere \
 *       node <codex.js> --version
 *     # exit 0, no warning, wrote .codex/tmp/arg0/codex-arg0zYeqjo/ (5 entries)
 */
export async function isCodexCLIAvailable(): Promise<boolean> {
  const home = await createTempDir();
  try {
    const result = await startPinned(home, ["--version"], home);
    return result.exitCode === 0 && result.stdout.includes(CODEX_MANIFEST.version);
  } finally {
    await cleanupTempDir(home);
  }
}

/**
 * Runs the pinned binary with `args` in `cwd`, under `home` and its `CODEX_HOME`, and parses what it
 * printed. `--json` is added here — every subcommand the lane drives takes it — so a spec cannot
 * forget it and then read prose as a result; passing it as well is refused.
 */
export async function runCodex(
  home: string,
  args: readonly string[],
  cwd: string,
): Promise<CodexRun> {
  if (args.includes(JSON_FLAG)) {
    throw new Error(`runCodex adds ${JSON_FLAG} itself; drop it from ${args.join(" ")}`);
  }

  const result = await startPinned(home, [...args, JSON_FLAG], cwd);

  return {
    exitCode: result.exitCode,
    json: jsonPrintedBy(args, result.stdout),
    stderr: result.stderr,
  };
}

/**
 * One message of the model-visible prompt, as `codex debug prompt-input` prints it.
 *
 * Structural rather than a scan: the document is validated into this shape and the TEXT is what a
 * spec asserts on, which is the house rule for reading rendered output. A regex picking names out
 * of the skills block would need tests of its own to be trusted, and it would pin the block's
 * layout as well as its content.
 */
const promptInputMessageSchema = z.object({
  role: z.string(),
  content: z.array(z.object({ text: z.string() })),
});

/**
 * Everything the pinned binary would put in front of the model, as one string.
 *
 * **This is the only instrument that can answer "does Codex read what we wrote".** Nothing else
 * does: `codex plugin list --json` answers about the plugin registry and says nothing about
 * skills; `codex agents` browses live sessions rather than the roster; and the roster itself
 * lives in `spawn_agent`'s tool schema, which no `--json` subcommand prints.
 *
 * **It cannot go through {@link runCodex}, and that is a fact about the binary rather than a
 * shortcut.** `debug prompt-input` REFUSES `--json` (`error: unexpected argument '--json' found`,
 * re-derived on 0.155.1, 2026-09-22) and prints a JSON array unasked, so the runner that adds the
 * flag to everything cannot drive it.
 *
 * **Assert the CONTENT, never a skill-root index.** The block numbers its roots `r0`, `r1`, … in
 * whatever order they happen to appear — measured twice on 0.155.1 in one afternoon, `r0` was
 * `$CODEX_HOME/skills` in a home that had one and `$CODEX_HOME/skills/.system` in a home that did
 * not — so a spec pinning `r0/<skill>/SKILL.md` pins the arrangement of the other roots. The
 * absolute root path and the skill's own name are both in this string and neither moves.
 */
export async function readCodexPrompt(home: string, cwd: string): Promise<string> {
  const result = await startPinned(home, ["debug", "prompt-input"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`codex debug prompt-input exited ${result.exitCode}: ${result.stderr}`);
  }

  const messages = z.array(promptInputMessageSchema).parse(JSON.parse(result.stdout));
  return messages.flatMap((message) => message.content.map((part) => part.text)).join("\n");
}

/**
 * Deletes the global `config.toml` of a pinned HOME, so the next run starts from no configuration.
 *
 * **The tool under test writes the independent variable, which is why this exists.** A `codex
 * exec` under `--sandbox workspace-write` or `danger-full-access` writes
 * `[projects."<abs path>"] trust_level = "trusted"` into that file itself — `codex-lane.smoke.test.ts`
 * pins the write — and a trust entry decides whether a project's role files and plugin switches are
 * read at all. A later run in the same home then registers for a reason the spec never set, which
 * has already produced two contradictory measurements in this programme. Marketplaces and plugin
 * switches live in the same file, so this resets those too: a spec that needs either asks for it
 * again afterwards.
 */
export async function resetCodexGlobalConfig(home: string): Promise<void> {
  await rm(path.join(codexHome(home), "config.toml"), { force: true });
}

/**
 * The one place the pinned binary is started: under `home`, with `CODEX_HOME` pinned inside it.
 *
 * `CODEX_HOME` is created first. Codex runs without one — it warns that the path does not exist
 * and carries on — and a directory missing at the first run and present at the second is a
 * difference no spec should have to account for.
 *
 * **Every other variable is this suite's**: `execa` extends the inherited environment unless told
 * not to, and nothing here tells it not to.
 *
 * Stdin is closed: `exec` otherwise waits on a piped stdin for "additional input" that never
 * comes.
 */
async function startPinned(
  home: string,
  args: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const stateDir = codexHome(home);
  await mkdir(stateDir, { recursive: true });

  const { exitCode, stdout, stderr } = await execa(process.execPath, [CODEX_ENTRY, ...args], {
    cwd,
    reject: false,
    stdin: "ignore",
    env: { HOME: home, CODEX_HOME: stateDir },
  });

  // No exit code means the process never exited on its own — killed by a signal — which is a
  // failure whatever it printed.
  return { exitCode: exitCode ?? 1, stdout, stderr };
}

/** The JSON values a run printed — a stream for `exec`, one document for everything else. */
function jsonPrintedBy(args: readonly string[], stdout: string): unknown[] {
  const printed = stdout.trim();
  if (printed === "") return [];

  if (printsAnEventStream(args)) {
    return printed.split("\n").map((line): unknown => JSON.parse(line));
  }

  return [JSON.parse(printed)];
}

function printsAnEventStream(args: readonly string[]): boolean {
  const subcommand = args[0];
  return subcommand !== undefined && EVENT_STREAM_SUBCOMMANDS.includes(subcommand);
}
