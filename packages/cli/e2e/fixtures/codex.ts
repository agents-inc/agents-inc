import { execa } from "execa";
import { mkdir, rm } from "fs/promises";
import { createRequire } from "node:module";
import path from "path";
import { z } from "zod";
import { cleanupTempDir, codexHome, createTempDir } from "../helpers/test-utils.js";

/**
 * Runs the PINNED `@openai/codex`, never one off PATH, so a format change fails on the day the pin
 * moves. Every run pins both HOME and `CODEX_HOME` (which wins in Codex) after the inherited
 * environment, so nothing reaches a developer's real `~/.codex`.
 */

const JSON_FLAG = "--json";

/** `e` is `exec`'s alias. */
const EVENT_STREAM_SUBCOMMANDS = ["exec", "e"];

const codexManifestSchema = z.object({
  version: z.string().min(1),
  bin: z.object({ codex: z.string().min(1) }),
});

const requireFromHere = createRequire(import.meta.url);
const CODEX_MANIFEST_PATH = requireFromHere.resolve("@openai/codex/package.json");
const CODEX_MANIFEST = codexManifestSchema.parse(requireFromHere(CODEX_MANIFEST_PATH));

/** Run with this process's Node rather than a `node` off PATH. */
const CODEX_ENTRY = path.join(path.dirname(CODEX_MANIFEST_PATH), CODEX_MANIFEST.bin.codex);

export type CodexRun = {
  exitCode: number;
  json: unknown[];
  /** For failure messages only; the exit code is the verdict. */
  stderr: string;
};

/**
 * `false` only where the platform binary (an optional dependency) is missing. Assert it rather
 * than skip on it: a skip reads as green. Runs under a temp HOME because Codex writes helper links
 * into any non-temp `CODEX_HOME` before reading its arguments (0.155.1).
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

/** Adds `--json` itself, so a spec cannot read prose as a result; passing it too is refused. */
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

const promptInputMessageSchema = z.object({
  role: z.string(),
  content: z.array(z.object({ text: z.string() })),
});

// `debug prompt-input` refuses `--json`. Assert content, never a skill-root index: root order varies.
export async function readCodexPrompt(home: string, cwd: string): Promise<string> {
  const result = await startPinned(home, ["debug", "prompt-input"], cwd);
  if (result.exitCode !== 0) {
    throw new Error(`codex debug prompt-input exited ${result.exitCode}: ${result.stderr}`);
  }

  const messages = z.array(promptInputMessageSchema).parse(JSON.parse(result.stdout));
  return messages.flatMap((message) => message.content.map((part) => part.text)).join("\n");
}

const bundledModelSchema = z.object({
  slug: z.string(),
  visibility: z.string(),
  supported_reasoning_levels: z.array(z.object({ effort: z.string() })),
});

export type CodexBundledModel = z.infer<typeof bundledModelSchema>;

/** `debug models` also refuses `--json`, so it bypasses {@link runCodex}. */
export async function readCodexBundledModels(home: string): Promise<CodexBundledModel[]> {
  const result = await startPinned(home, ["debug", "models", "--bundled"], home);
  if (result.exitCode !== 0) {
    throw new Error(`codex debug models exited ${result.exitCode}: ${result.stderr}`);
  }

  return z.object({ models: z.array(bundledModelSchema) }).parse(JSON.parse(result.stdout)).models;
}

/**
 * A `codex exec` under a writing sandbox records the project as trusted in this file, which
 * changes what later runs read. Marketplaces and plugin switches live here too and are reset.
 */
export async function resetCodexGlobalConfig(home: string): Promise<void> {
  await rm(path.join(codexHome(home), "config.toml"), { force: true });
}

/**
 * `CODEX_HOME` is created first so the first and second runs agree. `execa` extends the inherited
 * environment. Stdin is closed, or `exec` waits for input.
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

  // No exit code means a signal killed it.
  return { exitCode: exitCode ?? 1, stdout, stderr };
}

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
