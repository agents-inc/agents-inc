import { parse as parseYaml } from "yaml";
import { getErrorMessage } from "./errors";

/** The YAML between the `---` fences that open a file. */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/** A file's frontmatter, parsed — or why it could not be. */
type FrontmatterRead = { parsed: unknown } | { unreadable: string };

function readFrontmatter(content: string): FrontmatterRead {
  const block = content.match(FRONTMATTER_PATTERN)?.[1];
  if (!block) return { unreadable: "there is no frontmatter between --- fences at its top" };

  try {
    return { parsed: parseYaml(block) };
  } catch (error) {
    return { unreadable: getErrorMessage(error) };
  }
}

export function extractFrontmatter(content: string): unknown {
  const read = readFrontmatter(content);
  return "parsed" in read ? read.parsed : null;
}

/**
 * Why a file's frontmatter reads as nothing at all, or `undefined` when it reads as something.
 *
 * {@link extractFrontmatter} answers `null` for a file with no frontmatter, an empty one, and one
 * whose YAML will not parse, which is all a reader that only skips needs. A caller that names the
 * file it skipped needs to say which of the three it was, with the parser's own reason.
 */
export function unreadableFrontmatter(content: string): string | undefined {
  const read = readFrontmatter(content);
  if ("unreadable" in read) return read.unreadable;
  return read.parsed === null ? "its frontmatter is empty" : undefined;
}
