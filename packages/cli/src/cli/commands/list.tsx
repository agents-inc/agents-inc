import React, { useEffect } from "react";

import { Box, Text, useApp } from "ink";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import { CLI_INVOKE_COMMAND, CLI_COLORS, DEFAULT_BRANDING } from "../consts.js";
import { chooseProviderForThisRun } from "../lib/installation/install-layout.js";
import {
  otherInstallationsInThisScope,
  providerFlag,
  providerNamedBy,
} from "../lib/installation/provider-flag.js";
import { getInstallationInfo, formatInstallationDisplay } from "../lib/plugins/index.js";
import {
  detectInstallation,
  INSTALL_MODE_LABELS,
  type Installation,
} from "../lib/installation/installation.js";
import { loadProjectConfig } from "../lib/configuration/project-config.js";
import { computeScopeDiff, type SkillDiffRow } from "../lib/configuration/scope-diff.js";
import { getSkillEntryDisplayName } from "../lib/matrix/matrix-provider.js";
import { SkillAgentSummary } from "../components/common/skill-agent-summary.js";
import type {
  AgentScopeConfig,
  ProjectConfig,
  SkillConfig,
  SkillScope,
} from "../types/config.js";

type ListViewProps = {
  mode: string;
  source?: string | undefined;
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
};

type ActiveRoster = Pick<ListViewProps, "skillConfigs" | "agentConfigs">;

/** The label never shrinks: a value too long for the line wraps beside it instead. */
const HeaderRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box flexDirection="row" columnGap={1}>
    <Box flexShrink={0}>
      <Text color={CLI_COLORS.WARNING} bold>
        {label}
      </Text>
    </Box>
    <Text color={CLI_COLORS.NEUTRAL}>{value}</Text>
  </Box>
);

const ListView: React.FC<ListViewProps> = ({ mode, source, skillConfigs, agentConfigs }) => {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 0);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <HeaderRow label="Mode" value={mode} />
        {source && <HeaderRow label="Marketplace" value={source} />}
      </Box>

      {/* Installed and current are one configuration, so every row reads unchanged. */}
      <SkillAgentSummary
        skillConfigs={skillConfigs}
        agentConfigs={agentConfigs}
        installedSkillConfigs={skillConfigs}
        installedAgentConfigs={agentConfigs}
        isInitMode={false}
      />
    </Box>
  );
};

export default class List extends BaseCommand {
  static summary = "Show installation information";
  static description = `Display details about the ${DEFAULT_BRANDING.NAME} installation (local or plugin mode)`;
  static aliases = ["ls"];

  static flags = { provider: providerFlag() };

  static examples = [
    {
      description: "Show current installation details",
      command: "<%= config.bin %> <%= command.id %>",
    },
  ];

  /** Names the other installation in this scope; reports rather than refuses, like `doctor`. */
  private async sayWhichInstallationThisIs(providerFlagValue: string | undefined): Promise<void> {
    const named = providerNamedBy(providerFlagValue);
    if (named !== undefined) {
      chooseProviderForThisRun(named);
      return;
    }

    const line = await otherInstallationsInThisScope(process.cwd());
    if (line !== null) this.log(line);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    await this.sayWhichInstallationThisIs(flags.provider);
    await this.ensureConfigReadable(process.cwd());

    const installation = await detectInstallation();
    if (!installation) return this.reportNoInstallation();

    const loaded = await loadProjectConfig(installation.projectDir);
    if (loaded === null) return this.printInstallationInfo([]);
    if (!process.stdin.isTTY) {
      return this.printInstallationInfo(skillLinesOf(activeRosterOf(loaded.config)));
    }

    await showListView(installation, loaded.config);
  }

  private reportNoInstallation(): void {
    this.log("No installation found.");
    this.log(`Run '${CLI_INVOKE_COMMAND} init' to create one.`);
  }

  private async printInstallationInfo(skillLines: string[]): Promise<void> {
    const info = await getInstallationInfo();
    if (!info) return;

    this.log("");
    this.log(formatInstallationDisplay(info, skillLines));
    this.log("");
  }
}

async function showListView(installation: Installation, config: ProjectConfig): Promise<void> {
  const { waitUntilExit, clear } = render(
    <ListView
      mode={INSTALL_MODE_LABELS[installation.mode]}
      source={config.marketplace}
      {...activeRosterOf(config)}
    />,
  );

  await waitUntilExit();
  clear();
}

function activeRosterOf(config: ProjectConfig): ActiveRoster {
  return {
    skillConfigs: config.skills.filter((skill) => !skill.excluded),
    agentConfigs: config.agents.filter((agent) => !agent.excluded),
  };
}

/** The panel's skill rows, read as it reads them: project rows first, each under the panel's name. */
function skillLinesOf({ skillConfigs, agentConfigs }: ActiveRoster): string[] {
  const { projectSkillRows, globalSkillRows } = computeScopeDiff({
    currentSkills: skillConfigs,
    currentAgents: agentConfigs,
    installedSkillConfigs: skillConfigs,
    installedAgentConfigs: agentConfigs,
    isInitMode: false,
  });

  return [
    ...projectSkillRows.map((row) => skillLine(row, "project")),
    ...globalSkillRows.map((row) => skillLine(row, "global")),
  ];
}

function skillLine(row: SkillDiffRow, scope: SkillScope): string {
  return `${getSkillEntryDisplayName(row)} (${scope})`;
}
