import type { AgentName, ValidationResult } from "../types";
import { extractFrontmatter } from "../utils/frontmatter";
import { log } from "../utils/logger";

export function checkXmlTagBalance(content: string): string[] {
  const errors: string[] = [];
  const tagRegex = /<\/?([a-z_][a-z0-9_-]*)\s*>/gi;
  const tagCounts = new Map<string, number>();

  for (const match of content.matchAll(tagRegex)) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();

    const before = content.slice(Math.max(0, match.index - 10), match.index);
    const after = content.slice(match.index + fullTag.length, match.index + fullTag.length + 10);
    if (before.includes("`") || after.includes("`")) {
      continue;
    }

    const isClosing = fullTag.startsWith("</");
    const current = tagCounts.get(tagName) || 0;
    tagCounts.set(tagName, isClosing ? current - 1 : current + 1);
  }

  for (const [tag, count] of tagCounts) {
    if (count > 0) {
      errors.push(`Unclosed XML tag: <${tag}> (${count} unclosed)`);
    } else if (count < 0) {
      errors.push(`Extra closing tag: </${tag}> (${Math.abs(count)} extra)`);
    }
  }

  return errors;
}

export function checkTemplateArtifacts(content: string): string[] {
  const warnings: string[] = [];

  const variableMatches = content.match(/\{\{[^}]*\}\}/g);
  if (variableMatches) {
    warnings.push(`Template artifacts found: ${variableMatches.length} unprocessed {{ }} tags`);
  }

  const controlMatches = content.match(/\{%[^%]*%\}/g);
  if (controlMatches) {
    warnings.push(`Template artifacts found: ${controlMatches.length} unprocessed {% %} tags`);
  }

  return warnings;
}

export function checkRequiredPatterns(content: string): string[] {
  const warnings: string[] = [];

  if (!content.startsWith("---")) {
    warnings.push("Missing YAML frontmatter at start of file");
  }

  if (!content.includes("<role>")) {
    warnings.push("Missing <role> section");
  }

  if (!content.includes("Core Principles") && !content.includes("core_principles")) {
    warnings.push("Missing Core Principles section");
  }

  const lines = content.trim().split("\n");
  if (lines.length < 50) {
    warnings.push(`Suspiciously short output: only ${lines.length} lines`);
  }

  return warnings;
}

export function validateFrontmatter(content: string): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const frontmatter = extractFrontmatter(content);

  if (frontmatter === null) {
    errors.push("Failed to parse YAML frontmatter");
    return { errors, warnings };
  }

  // Boundary cast: YAML frontmatter parsed as unknown, narrow to record for field access
  const fm = frontmatter as Record<string, unknown>;

  if (!fm.name || typeof fm.name !== "string") {
    errors.push("Frontmatter missing required field: name");
  }

  if (!fm.description || typeof fm.description !== "string") {
    warnings.push("Frontmatter missing field: description");
  }

  if (!fm.tools || typeof fm.tools !== "string") {
    warnings.push("Frontmatter missing field: tools");
  }

  return { errors, warnings };
}

export function validateCompiledAgent(content: string): ValidationResult {
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      errors: ["Compiled output is empty"],
      warnings: [],
    };
  }

  const fmResult = validateFrontmatter(content);
  const errors = [...fmResult.errors, ...checkXmlTagBalance(content)];
  const warnings = [
    ...fmResult.warnings,
    ...checkTemplateArtifacts(content),
    ...checkRequiredPatterns(content),
  ];

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function printOutputValidationResult(agentName: AgentName, result: ValidationResult): void {
  if (result.errors.length > 0) {
    log(`    Validation errors for ${agentName}:`);
    result.errors.forEach((e) => log(`      - ${e}`));
  }

  if (result.warnings.length > 0) {
    log(`    Validation warnings for ${agentName}:`);
    result.warnings.forEach((w) => log(`      - ${w}`));
  }
}
