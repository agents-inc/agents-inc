/**
 * Where a shell finds a program BY NAME — the path `command -v` answers, or `""` when no directory
 * on the PATH holds one.
 *
 * **For a spec whose red depends on a program being found somewhere OTHER than the PATH**: a CLI
 * that must find no `claude` at all. Such a spec asserts this is `""` before anything else, or it
 * is asserting about whichever machine runs it. Two of this machine's own facts made that
 * concrete: the package manager that starts the suite puts the monorepo's `node_modules/.bin` on
 * PATH, which holds a `tsc`, an `eslint` and a `prettier`; and a global `npm install -g` puts
 * `claude` in the directory `node` itself runs from.
 */

import { execa } from "execa";

/** Started by absolute path, so a PATH under test need not hold a shell to be asked about. */
const POSIX_SHELL = "/bin/sh";

/** On a PATH the caller states. */
export async function foundByName(program: string, searchPath: string): Promise<string> {
  const { stdout } = await execa(POSIX_SHELL, ["-c", `command -v ${program}`], {
    env: { PATH: searchPath },
    extendEnv: false,
    reject: false,
  });
  return stdout;
}
