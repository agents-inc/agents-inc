import { expect } from "vitest";
import { agentMatchers } from "./agent-matchers.js";
import { projectMatchers } from "./project-matchers.js";
import type {
  AgentDynamicSkillsExpectations,
  AgentFrontmatterExpectations,
} from "./agent-matchers.js";
import type {
  AgentContentExpectations,
  ConfigExpectations,
  LocalSkillIds,
  PluginScope,
  SettingsExpectations,
} from "./project-matchers.js";

expect.extend({ ...projectMatchers, ...agentMatchers });

// `agentName`/`skillId` stay `string`: fixture-marketplace skill ids and custom agent names are not
// in the catalogue unions.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TS2428: merged declarations need identical type parameters, so `T` cannot be `_T`
  interface Assertion<T> {
    toHaveConfig(expectations?: ConfigExpectations): Promise<void>;
    toHaveCompiledAgents(): Promise<void>;
    toHaveCompiledAgent(agentName: string): Promise<void>;
    toHaveCompiledAgentContent(
      agentName: string,
      expectations: AgentContentExpectations,
    ): Promise<void>;
    toHaveSkillCopied(skillId: string): Promise<void>;
    toHaveLocalSkills(expectedSkillIds?: LocalSkillIds): Promise<void>;
    toHaveNoLocalSkills(): Promise<void>;
    toHaveNoPlugins(): Promise<void>;
    toHavePlugin(pluginKey: string): Promise<void>;
    toHavePluginInRegistry(pluginKey: string, scope?: PluginScope): Promise<void>;
    toHaveEjectedTemplate(): Promise<void>;
    toHaveSettings(expectations?: SettingsExpectations): Promise<void>;
    toHaveAgentFrontmatter(
      agentName: string,
      expectations: AgentFrontmatterExpectations,
    ): Promise<void>;
    toHaveAgentDynamicSkills(
      agentName: string,
      expectations: AgentDynamicSkillsExpectations,
    ): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    toHaveConfig(expectations?: ConfigExpectations): void;
    toHaveCompiledAgents(): void;
    toHaveCompiledAgent(agentName: string): void;
    toHaveCompiledAgentContent(agentName: string, expectations: AgentContentExpectations): void;
    toHaveSkillCopied(skillId: string): void;
    toHaveLocalSkills(expectedSkillIds?: LocalSkillIds): void;
    toHaveNoLocalSkills(): void;
    toHaveNoPlugins(): void;
    toHavePlugin(pluginKey: string): void;
    toHavePluginInRegistry(pluginKey: string, scope?: PluginScope): void;
    toHaveEjectedTemplate(): void;
    toHaveSettings(expectations?: SettingsExpectations): void;
    toHaveAgentFrontmatter(agentName: string, expectations: AgentFrontmatterExpectations): void;
    toHaveAgentDynamicSkills(agentName: string, expectations: AgentDynamicSkillsExpectations): void;
  }
}
