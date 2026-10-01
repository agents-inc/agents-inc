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

/**
 * Reads one settings file's permissions block; undefined when absent, malformed, or empty.
 *
 * settings.json belongs to Claude Code, which adds keys on its own release schedule. This CLI
 * consumes `permissions` and owns nothing else in the file, so it stays silent about every other
 * field rather than warning about settings it has no standing to judge.
 */
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

/**
 * The files this host reads permissions from at project scope, in the host's own order: the base
 * file this CLI writes first, then any overlay that beats it.
 *
 * Composed from `CLAUDE_DIR` until 2026-09-22, which is why a Codex install read a `.claude/`
 * directory it had never written. {@link permissionFiles} is the one answer now, and this is its
 * first production reader.
 */
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

/**
 * One settings file as the notice names it: relative to the project, POSIX-separated.
 *
 * POSIX for `pathUnder`'s reason one module over — what comes back is a NAME shown to a person,
 * not a path this process opens.
 */
function asUserWritesIt(projectRoot: string, file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join("/");
}

/**
 * The notice a run ends on when nothing has granted the agents any permissions — or `null` where
 * there is nothing true to say.
 *
 * **`null` for a host whose permission model this release cannot advise on**, which is
 * {@link advisesOnPermissions}'s whole subject. Every word below is Claude Code's: a
 * `permissions.allow` block, in JSON, in `settings.json`. Codex has neither the key nor the file,
 * and a Codex install printed this verbatim until 2026-09-22 — ending a run that had touched no
 * `.claude/` directory by telling the user to go and edit one.
 *
 * The file is NAMED from the layout rather than spelled, so the notice points at the file it
 * actually read.
 */
export async function checkPermissions(projectRoot: string): Promise<React.ReactElement | null> {
  if (!advisesOnPermissions(providerInUse(projectRoot))) return null;

  const files = settingsFilesFor(projectRoot);
  // The BASE file rather than the overlay: it is the one this CLI writes, and the one a user with
  // neither is being asked to create. A host with a notice to print has a file to name it in, so
  // an empty roster is a host that has nothing to say rather than a case to paper over.
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
