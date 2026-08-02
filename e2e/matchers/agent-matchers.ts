import path from "path";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { DIRS } from "../pages/constants.js";
import { fileExists } from "../helpers/test-utils.js";

/**
 * Parses compiled-agent frontmatter with the real YAML parser. Compiled agents
 * are consumed by Claude Code itself, so their frontmatter is guaranteed valid
 * YAML; a parse failure is a genuine product defect, surfaced via null.
 */
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

export type AgentFrontmatterExpectations = {
  name?: string;
  description?: string;
  model?: string;
  effort?: string;
  /**
   * No `effort` key at all. An agent's effort has no default — it is emitted only when a config
   * or the agent's own metadata names one — so "absent" is a distinct outcome from any value and
   * needs its own expectation. Read off the parsed YAML rather than the raw text, because
   * `effort` occurs in agent prose too.
   */
  noEffort?: boolean;
  tools?: readonly string[];
  /** Preloads that must be present. Extra entries pass — use `exactSkills` to forbid them. */
  skills?: readonly string[];
  /**
   * The whole preload list, in order. `skills` is a subset check, so it passes on an agent that
   * preloads everything it holds — the exact failure mode a preload-fidelity spec exists to catch.
   */
  exactSkills?: readonly string[];
  hasSkills?: boolean;
  noSkills?: boolean;
};

export type AgentDynamicSkillsExpectations = {
  skillIds?: readonly string[];
  noSkillIds?: readonly string[];
  hasActivationProtocol?: boolean;
  allPreloaded?: boolean;
};

export const agentMatchers = {
  /** Verify parsed YAML frontmatter fields of a compiled agent */
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

    const fm = parseYamlFrontmatter(fmMatch[1]);
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
            `Expected agent frontmatter ${field} to be "${expected}" but got "${fm[field]}"`,
        };
      }
    }

    if (expectations.noEffort && fm.effort !== undefined) {
      return {
        pass: false,
        message: () =>
          `Expected agent "${agentName}" frontmatter to carry no effort but got "${fm.effort}"`,
      };
    }

    if (expectations.tools) {
      const tools = asStringArray(fm.tools);
      const missingTool = expectations.tools.find((tool) => !tools.includes(tool));
      if (missingTool) {
        return {
          pass: false,
          message: () =>
            `Expected agent frontmatter tools to contain "${missingTool}" but found: ${JSON.stringify(tools)}`,
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

  /** Verify dynamic skill activation section in agent body */
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
    // Strip the leading frontmatter block ONLY. `split()` cuts on EVERY match, and a compiled
    // agent's body is full of `---` horizontal rules, so taking element [1] returned the first
    // ~1KB of a ~39KB file: every `skillIds` expectation was unsatisfiable and every `noSkillIds`
    // one passed on absence from a slice nothing is rendered into.
    const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");

    const missingId = expectations.skillIds?.find((id) => !body.includes(id));
    if (missingId) {
      return {
        pass: false,
        message: () =>
          `Expected agent body to contain skill "${missingId}" but it does not.\nBody excerpt:\n${body.slice(0, 500)}`,
      };
    }

    const forbiddenId = expectations.noSkillIds?.find((id) => body.includes(id));
    if (forbiddenId) {
      return {
        pass: false,
        message: () => `Expected agent body to NOT contain skill "${forbiddenId}" but it does`,
      };
    }

    if (expectations.hasActivationProtocol) {
      const hasProtocol = body.includes("<skill_activation_protocol>");
      const hasNote = body.includes("<skills_note>");
      if (!hasProtocol && !hasNote) {
        return {
          pass: false,
          message: () =>
            `Expected agent body to have skill activation protocol or skills note but found neither`,
        };
      }
    }

    if (expectations.allPreloaded) {
      const hasDynamic = body.includes("<skill_activation_protocol>");
      if (hasDynamic) {
        return {
          pass: false,
          message: () =>
            `Expected all skills to be preloaded (no activation protocol) but found <skill_activation_protocol>`,
        };
      }
    }

    return {
      pass: true,
      message: () => `Expected agent "${agentName}" dynamic skills to not match expectations`,
    };
  },
};
