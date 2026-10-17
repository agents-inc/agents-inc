import { parse as parseYaml } from "yaml";
import { getErrorMessage } from "./errors";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

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

/** Why frontmatter reads as nothing (absent, empty or unparseable), or `undefined` when it reads. */
export function unreadableFrontmatter(content: string): string | undefined {
  const read = readFrontmatter(content);
  if ("unreadable" in read) return read.unreadable;
  return read.parsed === null ? "its frontmatter is empty" : undefined;
}
