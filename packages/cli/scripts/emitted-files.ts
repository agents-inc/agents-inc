/** Shared by the generators: writing and formatting the files they emit, and the drift check. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { format, resolveConfig } from "prettier";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";

import type { Options as PrettierOptions } from "prettier";

/** `path` is relative to the root the generator writes under. */
export type EmittedFile = { path: string; content: string };

export type CheckResult = { clean: boolean; drifted: string[] };

/** `against` names what the target was generated from, where that is not this repository. */
type CheckedTarget = { label: string; script: string; against?: string };

export function writeEmittedFiles(root: string, files: EmittedFile[]): string[] {
  for (const file of files) {
    writeEmittedFile(root, file);
  }

  return files.map((file) => file.path);
}

/** Compares in memory, so a path never committed counts as drifted and no repository is needed. */
export function compareWithCommitted(root: string, files: EmittedFile[]): CheckResult {
  const drifted = files.filter((file) => !matchesCommitted(root, file)).map((file) => file.path);

  return { clean: drifted.length === 0, drifted };
}

export async function formatEmittedFiles(
  files: EmittedFile[],
  parser: string,
): Promise<EmittedFile[]> {
  const options = await packagePrettierOptions();

  return Promise.all(
    files.map(async (file) => ({
      path: file.path,
      content: await format(file.content, { ...options, parser }),
    })),
  );
}

export function reportCheck({ clean, drifted }: CheckResult, target: CheckedTarget): void {
  if (!clean) refuseDrift(drifted, target);

  console.log(`  ✓ ${target.label} matches what the generator emits`);
}

function refuseDrift(drifted: string[], { label, script, against }: CheckedTarget): never {
  console.error(outOfDateHeading(label, against));
  for (const file of drifted) {
    console.error(`  ${file}`);
  }
  console.error(`\nRun \`bun run ${script}\` in packages/cli and commit everything it writes.`);
  process.exit(EXIT_CODES.ERROR);
}

const outOfDateHeading = (label: string, against: string | undefined): string =>
  against === undefined
    ? `${label} is out of date:`
    : `${label} is out of date against ${against}:`;

function writeEmittedFile(root: string, file: EmittedFile): void {
  const target = path.join(root, file.path);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

function matchesCommitted(root: string, file: EmittedFile): boolean {
  const target = path.join(root, file.path);
  return existsSync(target) && readFileSync(target, "utf-8") === file.content;
}

/** Resolved from this file, not the destination, so a fixture dir in os.tmpdir() formats the same. */
async function packagePrettierOptions(): Promise<PrettierOptions> {
  const options = await resolveConfig(import.meta.filename);
  if (options === null) {
    throw new Error(
      `No Prettier config resolved from ${import.meta.filename} — the emitted bytes would not ` +
        "match the committed files.",
    );
  }
  return options;
}
