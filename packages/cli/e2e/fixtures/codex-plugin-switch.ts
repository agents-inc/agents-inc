import { writeFile } from "fs/promises";
import path from "path";

import { codexHome, readTestFile } from "../helpers/test-utils.js";

/**
 * Codex has no verb to switch a plugin off; the switch is the table `plugin add` writes to
 * `config.toml`. Throws when that table is not there, rather than leaving the plugin on.
 */
export async function switchOffCodexPlugin(home: string, pluginKey: string): Promise<void> {
  await rewriteTheSwitchedOnTable(home, pluginKey, `[plugins."${pluginKey}"]\nenabled = false`);
}

/**
 * The same switch under a single-quoted table name: TOML reads it as the same key, and Codex keeps
 * the spelling when a later `plugin add` switches it back on.
 */
export async function switchOffCodexPluginInSingleQuotes(
  home: string,
  pluginKey: string,
): Promise<void> {
  await rewriteTheSwitchedOnTable(home, pluginKey, `[plugins.'${pluginKey}']\nenabled = false`);
}

export function codexConfigFile(home: string): string {
  return path.join(codexHome(home), "config.toml");
}

async function rewriteTheSwitchedOnTable(
  home: string,
  pluginKey: string,
  switchedOff: string,
): Promise<void> {
  const configFile = codexConfigFile(home);
  const switchedOn = `[plugins."${pluginKey}"]\nenabled = true`;

  const config = await readTestFile(configFile);
  if (!config.includes(switchedOn)) {
    throw new Error(`${configFile} holds no '${switchedOn}' to switch off:\n${config}`);
  }
  await writeFile(configFile, config.replace(switchedOn, switchedOff));
}
