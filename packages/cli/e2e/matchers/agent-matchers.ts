import path from "path";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { DIRS } from "../pages/constants.js";
import { fileExists, parseCompiledAgentSections } from "../helpers/test-utils.js";

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
  /**
   * Ids that must appear as DYNAMIC entries — the `### ` headings of the activation
   * protocol, which carry the bare id in plugin and eject mode alike.
   *
   * Read off the parsed section rather than scanned for. `body.includes(id)` was
   * satisfied by an id sitting inside a longer id, inside a preload's `id:id` ref, and
   * inside the agent's own prose, and every compiled body in the tree carries prose
   * naming skills.
   */
  skillIds?: readonly string[];
  /**
   * Ids that must appear in NEITHER list: not preloaded in the frontmatter — in either
   * ref form — and not activated in the body.
   */
  noSkillIds?: readonly string[];
  /** No activation protocol at all, which is the arm the template renders when nothing is lazy. */
  allPreloaded?: boolean;
};

/**
 * `agentName` is `string` on both matchers below, not `AgentName`. A user-authored agent
 * compiles to `.claude/agents/` under a name the generated union cannot contain, so the
 * union would make a supported product behaviour inexpressible; the measurement that
 * refused the narrowing is above the `declare module "vitest"` block in setup.ts.
 */
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

/** Whether a preload list names this skill, in the plugin `id:id` form or as the bare id. */
function preloads(refs: readonly string[], id: string): boolean {
  return refs.includes(id) || refs.includes(`${id}:${id}`);
}
