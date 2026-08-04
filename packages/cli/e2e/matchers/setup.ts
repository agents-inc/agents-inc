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
  PluginScope,
  SettingsExpectations,
} from "./project-matchers.js";

expect.extend({ ...projectMatchers, ...agentMatchers });

// Augment Vitest's expect types. Every expectation shape is imported from the
// matcher that implements it, so a change to an implementation's parameters is
// a compile error here rather than silent drift between two declarations.
declare module "vitest" {
  // `T` is unused here and cannot be renamed to `_T`: TS2428 requires every
  // declaration of a merged interface to have IDENTICAL type parameters, so the
  // name must match Vitest's own `Assertion<T>` verbatim. The rule's `^_` escape
  // hatch is unusable for declaration merging; see the `**/*.d.ts`-style override
  // recommendation in the accompanying finding.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toHaveConfig(expectations?: ConfigExpectations): Promise<void>;
    toHaveCompiledAgents(): Promise<void>;
    toHaveCompiledAgent(agentName: string): Promise<void>;
    toHaveCompiledAgentContent(
      agentName: string,
      expectations: AgentContentExpectations,
    ): Promise<void>;
    toHaveSkillCopied(skillId: string): Promise<void>;
    toHaveLocalSkills(expectedSkillIds?: string[]): Promise<void>;
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
    toHaveLocalSkills(expectedSkillIds?: string[]): void;
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
