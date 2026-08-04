import { parse as parseYaml } from "yaml";

export function extractFrontmatter(content: string): unknown | null {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = content.match(frontmatterRegex);

  if (!match || !match[1]) {
    return null;
  }

  try {
    return parseYaml(match[1]);
  } catch {
    return null;
  }
}
