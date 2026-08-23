import path from "path";
import { readFile, readdir } from "fs/promises";
import { DIRS, FILES } from "../pages/constants.js";
import { directoryExists, fileExists, loadConfigOrFail } from "../helpers/test-utils.js";

export type PluginScope = "project" | "user";

export type AgentContentExpectations = {
  contains?: readonly string[];
  notContains?: readonly string[];
};

export type ConfigExpectations = {
  /**
   * Skill ids the config must carry an ACTIVE entry for — read off the loaded
   * `skills` array, so a tombstone (`excluded: true`) recording the id's removal
   * does not answer for it and neither does an id appearing anywhere else in the
   * file's text.
   */
  skillIds?: readonly string[];
  /**
   * The config's own top-level `marketplace` — the address every unflagged load resolves
   * from. Keyed to that field rather than searched for in the file, because a marketplace
   * name is also every plugin-installed skill's `origin` and frequently a path segment
   * besides: an unkeyed `includes` was answered by whichever occurrence came first.
   */
  marketplace?: string;
  /**
   * The `origin` the named skills must carry — `"eject"` for a local-copy install, the
   * marketplace's name for a plugin one. A separate expectation from `marketplace`
   * because they answer different questions and only one of them is ever `"eject"`.
   * Judged over `skillIds` when that is given, and over every entry when it is not.
   */
  origin?: string;
  /**
   * Sub-agent names the config must carry an ACTIVE entry for, read off the loaded
   * `agents` array on the same terms as {@link ConfigExpectations.skillIds} — a
   * name that survives only as a tombstone, or only as a `stack` key, is not one
   * this installation has.
   */
  agents?: readonly string[];
};

export type SettingsExpectations = {
  hasKey?: string;
  keyValue?: unknown;
};

/** The skill ids `toHaveLocalSkills` requires to be present; omitted means "any entries". */
export type LocalSkillIds = readonly string[];

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
  installPath?: string;
};

type InstalledPluginsFile = {
  plugins?: Record<string, PluginInstallationRecord[]>;
};

/** Skill content lives under `<installPath>/skills/<pluginId>/SKILL.md`. */
function installedSkillMdPath(installPath: string, pluginId: string): string {
  return path.join(installPath, DIRS.SKILLS, pluginId, FILES.SKILL_MD);
}

/** The skill id half of a `<skillId>@<marketplace>` registry key. */
function pluginIdFromKey(pluginKey: string): string {
  return pluginKey.split("@")[0] ?? pluginKey;
}

/**
 * Why an installation record does not stand for installed content, or null when
 * it does.
 *
 * A record and the files it names are written by two separate acts of
 * `claude plugin install`, so the record alone proves only that something was
 * *registered*. The content is what a skill is, so that is what gets checked:
 * the path the record itself names must exist and must hold this plugin's
 * SKILL.md. The path is read from the record rather than reconstructed from the
 * cache layout — a matcher that rebuilt the path would stop noticing a record
 * pointing somewhere else entirely.
 */
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
  /**
   * Checks that .claude-src/config.ts exists and optionally validates content.
   * Usage: await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] })
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
    // Every field is judged on the LOADED config, never on the file's text. An
    // unkeyed `includes` is answered by whichever occurrence comes first: an id
    // inside a comment, inside a longer id that contains it, or inside a tombstone
    // recording that the entry was REMOVED. Measured against a config built by the
    // real writer: `agents: ["web-developer"]` and `skillIds: [react]` both passed
    // for entries carrying `excluded: true`.
    const config = await loadConfigOrFail(received.dir);

    const activeSkills = config.skills.filter((skill) => !skill.excluded);
    // `string[]`, not `SkillId[]`: a fixture marketplace's ids are namespaced and are
    // not members of the public catalogue's union, which is why the expectations are
    // `readonly string[]` too.
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

    // Scoped twice, because a project config inlines the global install it inherits.
    // To the ids the same expectation names, since an install is routinely mixed and
    // "every entry in the file" would be a claim about skills the expectation never
    // mentioned; and to the ACTIVE entries, since a tombstone (`excluded: true`) records
    // the masked global row rather than anything this config installed. With no
    // `skillIds`, the expectation is about the whole config and every active entry answers.
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

  /**
   * Checks that `.claude/agents/` exists and holds at least one `.md`.
   *
   * **A `readdir` and a non-empty check, and nothing more** — so it cannot see a wrong
   * roster, a swap or stale content, and on any flow that runs after an install the
   * install alone satisfies it. That makes it the wrong tool for a spec whose subject IS
   * the roster: use `readCompiledAgents(dir)` and compare `Object.keys` against a named
   * constant with `toStrictEqual` (`E2E_STACK_AGENTS.map(a => `${a}.md`)` is the derived
   * one), or `toHaveCompiledAgent(name)` for a single named agent, which also proves the
   * file carries frontmatter.
   *
   * What it is still right for, and both callers of each are commented on site: a spec
   * that means "an install reached this directory at all" when the roster belongs to
   * product data the spec is not about, and `.not.` — an absence has no roster to get
   * wrong, so the weak reading is the correct one there.
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
   * Checks that a plugin is really installed: its record exists in the registry
   * at <dir>/.claude/plugins/installed_plugins.json AND every installation the
   * record lists resolves to real skill content on disk.
   *
   * The content check is not incidental. A registry entry is what the Claude CLI
   * writes *about* an install, so on its own it passes for an install that
   * registered a path and copied nothing — the exact shape of a "plugins never
   * installed" report. Only the files make the claim true.
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
