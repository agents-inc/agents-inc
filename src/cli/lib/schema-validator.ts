import { z } from "zod";

/** One place for the path-prefixed issue rendering shared by every Zod reporter. */
export function formatZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.join(".");
  if (issue.code === "unrecognized_keys") {
    return `Unrecognized key: "${issue.keys.join('", "')}"`;
  }
  return path ? `${path}: ${issue.message}` : issue.message;
}

export function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(formatZodIssue);
}
