/** Generates a yaml-language-server schema comment for the top of YAML files. */
export function yamlSchemaComment(schemaPath: string): string {
  return `# yaml-language-server: $schema=${schemaPath}`;
}

/**
 * Splits YAML file content into its leading yaml-language-server schema
 * comment (empty string when absent, trailing newline included when present)
 * and the parseable YAML body.
 */
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
