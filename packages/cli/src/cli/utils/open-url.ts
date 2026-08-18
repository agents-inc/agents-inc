import { execCommand } from "./exec.js";
import { getErrorMessage } from "./errors.js";

/** The shell-out one platform answers "open this with whatever handles it" with. */
export type OpenerCommand = { command: string; args: string[] };

/**
 * Never a throw. A machine with no browser, no desktop session or no opener at all is a
 * legitimate place to run this CLI, so failing to open a link is something to say rather than
 * something to fail on — the same posture the seed boundaries take, and for the same reason:
 * the link is already printed by the time this runs, so nothing is lost by it not working.
 */
export type OpenUrlResult = { ok: true } | { ok: false; error: string };

/**
 * The command a platform opens a link with.
 *
 * There is no dependency for this. All three are one-line shell-outs to something the operating
 * system already ships, and a package for it would be a fourth thing to keep current for no
 * behaviour this does not have.
 *
 * Windows goes through `cmd` because `start` is a shell builtin rather than a program, and the
 * empty string after it is its TITLE argument: without one, `start` reads the first quoted
 * argument it is given as the window title and opens nothing.
 */
export function browserOpenerCommand(platform: NodeJS.Platform, url: string): OpenerCommand {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

function openerRefusedMessage(command: string, exitCode: number): string {
  return `Could not open your browser — '${command}' exited ${exitCode}.`;
}

function openerUnavailableMessage(command: string, reason: string): string {
  return `Could not open your browser — '${command}' could not be run: ${reason}`;
}

/**
 * Hands a link to whatever this platform opens links with.
 *
 * The URL travels as its own argument rather than inside a command line: `execCommand` spawns
 * without a shell, so the argument vector is the whole of the injection guard — there is no
 * string for a link to break out of.
 */
export async function openUrl(url: string): Promise<OpenUrlResult> {
  const { command, args } = browserOpenerCommand(process.platform, url);

  try {
    const result = await execCommand(command, args);
    if (result.exitCode !== 0) {
      return { ok: false, error: openerRefusedMessage(command, result.exitCode) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: openerUnavailableMessage(command, getErrorMessage(error)) };
  }
}
