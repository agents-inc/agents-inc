import { z } from "zod";

import { stripTerminalControls } from "../utils/string";

/**
 * One place for the path-prefixed issue rendering shared by every Zod reporter.
 *
 * Which is also why the sanitising is here. Every part of this sentence is built out of the
 * REFUSED DOCUMENT rather than out of the schema: a path segment and an unrecognised key are
 * object keys the document chose, and a message quotes the value it received. So the text this
 * renders is always the text of whatever was being validated — and the documents reaching it are
 * a stranger's `SKILL.md` frontmatter, their `metadata.yaml`, their marketplace manifest and
 * whatever arrived on stdin.
 *
 * Sanitised at the renderer rather than at its callers because there are around twenty of them
 * and a new reporter is a normal thing to add. Made inert rather than shortened: a validation
 * message that lost the key it was naming would stop being a validation message.
 */
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
