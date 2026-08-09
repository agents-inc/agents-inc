import React, { useEffect } from "react";

import { Box, Text, useApp } from "ink";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import { CLI_INVOKE_COMMAND, CLI_COLORS, DEFAULT_BRANDING } from "../consts.js";
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
              Source
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

  static examples = [
    {
      description: "Show current installation details",
      command: "<%= config.bin %> <%= command.id %>",
    },
  ];

  async run(): Promise<void> {
    await this.parse(List);

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
        source={config.source}
        skillConfigs={activeSkills}
        agentConfigs={activeAgents}
      />,
    );

    await waitUntilExit();
    clear();
  }
}
