import { Box, Text } from "ink";
import React from "react";
import { CLI_COLORS, SOURCE_DISPLAY_NAMES, UI_SYMBOLS } from "../../consts.js";
import { matrix } from "../../lib/matrix/matrix-provider.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";
import type { SkillId } from "../../types/index.js";
import { useWizardStore } from "../../stores/wizard-store.js";

export type SkillAgentSummaryProps = {
  skillConfigs?: SkillConfig[];
  agentConfigs?: AgentScopeConfig[];
};

function getSkillDisplayName(id: SkillId): string {
  return matrix.skills[id]?.displayName ?? id;
}

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text bold color={CLI_COLORS.WARNING}>
    {children}
  </Text>
);

export const ScopeLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
    {` ${children} `}
  </Text>
);

export const EjectIcon: React.FC = () => (
  <Text color={CLI_COLORS.WARNING}> {UI_SYMBOLS.EJECT}</Text>
);

export const SkillAgentSummary: React.FC<SkillAgentSummaryProps> = ({
  skillConfigs,
  agentConfigs,
}) => {
  const installedSkillConfigs = useWizardStore((s) => s.installedSkillConfigs);
  const installedAgentConfigs = useWizardStore((s) => s.installedAgentConfigs);
  const isInitMode = useWizardStore((s) => s.isInitMode);

  const currentSkills = skillConfigs ?? [];
  const currentAgents = agentConfigs ?? [];

  const projectSkills = currentSkills.filter((s) => s.scope === "project" && !s.excluded);
  const globalSkills = currentSkills.filter((s) => s.scope === "global" && !s.excluded);
  const projectAgents = currentAgents.filter((a) => a.scope === "project" && !a.excluded);
  const globalAgents = currentAgents.filter((a) => a.scope === "global" && !a.excluded);
  const excludedGlobalSkills = currentSkills.filter((s) => s.scope === "global" && !!s.excluded);
  const excludedGlobalAgents = currentAgents.filter((a) => a.scope === "global" && !!a.excluded);

  // Tombstones (`excluded: true`) represent a suppression of a pre-existing
  // install, not a user-level "installed" state. Excluding them from the diff
  // baseline keeps both sides of the diff symmetric on (id, scope) and avoids
  // spurious `-` / bullet rendering when a tombstone is added or removed by a
  // scope toggle. See D-225.
  const skillDiffBaseline = installedSkillConfigs
    ? installedSkillConfigs.filter((s) => !s.excluded)
    : null;
  const agentDiffBaseline = installedAgentConfigs
    ? installedAgentConfigs.filter((a) => !a.excluded)
    : null;

  const prevSkillKeySet = skillDiffBaseline
    ? new Set(skillDiffBaseline.map((s) => `${s.id}:${s.scope}`))
    : null;
  const prevSourceMap = skillDiffBaseline
    ? new Map(skillDiffBaseline.map((s) => [`${s.id}:${s.scope}`, s.source]))
    : null;
  const prevAgentKeySet = agentDiffBaseline
    ? new Set(agentDiffBaseline.map((a) => `${a.name}:${a.scope}`))
    : null;

  // Skills/agents that are still globally installed but overridden at project scope.
  // A tombstone at global in `currentSkills` means the global install is being
  // removed by this session (e.g. G→P toggle) — it is NOT an inherited-global
  // case and must fall through to the `removedSkills` path so the user sees a
  // `-` row at Global. See D-225.
  const inheritedGlobalSkills = skillDiffBaseline
    ? skillDiffBaseline.filter(
        (s) =>
          s.scope === "global" &&
          !globalSkills.some((g) => g.id === s.id) &&
          !excludedGlobalSkills.some((e) => e.id === s.id) &&
          projectSkills.some((p) => p.id === s.id),
      )
    : [];
  const inheritedGlobalAgents = agentDiffBaseline
    ? agentDiffBaseline.filter(
        (a) =>
          a.scope === "global" &&
          !globalAgents.some((g) => g.name === a.name) &&
          !excludedGlobalAgents.some((e) => e.name === a.name) &&
          projectAgents.some((p) => p.name === a.name),
      )
    : [];
  const removedSkills = skillDiffBaseline
    ? skillDiffBaseline.filter(
        (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope && !c.excluded),
      )
    : [];
  const removedAgents = agentDiffBaseline
    ? agentDiffBaseline.filter(
        (a) => !currentAgents.some((c) => c.name === a.name && c.scope === a.scope && !c.excluded),
      )
    : [];

  // A tombstone at global is already represented by a `-` row when the
  // baseline had an active install at that scope (e.g. G→P toggle in-session).
  // Render the `-` from `removedSkills` and suppress the duplicate bullet row
  // that would otherwise come out of the tombstone itself. See D-225.
  const removedGlobalSkillIds = new Set(
    removedSkills.filter((s) => s.scope === "global").map((s) => s.id),
  );
  const removedGlobalAgentNames = new Set(
    removedAgents.filter((a) => a.scope === "global").map((a) => a.name),
  );
  const inheritedSkillIdSet = new Set(inheritedGlobalSkills.map((s) => s.id));
  const uniqueExcludedGlobalSkills = excludedGlobalSkills.filter(
    (s) => !inheritedSkillIdSet.has(s.id) && !removedGlobalSkillIds.has(s.id),
  );
  const allGlobalSkills = [
    ...globalSkills,
    ...inheritedGlobalSkills,
    ...uniqueExcludedGlobalSkills,
  ];
  const inheritedAgentNameSet = new Set(inheritedGlobalAgents.map((a) => a.name));
  const uniqueExcludedGlobalAgents = excludedGlobalAgents.filter(
    (a) => !inheritedAgentNameSet.has(a.name) && !removedGlobalAgentNames.has(a.name),
  );
  const allGlobalAgents = [
    ...globalAgents,
    ...inheritedGlobalAgents,
    ...uniqueExcludedGlobalAgents,
  ];

  const removedGlobalSkills = isInitMode ? [] : removedSkills.filter((s) => s.scope === "global");
  const removedProjectSkills = removedSkills.filter((s) => s.scope === "project");
  const removedGlobalAgents = isInitMode ? [] : removedAgents.filter((a) => a.scope === "global");
  const removedProjectAgents = removedAgents.filter((a) => a.scope === "project");

  const showProjectSkills = projectSkills.length > 0 || removedProjectSkills.length > 0;
  const showGlobalSkills = allGlobalSkills.length > 0 || removedGlobalSkills.length > 0;
  const showProjectAgents = projectAgents.length > 0 || removedProjectAgents.length > 0;
  const showGlobalAgents = allGlobalAgents.length > 0 || removedGlobalAgents.length > 0;

  const hasSkills = showProjectSkills || showGlobalSkills;
  const hasAgents = showProjectAgents || showGlobalAgents;

  if (!hasSkills && !hasAgents) return null;

  return (
    <Box flexDirection="row" width="100%">
      <Box
        flexDirection="column"
        borderStyle="single"
        flexGrow={2}
        flexBasis={0}
        borderRight={true}
        borderTop={false}
        borderBottom={false}
        borderLeft={false}
        borderColor={CLI_COLORS.NEUTRAL}
        borderRightDimColor
      >
        <TableHeader>Skills</TableHeader>
        {showProjectSkills && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Project</ScopeLabel>
            <Box flexWrap="wrap">
              {projectSkills.map((skill) => {
                const key = `${skill.id}:${skill.scope}`;
                const isNew = prevSkillKeySet === null || !prevSkillKeySet.has(key);
                const prevSource = prevSourceMap?.get(key);
                const sourceChanged = !isNew && prevSource != null && prevSource !== skill.source;
                const prefix = sourceChanged ? "~ " : isNew ? "+ " : `${UI_SYMBOLS.BULLET} `;
                const color = sourceChanged
                  ? CLI_COLORS.WARNING
                  : isNew
                    ? CLI_COLORS.SUCCESS
                    : CLI_COLORS.NEUTRAL;
                return (
                  <Box key={skill.id} width="50%" flexDirection="row">
                    <Text color={color}>
                      {prefix}
                      {getSkillDisplayName(skill.id)}
                    </Text>
                    {sourceChanged && (
                      <Text dimColor>
                        {" "}
                        ({SOURCE_DISPLAY_NAMES[prevSource] ?? prevSource} →{" "}
                        {SOURCE_DISPLAY_NAMES[skill.source] ?? skill.source})
                      </Text>
                    )}
                    {skill.source === "eject" && <EjectIcon />}
                  </Box>
                );
              })}
              {removedProjectSkills.map((skill) => (
                <Box key={`removed-${skill.id}`} width="50%" flexDirection="row">
                  <Text color={CLI_COLORS.ERROR}>- {getSkillDisplayName(skill.id)}</Text>
                  {skill.source === "eject" && <EjectIcon />}
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {showGlobalSkills && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Global</ScopeLabel>
            <Box flexWrap="wrap">
              {allGlobalSkills.map((skill) => {
                const key = `${skill.id}:${skill.scope}`;
                const isNew = prevSkillKeySet === null || !prevSkillKeySet.has(key);
                const prevSource = prevSourceMap?.get(key);
                const sourceChanged = !isNew && prevSource != null && prevSource !== skill.source;
                const prefix = sourceChanged ? "~ " : isNew ? "+ " : `${UI_SYMBOLS.BULLET} `;
                const color = sourceChanged
                  ? CLI_COLORS.WARNING
                  : isNew
                    ? CLI_COLORS.SUCCESS
                    : CLI_COLORS.NEUTRAL;
                return (
                  <Box key={skill.id} width="50%" flexDirection="row">
                    <Text color={color}>
                      {prefix}
                      {getSkillDisplayName(skill.id)}
                    </Text>
                    {sourceChanged && (
                      <Text dimColor>
                        {" "}
                        ({SOURCE_DISPLAY_NAMES[prevSource] ?? prevSource} →{" "}
                        {SOURCE_DISPLAY_NAMES[skill.source] ?? skill.source})
                      </Text>
                    )}
                    {skill.source === "eject" && <EjectIcon />}
                  </Box>
                );
              })}
              {removedGlobalSkills.map((skill) => (
                <Box key={`removed-${skill.id}`} width="50%" flexDirection="row">
                  <Text color={CLI_COLORS.ERROR}>- {getSkillDisplayName(skill.id)}</Text>
                  {skill.source === "eject" && <EjectIcon />}
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexBasis={0} marginLeft={1} paddingLeft={1}>
        <TableHeader>Agents</TableHeader>
        {showProjectAgents && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Project</ScopeLabel>
            <Box flexDirection="column">
              {projectAgents.map((agent) => {
                const isNew =
                  prevAgentKeySet === null || !prevAgentKeySet.has(`${agent.name}:${agent.scope}`);
                const prefix = isNew ? "+ " : `${UI_SYMBOLS.BULLET} `;
                const color = isNew ? CLI_COLORS.SUCCESS : CLI_COLORS.NEUTRAL;
                return (
                  <Text key={agent.name} color={color}>
                    {prefix}
                    {agent.name}
                  </Text>
                );
              })}
              {removedProjectAgents.map((agent) => (
                <Text key={`removed-${agent.name}`} color={CLI_COLORS.ERROR}>
                  - {agent.name}
                </Text>
              ))}
            </Box>
          </Box>
        )}
        {showGlobalAgents && (
          <Box flexDirection="column" marginTop={1}>
            <ScopeLabel>Global</ScopeLabel>
            <Box flexDirection="column">
              {allGlobalAgents.map((agent) => {
                const isNew =
                  prevAgentKeySet === null || !prevAgentKeySet.has(`${agent.name}:${agent.scope}`);
                const prefix = isNew ? "+ " : `${UI_SYMBOLS.BULLET} `;
                const color = isNew ? CLI_COLORS.SUCCESS : CLI_COLORS.NEUTRAL;
                return (
                  <Text key={agent.name} color={color}>
                    {prefix}
                    {agent.name}
                  </Text>
                );
              })}
              {removedGlobalAgents.map((agent) => (
                <Text key={`removed-${agent.name}`} color={CLI_COLORS.ERROR}>
                  - {agent.name}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
