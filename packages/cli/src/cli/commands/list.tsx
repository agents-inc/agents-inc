import React, { useEffect } from "react";

import { Box, Text, useApp } from "ink";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import { CLI_INVOKE_COMMAND, CLI_COLORS, DEFAULT_BRANDING } from "../consts.js";
import { chooseProviderForThisRun, providerInUse } from "../lib/installation/install-layout.js";
import {
  otherInstallationsInThisScope,
  providerFlag,
  providerNamedBy,
} from "../lib/installation/provider-flag.js";
import { getInstallationInfo, formatInstallationDisplay } from "../lib/plugins/index.js";
import { detectInstallation, INSTALL_MODE_LABELS } from "../lib/installation/installation.js";
import { loadProjectConfig } from "../lib/configuration/project-config.js";
import { SkillAgentSummary } from "../components/wizard/skill-agent-summary.js";
import { hydrateWizardStore } from "../stores/wizard-store.js";
import type { AgentScopeConfig, SkillConfig } from "../types/config.js";

type ListViewProps = {
  mode: string;
  source?: string | undefined;
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
};

const ListView: React.FC<ListViewProps> = ({ mode, source, skillConfigs, agentConfigs }) => {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 0);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text color={CLI_COLORS.WARNING} bold>
            Mode
          </Text>
          <Text color={CLI_COLORS.NEUTRAL}>{mode}</Text>
        </Box>
        {source && (
          <Box flexDirection="row" columnGap={1}>
            <Text color={CLI_COLORS.WARNING} bold>
              Marketplace
            </Text>
            <Text color={CLI_COLORS.NEUTRAL}>{source}</Text>
          </Box>
        )}
      </Box>

      <SkillAgentSummary skillConfigs={skillConfigs} agentConfigs={agentConfigs} />
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

  /**
   * Which of the scope's installations this report is about, said out loud where there are two.
   *
   * **`list` reported one of two and nothing anywhere said so.** Everything below resolves the
   * provider through `providerInUse`, which answers by ROSTER ORDER for a scope holding one
   * installation of each — so the report named one installation, its mode, its counts and its
   * config path, all correct, about the half of the directory the user was not asking after. Every
   * command that WRITES refuses this state by name and `doctor` reports it as a finding; the one
   * command whose whole job is to say what is installed was silent about it.
   *
   * It reports rather than refusing, for the reason `doctor` does: a read-only command that
   * refused would leave a user whose scope holds two installations unable to look at either,
   * which is the one state they most need to see.
   */
  private async sayWhichInstallationThisIs(providerFlagValue: string | undefined): Promise<void> {
    const named = providerNamedBy(providerFlagValue);
    if (named !== undefined) {
      chooseProviderForThisRun(named);
      return;
    }

    const cwd = process.cwd();
    const line = await otherInstallationsInThisScope(cwd, providerInUse(cwd));
    if (line !== null) this.log(line);
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    await this.sayWhichInstallationThisIs(flags.provider);
    await this.ensureConfigReadable(process.cwd());

    const installation = await detectInstallation();

    if (!installation) {
      this.log("No installation found.");
      this.log(`Run '${CLI_INVOKE_COMMAND} init' to create one.`);
      return;
    }

    const loaded = await loadProjectConfig(installation.projectDir);

    if (!loaded?.config || !process.stdin.isTTY) {
      const info = await getInstallationInfo();
      if (info) {
        this.log("");
        this.log(formatInstallationDisplay(info));
        this.log("");
      }
      return;
    }

    const { config } = loaded;
    const modeLabel = INSTALL_MODE_LABELS[installation.mode];
    const activeSkills = config.skills.filter((s) => !s.excluded);
    const activeAgents = config.agents.filter((a) => !a.excluded);

    hydrateWizardStore({
      installedSkillConfigs: activeSkills,
      installedAgentConfigs: activeAgents,
    });

    const { waitUntilExit, clear } = render(
      <ListView
        mode={modeLabel}
        source={config.marketplace}
        skillConfigs={activeSkills}
        agentConfigs={activeAgents}
      />,
    );

    await waitUntilExit();
    clear();
  }
}
