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

// Augment Vitest's expect types. Every expectation shape is imported from the
// matcher that implements it, so a change to an implementation's parameters is
// a compile error here rather than silent drift between two declarations.
//
// `agentName` and `skillId` below are `string` DELIBERATELY. Narrowing each to its
// generated union was measured against both TypeScript projects and refused, rather
// than overlooked. Both families name a file the product wrote, and both directories
// legitimately hold names the PUBLIC catalogue's union does not contain:
//
//   Skills — a fixture marketplace's ids are namespaced, composed by `e2eSkillId` in
//   pages/constants.ts, which is typed `string` because "casting it into one would be a
//   lie about the catalogue". Narrowing `skillId` and `LocalSkillIds` to `SkillId` gives
//   83 errors across 33 files: the fixture ids at the call sites, plus the three shared
//   assertion helpers that pass them through. This is the wall the equivalent narrowing of
//   the fixture-id factory hit, reached from the assertion end rather than the factory end.
//
//   Agents — a user-authored agent compiles to `.claude/agents/` under a name that is not
//   in `AgentName`, which `loadAgentsFromDir` in lib/loading/loader.ts states in its own
//   boundary comment: "custom agents (not in the union) are accepted by the schema's
//   z.string() base". Narrowing `agentName` to `AgentName` gives 8 errors across 3 files,
//   and with the two shared assertion helpers narrowed alongside it the only survivors are
//   6 sites in integration/custom-agents.e2e.test.ts, all `"my-custom-agent"`. That spec
//   asserts the custom agent compiles SUCCESSFULLY, so its name is neither a parse
//   boundary nor error-path data, and the cast that would silence it is not licensed.
//
// The cost is real and was measured too: against these `string` signatures a slug, a
// display name and a one-letter agent typo all pass `tsc` silently at live call sites.
// Closing it needs a type for "catalogue name or not" that does not exist, and
// `AgentName | string` collapses to `string`. Measure BOTH projects before re-filing —
// `tsc --noEmit` reports 0 for the skill narrowing that costs 83 under e2e/tsconfig.json.
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
