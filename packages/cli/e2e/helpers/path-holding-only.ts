import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";

/**
 * A PATH holding exactly `commands` and nothing else, each linked to the real binary this suite
 * found — for a spec whose machine must lack every program it leaves out.
 */
export async function pathHoldingOnly(
  project: { readonly root: string },
  commands: readonly string[],
): Promise<string> {
  const binDir = path.join(project.root, `path-with-${commands.join("-")}`);
  await mkdir(binDir, { recursive: true });
  for (const command of commands) {
    const real = (await execa("sh", ["-c", `command -v ${command}`])).stdout.trim();
    if (real === "") throw new Error(`this machine has no ${command}, so no spec can remove it`);
    await symlink(real, path.join(binDir, command));
  }
  return binDir;
}
