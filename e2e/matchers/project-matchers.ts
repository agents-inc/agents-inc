import path from "path";
import { readFile, readdir } from "fs/promises";
import { DIRS, FILES } from "../pages/constants.js";
import { directoryExists, fileExists } from "../helpers/test-utils.js";

export type PluginScope = "project" | "user";

export type AgentContentExpectations = {
  contains?: readonly string[];
  notContains?: readonly string[];
};

export type ConfigExpectations = {
  skillIds?: readonly string[];
  source?: string;
  agents?: readonly string[];
};

export type SettingsExpectations = {
  hasKey?: string;
  keyValue?: unknown;
};

/**
 * Boundary shapes for the JSON artifacts these matchers read.
 *
 * `JSON.parse` returns `any`, which silently disables checking on every field
 * access downstream. Annotating the parse result narrows it to exactly the
 * slice each matcher inspects — no cast is involved, since `any` is assignable
 * to any annotation.
 *
 * Every field is optional on purpose: these files are produced by the CLI under
 * test and by Claude Code, so a matcher must be able to observe that a key is
 * absent and fail with its own message rather than throw a TypeError. Fields
 * the matchers never read are deliberately omitted rather than modelled.
 */
type ClaudeSettingsFile = {
  enabledPlugins?: Record<string, boolean>;
};

type PluginInstallationRecord = {
  scope: string;
};

type InstalledPluginsFile = {
  plugins?: Record<string, PluginInstallationRecord[]>;
};

export const projectMatchers = {
  /**
   * Checks that .claude-src/config.ts exists and optionally validates content.
   * Usage: await expect(project).toHaveConfig({ skillIds: ["web-framework-react"] })
   */
  async toHaveConfig(received: { dir: string }, expectations?: ConfigExpectations) {
    const configPath = path.join(received.dir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
    const exists = await fileExists(configPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected config.ts at ${configPath} but it does not exist`,
      };
    }

    if (!expectations) {
      return {
        pass: true,
        message: () => `Expected config.ts to not exist at ${configPath}`,
      };
    }

    const content = await readFile(configPath, "utf-8");

    const missingSkill = expectations.skillIds?.find((id) => !content.includes(id));
    if (missingSkill) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to contain skill "${missingSkill}" but it does not.\nContent:\n${content}`,
      };
    }

    if (expectations.source && !content.includes(expectations.source)) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to contain source "${expectations.source}" but it does not.\nContent:\n${content}`,
      };
    }

    const missingAgent = expectations.agents?.find((agent) => !content.includes(agent));
    if (missingAgent) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to contain agent "${missingAgent}" but it does not.\nContent:\n${content}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected config.ts to not match expectations`,
    };
  },

  /**
   * Checks that compiled agent .md files exist in .claude/agents/.
   */
  async toHaveCompiledAgents(received: { dir: string }) {
    const agentsDir = path.join(received.dir, DIRS.CLAUDE, DIRS.AGENTS);
    const exists = await directoryExists(agentsDir);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected agents directory at ${agentsDir} but it does not exist`,
      };
    }

    const entries = await readdir(agentsDir);
    const mdFiles = entries.filter((f) => f.endsWith(".md"));

    if (mdFiles.length === 0) {
      return {
        pass: false,
        message: () =>
          `Expected compiled agent .md files in ${agentsDir} but found none. Entries: ${entries.join(", ")}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected no compiled agents in ${agentsDir} but found: ${mdFiles.join(", ")}`,
    };
  },

  /**
   * Checks that a specific agent was compiled (has .md file with frontmatter).
   */
  async toHaveCompiledAgent(received: { dir: string }, agentName: string) {
    const agentPath = path.join(received.dir, DIRS.CLAUDE, DIRS.AGENTS, `${agentName}.md`);
    const exists = await fileExists(agentPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected compiled agent at ${agentPath} but it does not exist`,
      };
    }

    const content = await readFile(agentPath, "utf-8");
    if (!content.startsWith("---")) {
      return {
        pass: false,
        message: () =>
          `Expected agent file to start with YAML frontmatter but got:\n${content.slice(0, 100)}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected no compiled agent "${agentName}" at ${agentPath}`,
    };
  },

  /**
   * Checks that a skill was copied locally.
   */
  async toHaveSkillCopied(received: { dir: string }, skillId: string) {
    const skillMdPath = path.join(received.dir, DIRS.CLAUDE, DIRS.SKILLS, skillId, FILES.SKILL_MD);
    const exists = await fileExists(skillMdPath);

    return {
      pass: exists,
      message: () =>
        exists
          ? `Expected skill "${skillId}" to not be copied locally`
          : `Expected skill "${skillId}" to be copied locally at ${skillMdPath}`,
    };
  },

  /**
   * Checks that no local skills exist.
   */
  async toHaveNoLocalSkills(received: { dir: string }) {
    const skillsDir = path.join(received.dir, DIRS.CLAUDE, DIRS.SKILLS);
    const exists = await directoryExists(skillsDir);

    if (!exists) {
      return { pass: true, message: () => `Expected local skills to exist` };
    }

    const entries = await readdir(skillsDir);
    return {
      pass: entries.length === 0,
      message: () =>
        entries.length === 0
          ? `Expected local skills to exist`
          : `Expected no local skills but found: ${entries.join(", ")}`,
    };
  },

  /**
   * Checks that no plugins are enabled in settings.json.
   */
  async toHaveNoPlugins(received: { dir: string }) {
    const settingsPath = path.join(received.dir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    const exists = await fileExists(settingsPath);

    if (!exists) {
      return { pass: true, message: () => `Expected plugins to exist` };
    }

    const content = await readFile(settingsPath, "utf-8");
    const settings: ClaudeSettingsFile = JSON.parse(content);
    const enabled = settings.enabledPlugins;

    if (!enabled) {
      return { pass: true, message: () => `Expected plugins to exist` };
    }

    const activeKeys = Object.entries(enabled).filter(([, v]) => v === true);
    return {
      pass: activeKeys.length === 0,
      message: () =>
        activeKeys.length === 0
          ? `Expected plugins to exist`
          : `Expected no plugins but found: ${activeKeys.map(([k]) => k).join(", ")}`,
    };
  },

  /**
   * Checks that a plugin is enabled in settings.json.
   */
  async toHavePlugin(received: { dir: string }, pluginKey: string) {
    const settingsPath = path.join(received.dir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    const exists = await fileExists(settingsPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected settings.json at ${settingsPath} but it does not exist`,
      };
    }

    const content = await readFile(settingsPath, "utf-8");
    const settings: ClaudeSettingsFile = JSON.parse(content);
    const isEnabled = settings.enabledPlugins?.[pluginKey] === true;

    return {
      pass: isEnabled,
      message: () =>
        isEnabled
          ? `Expected plugin "${pluginKey}" to not be enabled`
          : `Expected plugin "${pluginKey}" to be enabled in settings.json`,
    };
  },

  /**
   * Checks that a plugin's installation record exists in the global registry
   * at <dir>/.claude/plugins/installed_plugins.json.
   */
  async toHavePluginInRegistry(received: { dir: string }, pluginKey: string, scope?: PluginScope) {
    const registryPath = path.join(
      received.dir,
      DIRS.CLAUDE,
      DIRS.PLUGINS,
      FILES.INSTALLED_PLUGINS_JSON,
    );
    const exists = await fileExists(registryPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected plugin registry at ${registryPath} but it does not exist`,
      };
    }

    const content = await readFile(registryPath, "utf-8");
    const registry: InstalledPluginsFile = JSON.parse(content);
    const installations = registry.plugins?.[pluginKey];

    if (!Array.isArray(installations) || installations.length === 0) {
      return {
        pass: false,
        message: () => `Expected plugin "${pluginKey}" to be in registry but it was not found`,
      };
    }

    if (scope) {
      const hasScope = installations.some((i) => i.scope === scope);
      return {
        pass: hasScope,
        message: () =>
          hasScope
            ? `Expected plugin "${pluginKey}" to not have scope "${scope}" in registry`
            : `Expected plugin "${pluginKey}" to have scope "${scope}" in registry but found: ${JSON.stringify(installations)}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected plugin "${pluginKey}" to not be in registry`,
    };
  },

  /**
   * Checks that a compiled agent contains (or does not contain) expected text.
   * Usage: await expect({ dir }).toHaveCompiledAgentContent("web-developer", { contains: ["skill-id"], notContains: ["other-skill"] })
   */
  async toHaveCompiledAgentContent(
    received: { dir: string },
    agentName: string,
    expectations: AgentContentExpectations,
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

    const missingText = expectations.contains?.find((text) => !content.includes(text));
    if (missingText) {
      return {
        pass: false,
        message: () =>
          `Expected compiled agent "${agentName}" to contain "${missingText}" but it does not.\nContent excerpt:\n${content.slice(0, 500)}`,
      };
    }

    const forbiddenText = expectations.notContains?.find((text) => content.includes(text));
    if (forbiddenText) {
      return {
        pass: false,
        message: () =>
          `Expected compiled agent "${agentName}" to NOT contain "${forbiddenText}" but it does`,
      };
    }

    return {
      pass: true,
      message: () => `Expected compiled agent "${agentName}" to not match content expectations`,
    };
  },

  /**
   * Checks that the .claude/skills/ directory has the expected number of entries,
   * or optionally that specific skill IDs exist.
   */
  async toHaveLocalSkills(received: { dir: string }, expectedSkillIds?: readonly string[]) {
    const skillsDir = path.join(received.dir, DIRS.CLAUDE, DIRS.SKILLS);
    const exists = await directoryExists(skillsDir);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected skills directory at ${skillsDir} but it does not exist`,
      };
    }

    const entries = await readdir(skillsDir);

    const missingId = expectedSkillIds?.find((id) => !entries.includes(id));
    if (missingId) {
      return {
        pass: false,
        message: () =>
          `Expected skill "${missingId}" in ${skillsDir} but found: ${entries.join(", ")}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected no local skills but found: ${entries.join(", ")}`,
    };
  },

  /**
   * Checks that the ejected template (agent.liquid) exists.
   */
  async toHaveEjectedTemplate(received: { dir: string }) {
    const templatePath = path.join(
      received.dir,
      DIRS.CLAUDE_SRC,
      "agents",
      "_templates",
      "agent.liquid",
    );
    const exists = await fileExists(templatePath);

    return {
      pass: exists,
      message: () =>
        exists
          ? `Expected ejected template to not exist at ${templatePath}`
          : `Expected ejected template at ${templatePath} but it does not exist`,
    };
  },

  /**
   * Checks that settings.json exists and optionally validates its content.
   */
  async toHaveSettings(received: { dir: string }, expectations?: SettingsExpectations) {
    const settingsPath = path.join(received.dir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
    const exists = await fileExists(settingsPath);

    if (!exists) {
      return {
        pass: false,
        message: () => `Expected settings.json at ${settingsPath} but it does not exist`,
      };
    }

    if (!expectations) {
      return {
        pass: true,
        message: () => `Expected settings.json to not exist at ${settingsPath}`,
      };
    }

    const content = await readFile(settingsPath, "utf-8");
    // `hasKey` is an arbitrary caller-supplied dotted path, so this matcher
    // treats settings.json as an opaque JSON tree rather than a known shape.
    const settings: unknown = JSON.parse(content);

    if (expectations.hasKey) {
      // Each step claims the current node is an object solely to index it. The
      // claim is unverified by design: a non-object (or missing) node yields
      // `undefined`, which the check below reports as a missing key.
      const val = expectations.hasKey
        .split(".")
        .reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], settings);
      if (val === undefined) {
        return {
          pass: false,
          message: () =>
            `Expected settings.json to have key "${expectations.hasKey}" but it does not.\nContent:\n${content}`,
        };
      }
      if (expectations.keyValue !== undefined && val !== expectations.keyValue) {
        return {
          pass: false,
          message: () =>
            `Expected settings.json key "${expectations.hasKey}" to be ${JSON.stringify(expectations.keyValue)} but got ${JSON.stringify(val)}`,
        };
      }
    }

    return {
      pass: true,
      message: () => `Expected settings.json to not match expectations`,
    };
  },
};
