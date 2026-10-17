import { execa } from "execa";

// By absolute path, so the PATH under test need not hold a shell.
const POSIX_SHELL = "/bin/sh";

/** What `command -v` finds on `searchPath`, or `""`. */
export async function foundByName(program: string, searchPath: string): Promise<string> {
  const { stdout } = await execa(POSIX_SHELL, ["-c", `command -v ${program}`], {
    env: { PATH: searchPath },
    extendEnv: false,
    reject: false,
  });
  return stdout;
}
