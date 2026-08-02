import React from "react";
import { z } from "zod";

import { Text, Box } from "ink";
import path from "path";

import { CLAUDE_DIR, CLI_COLORS, MAX_CONFIG_FILE_SIZE, STANDARD_FILES } from "../consts";
import { fileExists, readFileSafe } from "../utils/fs";
import { warn } from "../utils/logger";
import { settingsFileSchema } from "./schemas";

type SettingsFile = z.infer<typeof settingsFileSchema>;
type PermissionConfig = NonNullable<SettingsFile["permissions"]>;

/**
 * Reads one settings file's permissions block; undefined when absent, malformed, or empty.
 *
 * settings.json belongs to Claude Code, which adds keys on its own release schedule. This CLI
 * consumes `permissions` and owns nothing else in the file, so it stays silent about every other
 * field rather than warning about settings it has no standing to judge (D-304).
 */
async function readSettingsPermissions(filePath: string): Promise<PermissionConfig | undefined> {
  if (!(await fileExists(filePath))) return undefined;
  try {
    const content = await readFileSafe(filePath, MAX_CONFIG_FILE_SIZE);
    const raw = JSON.parse(content);
    const result = settingsFileSchema.safeParse(raw);
    const parsed: SettingsFile = result.success ? result.data : {};
    return parsed.permissions;
  } catch {
    warn(`Malformed settings file at '${filePath}' — skipping`);
    return undefined;
  }
}

/** Permissions from the first settings file that defines them — settings.local.json wins. */
async function loadPermissions(projectRoot: string): Promise<PermissionConfig | undefined> {
  const settingsPath = path.join(projectRoot, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON);
  const localSettingsPath = path.join(projectRoot, CLAUDE_DIR, STANDARD_FILES.SETTINGS_LOCAL_JSON);

  for (const filePath of [localSettingsPath, settingsPath]) {
    const permissions = await readSettingsPermissions(filePath);
    if (permissions) return permissions;
  }
  return undefined;
}

export async function checkPermissions(projectRoot: string): Promise<React.ReactElement | null> {
  const permissions = await loadPermissions(projectRoot);

  if (!permissions) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={CLI_COLORS.WARNING} padding={1}>
        <Text bold color={CLI_COLORS.WARNING}>
          Permission Notice
        </Text>
        <Text>No permissions configured in .claude/settings.json</Text>
        <Text>Agents will prompt for approval on each tool use.</Text>
        <Text> </Text>
        <Text>For autonomous operation, add to .claude/settings.json:</Text>
        <Text> </Text>
        <Text color={CLI_COLORS.DIM}>{"{"}</Text>
        <Text color={CLI_COLORS.DIM}>{'  "permissions": {'}</Text>
        <Text color={CLI_COLORS.DIM}>{'    "allow": ['}</Text>
        <Text color={CLI_COLORS.DIM}>{'      "Read(*)",'}</Text>
        <Text color={CLI_COLORS.DIM}>{'      "Bash(git *)",'}</Text>
        <Text color={CLI_COLORS.DIM}>{'      "Bash(bun *)"'}</Text>
        <Text color={CLI_COLORS.DIM}>{"    ]"}</Text>
        <Text color={CLI_COLORS.DIM}>{"  }"}</Text>
        <Text color={CLI_COLORS.DIM}>{"}"}</Text>
      </Box>
    );
  }

  const hasRestrictiveBash = permissions.deny?.some(
    (rule) => rule === "Bash(*)" || rule === "Bash",
  );
  const hasNoAllows = !permissions.allow || permissions.allow.length === 0;

  if (hasRestrictiveBash || hasNoAllows) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={CLI_COLORS.WARNING} padding={1}>
        <Text bold color={CLI_COLORS.WARNING}>
          Permission Warnings
        </Text>
        {hasRestrictiveBash && (
          <Text>
            ⚠ Bash is denied in permissions. Some agents require Bash for git, testing, and build
            commands.
          </Text>
        )}
        {hasNoAllows && (
          <Text>⚠ No allow rules configured. Agents will prompt for each tool use.</Text>
        )}
      </Box>
    );
  }

  return null;
}
