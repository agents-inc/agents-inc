import { partition } from "remeda";

import { getErrorMessage } from "../../utils/errors.js";
import { readFile, writeFile } from "../../utils/fs.js";

/**
 * `codex plugin add` writes `enabled = true` for the plugin it adds, and no codex verb switches one
 * off. Hand-edited, not TOML-parsed: only the spelling Codex writes is changed, in place, so any
 * other spelling is reported rather than shadowed by a second table, which Codex refuses.
 */

export type PluginLeftSwitchedOn = {
  readonly pluginKey: string;
  readonly configFile: string;
  readonly reason: string;
};

function sayWhichAreLeftOn(leftOn: readonly PluginLeftSwitchedOn[]): string {
  return leftOn
    .map(({ pluginKey, reason }) => `Codex left ${pluginKey} switched on: ${reason}`)
    .join("\n");
}

/** Thrown after the plugins were added: their versions moved, only their switches did not. */
export class PluginsLeftSwitchedOnError extends Error {
  constructor(readonly leftOn: readonly PluginLeftSwitchedOn[]) {
    super(sayWhichAreLeftOn(leftOn));
  }
}

/** Thrown when a step failed after adding plugins it then could not switch back off. */
export class FailedLeavingPluginsSwitchedOnError extends Error {
  constructor(
    readonly failure: unknown,
    readonly leftOn: readonly PluginLeftSwitchedOn[],
  ) {
    super(`${getErrorMessage(failure)}\n${sayWhichAreLeftOn(leftOn)}`, { cause: failure });
  }
}

const SWITCH = /^(\s*enabled\s*=\s*)(true|false)(\s*)$/;
const SWITCHED_OFF = "false";
const NOT_FOUND = -1;

type ConfigWithSwitchesOff = { readonly config: string; readonly unfound: readonly string[] };

export async function switchCodexPluginsOff(
  configFile: string,
  pluginKeys: readonly string[],
): Promise<void> {
  if (pluginKeys.length === 0) return;

  const leftOn = await pluginsStillSwitchedOn(configFile, pluginKeys);
  if (leftOn.length > 0) throw new PluginsLeftSwitchedOnError(leftOn);
}

async function pluginsStillSwitchedOn(
  configFile: string,
  pluginKeys: readonly string[],
): Promise<PluginLeftSwitchedOn[]> {
  const leftOn = (pluginKey: string, reason: string) => ({ pluginKey, configFile, reason });

  try {
    const config = await readFile(configFile);
    const switched = withSwitchesOff(config, pluginKeys);
    if (switched.config !== config) await writeFile(configFile, switched.config);
    return switched.unfound.map((pluginKey) =>
      leftOn(pluginKey, notSpelledAsCodexWritesIt(pluginKey)),
    );
  } catch (error) {
    return pluginKeys.map((pluginKey) => leftOn(pluginKey, getErrorMessage(error)));
  }
}

function withSwitchesOff(config: string, pluginKeys: readonly string[]): ConfigWithSwitchesOff {
  const lines = config.split("\n");
  const located = pluginKeys.map((pluginKey) => ({
    pluginKey,
    at: switchLineOf(lines, pluginKey),
  }));
  const [found, unfound] = partition(located, ({ at }) => at !== NOT_FOUND);
  const toSwitch = new Set(found.map(({ at }) => at));

  return {
    config: lines.map((line, at) => (toSwitch.has(at) ? switchedOff(line) : line)).join("\n"),
    unfound: unfound.map(({ pluginKey }) => pluginKey),
  };
}

function switchLineOf(lines: readonly string[], pluginKey: string): number {
  const header = lines.findIndex((line) => line.trim() === pluginTableHeader(pluginKey));
  if (header === NOT_FOUND) return NOT_FOUND;

  const end = endOfTable(lines, header);
  return lines.findIndex((line, at) => at > header && at < end && SWITCH.test(line));
}

/** The next table's header, or the end of the file when this table is the last. */
function endOfTable(lines: readonly string[], header: number): number {
  const nextTable = lines.findIndex((line, at) => at > header && opensATable(line));
  return nextTable === NOT_FOUND ? lines.length : nextTable;
}

function switchedOff(line: string): string {
  return line.replace(SWITCH, `$1${SWITCHED_OFF}$3`);
}

function opensATable(line: string): boolean {
  return line.trim().startsWith("[");
}

function pluginTableHeader(pluginKey: string): string {
  return `[plugins."${pluginKey}"]`;
}

function notSpelledAsCodexWritesIt(pluginKey: string): string {
  return `it has no ${pluginTableHeader(pluginKey)} table with an 'enabled' line`;
}
