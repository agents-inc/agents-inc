import path from "path";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { DIRS } from "../pages/constants.js";
import { fileExists, parseCompiledAgentSections } from "../helpers/test-utils.js";

// Null on a parse failure: compiled frontmatter must be valid YAML. The cast follows the object check.
function parseYamlFrontmatter(yaml: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = parseYaml(yaml);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

// `agent.liquid` writes the allowlist as one comma-separated string, the form Claude Code reads.
function grantedTools(value: unknown): string[] {
  return typeof value === "string" ? value.split(",").map((tool) => tool.trim()) : [];
}

const STOP_HOOK_EVENTS = ["Stop", "SubagentStop"] as const;

function carriesAStopHook(hooks: unknown): boolean {
  if (typeof hooks !== "object" || hooks === null) return false;

  return STOP_HOOK_EVENTS.some((event) => {
    const definitions: unknown = Reflect.get(hooks, event);
    return Array.isArray(definitions) && definitions.length > 0;
  });
}

export type AgentFrontmatterExpectations = {
  name?: string;
  description?: string;
  model?: string;
  effort?: string;
  /** No `effort` key at all; effort has no default, so absence is its own outcome. */
  noEffort?: boolean;
  /** Subset check of the comma-separated `tools:` line. */
  tools?: readonly string[];
  /** Subset check; use `exactSkills` to forbid extras. */
  skills?: readonly string[];
  /** The whole preload list, in order. */
  exactSkills?: readonly string[];
  hasSkills?: boolean;
  noSkills?: boolean;
  /** A hook under `Stop` or `SubagentStop`, read off the parsed YAML. */
  stopHook?: boolean;
};

export type AgentDynamicSkillsExpectations = {
  /** Ids that must be `### ` headings of the activation protocol, read off the parsed section. */
  skillIds?: readonly string[];
  /** Ids neither preloaded (either ref form) nor activated. */
  noSkillIds?: readonly string[];
  /** No activation protocol at all. */
  allPreloaded?: boolean;
};

export const agentMatchers = {
  async toHaveAgentFrontmatter(
    received: { dir: string },
    agentName: string,
    expectations: AgentFrontmatterExpectations,
  ) {
    const agentPath = path.join(received.dir, DIRS.CLAUDE, DIRS.AGENTS, `${agentName}.md`);
    const exists = await fileExists(agentPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected compiled agent at ${agentPath} but it does not exist`,
      };
    }

    const content = await readFile(agentPath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      return {
        pass: false,
        message: () => `Expected agent "${agentName}" to have YAML frontmatter but none was found`,
      };
    }

    const frontmatterYaml = fmMatch[1] ?? "";
    const fm = parseYamlFrontmatter(frontmatterYaml);
    if (!fm) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" frontmatter to parse as YAML but it did not:\n${fmMatch[1]}`,
      };
    }

    const scalarChecks = [
      ["name", expectations.name],
      ["description", expectations.description],
      ["model", expectations.model],
      ["effort", expectations.effort],
    ] as const;
    for (const [field, expected] of scalarChecks) {
      if (expected !== undefined && fm[field] !== expected) {
        return {
          pass: false,
          message: () =>
            `Expected agent frontmatter ${field} to be "${expected}" but got "${String(fm[field])}"`,
        };
      }
    }

    if (expectations.noEffort && fm.effort !== undefined) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" frontmatter to carry no effort but got "${String(fm.effort)}"`,
      };
    }

    const { stopHook } = expectations;
    if (stopHook !== undefined && carriesAStopHook(fm.hooks) !== stopHook) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" frontmatter to carry ${stopHook ? "a" : "no"} Stop hook but its hooks are ${JSON.stringify(fm.hooks)}`,
      };
    }

    if (expectations.tools) {
      const tools = grantedTools(fm.tools);
      const missingTool = expectations.tools.find((tool) => !tools.includes(tool));
      if (missingTool) {
        return {
          pass: false,
          message: () =>
            `Expected agent frontmatter tools to contain "${missingTool}" but found: ${JSON.stringify(fm.tools)}`,
        };
      }
    }

    const skills = asStringArray(fm.skills);

    if (expectations.skills) {
      const missingSkill = expectations.skills.find((skill) => !skills.includes(skill));
      if (missingSkill) {
        return {
          pass: false,
          message: () =>
            `Expected agent frontmatter skills to contain "${missingSkill}" but found: ${JSON.stringify(skills)}`,
        };
      }
    }

    if (expectations.exactSkills) {
      const expected = [...expectations.exactSkills];
      const matches =
        skills.length === expected.length && expected.every((skill, i) => skills[i] === skill);
      if (!matches) {
        return {
          pass: false,
          message: () =>
            `Expected agent frontmatter skills to be exactly ${JSON.stringify(expected)} but found: ${JSON.stringify(skills)}`,
        };
      }
    }

    if (expectations.hasSkills && skills.length === 0) {
      return {
        pass: false,
        message: () => `Expected agent frontmatter to have skills but found none`,
      };
    }

    if (expectations.noSkills && skills.length > 0) {
      return {
        pass: false,
        message: () =>
          `Expected agent frontmatter to have no skills but found: ${JSON.stringify(skills)}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected agent "${agentName}" frontmatter to not match expectations`,
    };
  },

  async toHaveAgentDynamicSkills(
    received: { dir: string },
    agentName: string,
    expectations: AgentDynamicSkillsExpectations,
  ) {
    const agentPath = path.join(received.dir, DIRS.CLAUDE, DIRS.AGENTS, `${agentName}.md`);
    const exists = await fileExists(agentPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected compiled agent at ${agentPath} but it does not exist`,
      };
    }

    const content = await readFile(agentPath, "utf-8");
    const { preloadedRefs, dynamicEntries } = parseCompiledAgentSections(content);
    const dynamicIds = dynamicEntries.map((entry) => entry.id);

    const missingId = expectations.skillIds?.find((id) => !dynamicIds.includes(id));
    if (missingId) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" to activate skill "${missingId}" dynamically but its protocol names: ${JSON.stringify(dynamicIds)}`,
      };
    }

    const forbiddenId = expectations.noSkillIds?.find(
      (id) => dynamicIds.includes(id) || preloads(preloadedRefs, id),
    );
    if (forbiddenId) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" to carry no skill "${forbiddenId}" but it preloads ${JSON.stringify(preloadedRefs)} and activates ${JSON.stringify(dynamicIds)}`,
      };
    }

    if (expectations.allPreloaded && dynamicEntries.length > 0) {
      return {
        pass: false,
        message: () =>
          `Expected all skills to be preloaded (no activation protocol) but agent "${agentName}" activates ${JSON.stringify(dynamicIds)}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected agent "${agentName}" dynamic skills to not match expectations`,
    };
  },
};

function preloads(refs: readonly string[], id: string): boolean {
  return refs.includes(id) || refs.includes(`${id}:${id}`);
}
