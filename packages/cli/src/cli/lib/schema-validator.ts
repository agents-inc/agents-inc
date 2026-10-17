import { z } from "zod";

import { stripTerminalControls } from "../utils/string";

/** Sanitised here: every part of the rendered text comes from the refused, untrusted document. */
export function formatZodIssue(issue: z.ZodIssue): string {
  const path = stripTerminalControls(issue.path.join("."));
  if (issue.code === "unrecognized_keys") {
    return `Unrecognized key: "${stripTerminalControls(issue.keys.join('", "'))}"`;
  }
  return path
    ? `${path}: ${stripTerminalControls(issue.message)}`
    : stripTerminalControls(issue.message);
}

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(formatZodIssue);
}
