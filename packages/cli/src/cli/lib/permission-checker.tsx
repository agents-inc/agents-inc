import React from "react";
import { z } from "zod";

import { Text, Box } from "ink";
import path from "path";

import { CLI_COLORS, MAX_CONFIG_FILE_SIZE } from "../consts";
import {
  advisesOnPermissions,
  permissionFiles,
  providerInUse,
} from "./installation/install-layout.js";
import { fileExists, readFileSafe } from "../utils/fs";
import { warn } from "../utils/logger";
import { settingsFileSchema } from "./schemas";

type SettingsFile = z.infer<typeof settingsFileSchema>;
type PermissionConfig = NonNullable<SettingsFile["permissions"]>;

/** Undefined when absent, malformed or empty; silent about every other field (Claude Code's). */
async function readSettingsPermissions(filePath: string): Promise<PermissionConfig | undefined> {
  if (!(await fileExists(filePath))) return undefined;
  try {
    const content = await readFileSafe(filePath, MAX_CONFIG_FILE_SIZE);
    const raw: unknown = JSON.parse(content);
    const result = settingsFileSchema.safeParse(raw);
    const parsed: SettingsFile = result.success ? result.data : {};
    return parsed.permissions;
  } catch {
    warn(`Malformed settings file at '${filePath}' — skipping`);
    return undefined;
  }
}

function settingsFilesFor(projectRoot: string): string[] {
  return permissionFiles(providerInUse(projectRoot), "project", projectRoot);
}

/** Permissions from the highest-precedence settings file that defines them — the overlay wins. */
async function loadPermissions(files: readonly string[]): Promise<PermissionConfig | undefined> {
  for (const filePath of [...files].reverse()) {
    const permissions = await readSettingsPermissions(filePath);
    if (permissions) return permissions;
  }
  return undefined;
}

/** Relative to the project and POSIX-separated: a name shown to a person, not a path to open. */
function asUserWritesIt(projectRoot: string, file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

/** `null` for a host whose permission model this release cannot advise on. */
export async function checkPermissions(projectRoot: string): Promise<React.ReactElement | null> {
  if (!advisesOnPermissions(providerInUse(projectRoot))) return null;

  const files = settingsFilesFor(projectRoot);
  // The base file: the one this CLI writes and a user with neither is asked to create.
  const [base] = files;
  if (base === undefined) return null;

  const permissions = await loadPermissions(files);
  const settingsFile = asUserWritesIt(projectRoot, base);

  if (!permissions) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={CLI_COLORS.WARNING} padding={1}>
        <Text bold color={CLI_COLORS.WARNING}>
          Permission Notice
        </Text>
        <Text>No permissions configured in {settingsFile}</Text>
        <Text>Agents will prompt for approval on each tool use.</Text>
        <Text> </Text>
        <Text>For autonomous operation, add to {settingsFile}:</Text>
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
