import { appendFile, mkdir } from "fs/promises";
import path from "path";

import { codexHome } from "../helpers/test-utils.js";
import { codexConfigFile } from "./codex-plugin-switch.js";

/**
 * As `codex plugin marketplace add <dir>` leaves config.toml (0.155.1) once that folder is deleted:
 * from then on every `plugin marketplace list` and `plugin list` fails.
 */
export async function holdACodexMarketplaceWhoseFolderIsGone(
  home: string,
  name: string,
): Promise<void> {
  const configFile = codexConfigFile(home);
  const gone = path.join(codexHome(home), "a-folder-since-deleted");
  await mkdir(path.dirname(configFile), { recursive: true });
  await appendFile(
    configFile,
    `\n[marketplaces.${name}]\nsource_type = "local"\nsource = "${gone}"\n`,
  );
}
