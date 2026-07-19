import os from "os";
import path from "path";
import { uniqueBy } from "remeda";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { CLAUDE_SRC_DIR, DEFAULT_BRANDING, GITHUB_SOURCE, STANDARD_FILES } from "../../consts";
import { projectSourceConfigSchema } from "../schemas";
import type { ProjectConfig, SourceEntry } from "../../types";
import { loadConfig } from "./config-loader";

export const DEFAULT_SOURCE = `${GITHUB_SOURCE.GITHUB_PREFIX}agents-inc/skills`;
export const SOURCE_ENV_VAR = "CC_SOURCE";
export const PROJECT_CONFIG_FILE = STANDARD_FILES.CONFIG_TS;

// Re-export types that moved to src/cli/types/config.ts for backward compatibility
export type { SourceEntry, BrandingConfig } from "../../types/config";

export type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "default";
  marketplace?: string;
};

export function getProjectConfigPath(projectDir: string): string {
  return path.join(projectDir, CLAUDE_SRC_DIR, PROJECT_CONFIG_FILE);
}

export async function loadProjectSourceConfig(
  projectDir: string,
): Promise<Partial<ProjectConfig> | null> {
  const configPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  if (!(await fileExists(configPath))) {
    verbose(`Project config not found at ${configPath}`);
    return null;
  }

  let data: Partial<ProjectConfig> | null;
  try {
    data = await loadConfig<Partial<ProjectConfig>>(configPath, projectSourceConfigSchema);
  } catch (error) {
    verbose(`Failed to load project source config at ${configPath}: ${getErrorMessage(error)}`);
    return null;
  }
  if (!data) return null;

  verbose(`Loaded project config from ${projectDir}`);
  return data;
}

/** Load source config from the global home directory (~/.claude-src/config.ts). */
export async function loadGlobalSourceConfig(): Promise<Partial<ProjectConfig> | null> {
  const homeDir = os.homedir();
  const globalConfigPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  if (!(await fileExists(globalConfigPath))) {
    verbose(`Global config not found at ${globalConfigPath}`);
    return null;
  }

  let data: Partial<ProjectConfig> | null;
  try {
    data = await loadConfig<Partial<ProjectConfig>>(globalConfigPath, projectSourceConfigSchema);
  } catch (error) {
    verbose(
      `Failed to load global source config at ${globalConfigPath}: ${getErrorMessage(error)}`,
    );
    return null;
  }
  if (!data) return null;

  verbose(`Loaded global config from ${homeDir}`);
  return data;
}

async function loadEffectiveSourceConfig(
  projectDir?: string,
): Promise<Partial<ProjectConfig> | null> {
  const projectConfig = projectDir ? await loadProjectSourceConfig(projectDir) : null;
  return projectConfig ?? (await loadGlobalSourceConfig());
}

// Precedence: flag > env > project > global > default
export async function resolveSource(
  flagValue?: string,
  projectDir?: string,
): Promise<ResolvedConfig> {
  const effectiveConfig = await loadEffectiveSourceConfig(projectDir);
  const marketplace = effectiveConfig?.marketplace;

  if (flagValue !== undefined) {
    if (flagValue === "" || flagValue.trim() === "") {
      throw new Error(
        "--source flag cannot be empty. Provide a valid source: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')",
      );
    }
    validateSourceFormat(flagValue.trim(), "--source");
    verbose(`Source from --source flag: ${flagValue}`);
    return { source: flagValue, sourceOrigin: "flag", marketplace };
  }

  const envValue = process.env[SOURCE_ENV_VAR];
  if (envValue) {
    const trimmed = envValue.trim();
    if (trimmed === "") {
      warn(`${SOURCE_ENV_VAR} is set but empty — ignoring and falling back to next source.`);
    } else {
      try {
        validateSourceFormat(trimmed, SOURCE_ENV_VAR);
        verbose(`Source from ${SOURCE_ENV_VAR} env var: ${trimmed}`);
        return { source: trimmed, sourceOrigin: "env", marketplace };
      } catch (error) {
        const message = getErrorMessage(error);
        warn(
          `${SOURCE_ENV_VAR} has an invalid value — ignoring and falling back to next source.\n${message}`,
        );
      }
    }
  }

  if (effectiveConfig?.source) {
    verbose(`Source from project config: ${effectiveConfig.source}`);
    return {
      source: effectiveConfig.source,
      sourceOrigin: "project",
      marketplace,
    };
  }

  verbose(`Using default source: ${DEFAULT_SOURCE}`);
  return { source: DEFAULT_SOURCE, sourceOrigin: "default", marketplace };
}

export async function resolveAuthor(projectDir?: string): Promise<string | undefined> {
  const effectiveConfig = await loadEffectiveSourceConfig(projectDir);
  return effectiveConfig?.author;
}

/** Resolved branding with defaults applied for any missing fields */
export type ResolvedBranding = {
  name: string;
  tagline: string;
};

/** Resolves branding from project config, falling back to global then DEFAULT_BRANDING. */
export async function resolveBranding(projectDir?: string): Promise<ResolvedBranding> {
  const effectiveConfig = await loadEffectiveSourceConfig(projectDir);
  return {
    name: effectiveConfig?.branding?.name ?? DEFAULT_BRANDING.NAME,
    tagline: effectiveConfig?.branding?.tagline ?? DEFAULT_BRANDING.TAGLINE,
  };
}

export async function resolveAllSources(
  projectDir?: string,
): Promise<{ primary: SourceEntry; extras: SourceEntry[] }> {
  const effectiveConfig = await loadEffectiveSourceConfig(projectDir);

  const resolvedConfig = await resolveSource(undefined, projectDir);
  const primary: SourceEntry = {
    name: "marketplace",
    url: resolvedConfig.source,
    description: "Primary skills marketplace",
  };

  const extras = uniqueBy(effectiveConfig?.sources ?? [], (s) => s.name);

  return { primary, extras };
}

const REMOTE_PROTOCOLS = [
  GITHUB_SOURCE.GITHUB_PREFIX, // "github:"
  GITHUB_SOURCE.GH_PREFIX, // "gh:"
  "gitlab:",
  "bitbucket:",
  "sourcehut:",
  "https://",
  "http://",
] as const;

// Minimum length after protocol prefix for a valid remote source (e.g., "org/repo" = 8 chars min)
const MIN_REMOTE_PATH_LENGTH = 3;
const MAX_SOURCE_LENGTH = 512;

// Null bytes must never appear in source strings — they can bypass C-level string termination in downstream tools
const NULL_BYTE_PATTERN = /\0/;

// Path traversal sequences in git refs/branches/tags (e.g., "?branch=../../etc/passwd")
const PATH_TRAVERSAL_PATTERN = /\.\./;

// UNC path prefixes (Windows network paths): \\server\share or //server/share
// These can trigger SMB authentication to attacker-controlled servers
const UNC_PATH_PATTERN = /^(?:\/\/|\\\\)/;

// Private/reserved IPv4 ranges that should not appear in source URLs (SSRF prevention)
// Matches: 127.x.x.x, 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 0.0.0.0, 169.254.x.x
const PRIVATE_IPV4_PATTERN =
  /^(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|0\.0\.0\.0|169\.254\.\d+\.\d+)$/;

// IPv6 loopback and private addresses in URL hostname brackets
const PRIVATE_IPV6_PATTERN =
  /^\[(?:::1|::ffff:(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)|fd[0-9a-f]{2}:.*|fe80:.*)\]$/i;

/**
 * Validates a source string format before it reaches giget or filesystem operations.
 * Catches obviously invalid formats early with clear error messages.
 *
 * @param source - The trimmed, non-empty source value to validate
 * @param flagName - The flag name for error messages ("--source" or "--agent-source")
 */
export function validateSourceFormat(source: string, flagName: string): void {
  // Null bytes can bypass C-level string termination in downstream tools (giget, git)
  if (NULL_BYTE_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters.\n\n` +
        `Source values must not contain null bytes.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} github:user/repo`,
    );
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(
      `${flagName} value is too long (${source.length} characters, max ${MAX_SOURCE_LENGTH}).\n\n` +
        `Provide a shorter source path or URL.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} github:user/repo`,
    );
  }

  const matchedProtocol = REMOTE_PROTOCOLS.find((prefix) => source.startsWith(prefix));

  if (matchedProtocol) {
    validateRemoteSource(source, matchedProtocol, flagName);
  } else {
    validateLocalPath(source, flagName);
  }
}

function validateRemoteSource(source: string, protocol: string, flagName: string): void {
  const pathAfterProtocol = source.slice(protocol.length).trim();

  if (pathAfterProtocol.length < MIN_REMOTE_PATH_LENGTH) {
    throw new Error(
      `${flagName} has an incomplete URL: "${source}"\n\n` +
        `A repository path is required after the protocol prefix.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }

  // Block path traversal in any remote source (refs, branches, query params)
  if (PATH_TRAVERSAL_PATTERN.test(pathAfterProtocol)) {
    throw new Error(
      `${flagName} contains path traversal in URL: "${source}"\n\n` +
        `Remote source URLs must not contain '..' sequences.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }

  // For https:// and http:// URLs, validate basic URL structure
  if (protocol === "https://" || protocol === "http://") {
    validateHttpUrl(source, flagName);
  }

  // For git shorthand protocols (github:, gh:, gitlab:, etc.), validate org/repo pattern
  if (protocol !== "https://" && protocol !== "http://") {
    validateGitShorthand(source, pathAfterProtocol, flagName);
  }
}

function validateHttpUrl(source: string, flagName: string): void {
  // Basic URL structure check: must have a hostname with at least one dot or localhost
  const afterProtocol = source.replace(/^https?:\/\//, "");
  // Strip port number for hostname validation (e.g., "localhost:8080" -> "localhost")
  const hostnameWithPort = afterProtocol.split("/")[0] ?? "";
  const hostname = hostnameWithPort.split(":")[0] ?? "";

  // Allow: dotted hostnames (github.com), localhost, and bracketed IPv6 ([::1])
  const isBracketedIPv6 = hostnameWithPort.startsWith("[") && hostnameWithPort.includes("]");
  if (!hostname || (!hostname.includes(".") && hostname !== "localhost" && !isBracketedIPv6)) {
    throw new Error(
      `${flagName} has an invalid URL: "${source}"\n\n` +
        `The URL must include a valid hostname.\n` +
        `Examples:\n` +
        `  ${flagName} https://github.com/user/repo\n` +
        `  ${flagName} https://gitlab.company.com/team/skills`,
    );
  }

  // Block private/reserved IP addresses (SSRF prevention via giget)
  if (PRIVATE_IPV4_PATTERN.test(hostname) || PRIVATE_IPV6_PATTERN.test(hostnameWithPort)) {
    throw new Error(
      `${flagName} points to a private or reserved IP address: "${source}"\n\n` +
        `Source URLs must not target private network addresses.\n` +
        `Use a public hostname instead.\n` +
        `Examples:\n` +
        `  ${flagName} https://github.com/user/repo\n` +
        `  ${flagName} https://gitlab.company.com/team/skills`,
    );
  }
}

function validateGitShorthand(source: string, repoPath: string, flagName: string): void {
  // Git shorthand format: protocol:owner/repo (must have at least owner/repo)
  if (!repoPath.includes("/")) {
    throw new Error(
      `${flagName} has an invalid repository reference: "${source}"\n\n` +
        `Git shorthand sources require an owner/repo format.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} gh:organization/skills`,
    );
  }
}

function validateLocalPath(source: string, flagName: string): void {
  // Check for control characters (except common whitespace)
  // eslint-disable-next-line no-control-regex
  const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0E-\x1F\x7F]/u;
  if (CONTROL_CHAR_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters: "${source}"\n\n` +
        `Source paths must not contain control characters.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} /home/user/skills`,
    );
  }

  // Block UNC paths (Windows network paths like \\server\share or //server/share)
  // These can trigger SMB authentication to attacker-controlled servers, leaking credentials
  if (UNC_PATH_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains a UNC network path: "${source}"\n\n` +
        `Network paths (\\\\server\\share or //server/share) are not allowed for security reasons.\n` +
        `Use a local directory path or a remote URL instead.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} /home/user/skills\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }
}

export function isLocalSource(source: string): boolean {
  if (source.startsWith("/") || source.startsWith(".")) {
    return true;
  }

  const hasRemoteProtocol = REMOTE_PROTOCOLS.some((prefix) => source.startsWith(prefix));

  if (!hasRemoteProtocol) {
    if (source.includes("..") || source.includes("~")) {
      throw new Error(
        `Invalid source path: ${source}. Path traversal patterns like '..' and '~' are not allowed for security reasons. Use absolute paths or remote URLs instead (e.g., '/home/user/skills' or 'https://github.com/user/repo').`,
      );
    }
  }

  return !hasRemoteProtocol;
}
