import { execCommand } from "./exec.js";
import { getErrorMessage } from "./errors.js";

export type OpenerCommand = { command: string; args: string[] };

/** Never throws: the link is already printed, so failing to open it is reported, not fatal. */
export type OpenUrlResult = { ok: true } | { ok: false; error: string };

// `start` is a cmd builtin; its empty first argument is the window title, or it opens nothing.
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
