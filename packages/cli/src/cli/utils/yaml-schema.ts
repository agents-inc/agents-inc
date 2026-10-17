export function yamlSchemaComment(schemaPath: string): string {
  return `# yaml-language-server: $schema=${schemaPath}`;
}

/** `schemaComment` keeps its trailing newline, or is empty when absent. */
export function stripYamlSchemaComment(content: string): {
  schemaComment: string;
  yamlContent: string;
} {
  const lines = content.split("\n");
  if (lines[0]?.startsWith("# yaml-language-server:")) {
    return { schemaComment: `${lines[0]}\n`, yamlContent: lines.slice(1).join("\n") };
  }
  return { schemaComment: "", yamlContent: content };
}
