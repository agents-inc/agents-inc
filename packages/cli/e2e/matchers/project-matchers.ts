import path from "path";
import { readFile, readdir } from "fs/promises";
import { DIRS, FILES } from "../pages/constants.js";
import {
  configTsPath,
  directoryExists,
  fileExists,
  loadConfigOrFail,
  sourceFolderIn,
} from "../helpers/test-utils.js";

export type PluginScope = "project" | "user";

export type AgentContentExpectations = {
  contains?: readonly string[];
  notContains?: readonly string[];
};

export type ConfigExpectations = {
  /** Ids that need an active (non-excluded) entry in the loaded config. */
  skillIds?: readonly string[];
  /** The config's top-level `marketplace` field. */
  marketplace?: string;
  /** Origin every judged skill must carry; judged over `skillIds` when given, else every entry. */
  origin?: string;
  /** Agent names that need an active (non-excluded) entry. */
  agents?: readonly string[];
};

export type SettingsExpectations = {
  hasKey?: string;
  keyValue?: unknown;
};

// `string`, not `SkillId`: fixture-marketplace ids are outside the catalogue union.
export type LocalSkillIds = readonly string[];

// Optional fields so a matcher reports an absent key instead of throwing.
type ClaudeSettingsFile = {
  enabledPlugins?: Record<string, boolean>;
};

type PluginInstallationRecord = {
  scope: string;
  installPath?: string;
};

type InstalledPluginsFile = {
  plugins?: Record<string, PluginInstallationRecord[]>;
};

function installedSkillMdPath(installPath: string, pluginId: string): string {
  return path.join(installPath, DIRS.SKILLS, pluginId, FILES.SKILL_MD);
}

function pluginIdFromKey(pluginKey: string): string {
  return pluginKey.split("@")[0] ?? pluginKey;
}

// Reads the path the record names: a registry entry alone does not prove content was copied.
async function describeMissingContent(
  installation: PluginInstallationRecord,
  pluginId: string,
): Promise<string | null> {
  const { installPath } = installation;
  if (!installPath) {
    return `installation ${JSON.stringify(installation)} carries no installPath`;
  }
  if (!(await directoryExists(installPath))) {
    return `installPath "${installPath}" does not exist`;
  }
  const skillMdPath = installedSkillMdPath(installPath, pluginId);
  if (!(await fileExists(skillMdPath))) {
    return `installPath "${installPath}" exists but has no ${skillMdPath}`;
  }
  return null;
}

export const projectMatchers = {
  async toHaveConfig(received: { dir: string }, expectations?: ConfigExpectations) {
    const configPath = configTsPath(received.dir);
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
    // Judged on the loaded config, not the text, so comments and tombstones cannot answer.
    const config = await loadConfigOrFail(received.dir);

    const activeSkills = config.skills.filter((skill) => !skill.excluded);
    const activeSkillIds: string[] = activeSkills.map((skill) => skill.id);
    const missingSkill = expectations.skillIds?.find((id) => !activeSkillIds.includes(id));
    if (missingSkill) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to carry an active entry for skill "${missingSkill}" but its active skills are [${activeSkillIds.join(", ")}].\nContent:\n${content}`,
      };
    }

    if (expectations.marketplace !== undefined && config.marketplace !== expectations.marketplace) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to name marketplace "${expectations.marketplace}" but it names "${String(config.marketplace)}".\nContent:\n${content}`,
      };
    }

    // A project config inlines its inherited global install, so judge only the named, active skills.
    const judged = activeSkills.filter(
      (skill) => expectations.skillIds?.includes(skill.id) ?? true,
    );
    const foreignOrigin =
      expectations.origin === undefined
        ? undefined
        : judged.find((skill) => skill.origin !== expectations.origin);
    if (foreignOrigin) {
      return {
        pass: false,
        message: () =>
          `Expected the named skills in config.ts to carry origin "${expectations.origin}" but "${foreignOrigin.id}" carries "${String(foreignOrigin.origin)}".\nContent:\n${content}`,
      };
    }

    const activeAgents: string[] = config.agents
      .filter((agent) => !agent.excluded)
      .map((agent) => agent.name);
    const missingAgent = expectations.agents?.find((agent) => !activeAgents.includes(agent));
    if (missingAgent) {
      return {
        pass: false,
        message: () =>
          `Expected config.ts to carry an active entry for agent "${missingAgent}" but its active agents are [${activeAgents.join(", ")}].\nContent:\n${content}`,
      };
    }

    return {
      pass: true,
      message: () => `Expected config.ts to not match expectations`,
    };
  },

  // Only a non-empty readdir: cannot see a wrong roster. Compare `readCompiledAgents` keys for that.
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

  // The registry record AND the skill content each installation names must exist.
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

    const pluginId = pluginIdFromKey(pluginKey);
    for (const installation of installations) {
      const missingContent = await describeMissingContent(installation, pluginId);
      if (missingContent) {
        return {
          pass: false,
          message: () =>
            `Expected plugin "${pluginKey}" to be installed, but its registry entry has no content on disk: ${missingContent}`,
        };
      }
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

  async toHaveLocalSkills(received: { dir: string }, expectedSkillIds?: LocalSkillIds) {
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

  async toHaveEjectedTemplate(received: { dir: string }) {
    const templatePath = path.join(
      sourceFolderIn(received.dir),
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
    const settings: unknown = JSON.parse(content);

    if (expectations.hasKey) {
      // Cast only to index; a non-object node yields undefined, reported as a missing key.
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
