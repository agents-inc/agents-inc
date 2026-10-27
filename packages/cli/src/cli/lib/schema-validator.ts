import { z } from "zod";

import { inertLine } from "../utils/string";

/** Sanitised here: every part of the rendered text comes from the refused, untrusted document. */
export function formatZodIssue(issue: z.ZodIssue): string {
  if (issue.code === "unrecognized_keys") {
    return `Unrecognized key: "${inertLine(issue.keys.join('", "'))}"`;
  }
  const path = inertLine(issue.path.join("."));
  return path ? `${path}: ${inertLine(issue.message)}` : inertLine(issue.message);
}

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(formatZodIssue);
}
