import os from "os";
import path from "path";
import { z } from "zod";
import { DEFAULT_SOURCE } from "@workspace/compile";
import { fileExists, readFileOptional } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import {
  DEFAULT_BRANDING,
  GITHUB_SOURCE,
  PUBLIC_CATALOGUE_PACKAGE,
  SOURCE_ROOT_DIR,
  STANDARD_FILES,
} from "../../consts";
import { configUnreadableError, installationConfigsUnreadable } from "../../utils/messages";
import { formatZodIssues, projectConfigLoaderSchema, projectSourceConfigSchema } from "../schemas";
import type { ProjectConfig, SourceEntry } from "../../types";
import {
  ConfigDefaultExportError,
  ConfigSchemaError,
  loadConfig,
  NO_VALID_DEFAULT_EXPORT,
} from "./config-loader";
import { getInstalledConfigPath, getProjectConfigPath } from "../installation/install-base-dir";
import { isHomeDirectory } from "../installation/is-home-directory";
import type { ScopeKind } from "../installation/source-scopes";

export { DEFAULT_SOURCE };
export const SOURCE_ENV_VAR = "CC_MARKETPLACE";

export type { SourceEntry, BrandingConfig } from "../../types/config";

// Lives in install-base-dir.ts to avoid an import cycle.
export { getProjectConfigPath };

export type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
} & (RecordedMarketplaceName | { marketplace?: undefined; marketplaceRecordedIn?: undefined });

/** A pair, because a refusal of the name sends the reader to the file holding it. */
type RecordedMarketplaceName = { marketplace: string; marketplaceRecordedIn: string };

/**
 * Choosing a marketplace is install-time, so only `"init"` reads the environment rung. `"stored"`
 * callers get project, then global, then the default, though any caller may still name one to read.
 */
export type SourceCaller = "init" | "stored";

export type ResolveSourceRequest = {
  caller: SourceCaller;
  /** The marketplace this run named, where it named one. */
  flag?: string | undefined;
  /** The project whose `config.ts` is the first stored rung. */
  projectDir?: string | undefined;
};

/**
 * `null` only when the file is absent. A present file that cannot load is raised, never reported as
 * absence, and is judged as the full-config reader judges it. Callers abort, except
 * `validateRegisteredSources`, which degrades.
 */
async function loadSourceConfig(
  dir: string,
  scope: ScopeKind,
): Promise<Partial<ProjectConfig> | null> {
  const scopeLabel = scope === "project" ? "Project" : "Global";
  const configPath = getInstalledConfigPath(dir);

  if (!(await fileExists(configPath))) {
    verbose(`${scopeLabel} config not found at ${configPath}`);
    return null;
  }

  const unreadable = refuseInstallationConfig(configPath, scope, dir);
  const installation = await readConfigOrRefuse(configPath, projectConfigLoaderSchema, unreadable);
  if (installation === null) throw unreadable(NO_VALID_DEFAULT_EXPORT);
  const settings = readSettings(configPath, installation);

  verbose(`Loaded ${scope} config from ${dir}`);
  return settings;
}

/** How a reader words a config that is there and will not load, from the reason it gives. */
type RefuseUnreadable = (reason: string, cause?: unknown) => Error;

/** Worded as `ensureConfigReadable` words the same file. */
function refuseInstallationConfig(
  configPath: string,
  scope: ScopeKind,
  scopeRoot: string,
): RefuseUnreadable {
  return (reason, cause) =>
    new Error(installationConfigsUnreadable([{ configPath, reason, scope, scopeRoot }]), { cause });
}

/** `null` when the config evaluated and declared nothing; every failure raises. */
async function readConfigOrRefuse<T>(
  configPath: string,
  schema: z.ZodType<T>,
  unreadable: RefuseUnreadable,
): Promise<T | null> {
  try {
    return await loadConfig(configPath, schema);
  } catch (error) {
    if (describesItsOwnFault(error)) throw error;
    throw unreadable(getErrorMessage(error), error);
  }
}

/** Parsed, since the installation schema lets the settings-only fields through unread. */
function readSettings(configPath: string, installation: unknown): Partial<ProjectConfig> {
  const settings = projectSourceConfigSchema.safeParse(installation);
  if (!settings.success) {
    throw new ConfigSchemaError(configPath, formatZodIssues(settings.error.issues));
  }
  return settings.data;
}

/** True for failures that already name the faulty field or export, which are passed on as-is. */
function describesItsOwnFault(error: unknown): boolean {
  return error instanceof ConfigSchemaError || error instanceof ConfigDefaultExportError;
}

/**
 * `loadConfig` already names the file and the parser's reason, so it is passed on, not restated.
 */
const unreadableSourceRepoConfig: RefuseUnreadable = (reason, cause) =>
  new Error(configUnreadableError(reason), { cause });

/** A source repo's own `<base>/.agents-inc/config.ts`, provider-neutral: layout has no provider. */
export async function loadSourceRepoConfig(
  basePath: string,
): Promise<Partial<ProjectConfig> | null> {
  return readDeclaredConfig(path.join(basePath, SOURCE_ROOT_DIR));
}

async function readDeclaredConfig(dir: string): Promise<Partial<ProjectConfig> | null> {
  const configPath = path.join(dir, STANDARD_FILES.CONFIG_TS);
  if (!(await fileExists(configPath))) {
    verbose(`Source config not found at ${configPath}`);
    return null;
  }
  return readConfigOrRefuse(configPath, projectSourceConfigSchema, unreadableSourceRepoConfig);
}

/** The scope it announces is derived: at the home root this file is the global config. */
export async function loadProjectSourceConfig(
  projectDir: string,
): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(projectDir, isHomeDirectory(projectDir) ? "global" : "project");
}

export async function loadGlobalSourceConfig(): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(os.homedir(), "global");
}

/** The effective source config, which scope it was actually loaded from, and its file. */
type EffectiveSourceConfig = {
  config: Partial<ProjectConfig>;
  origin: ScopeKind;
  configPath: string;
};

async function loadEffectiveSourceConfig(
  projectDir?: string,
): Promise<EffectiveSourceConfig | null> {
  const ownDir = ownProjectDir(projectDir);
  const own = ownDir === null ? null : await readStoredRung(ownDir, "project");
  return own ?? (await readStoredRung(os.homedir(), "global"));
}

/** One stored rung: the config at `dir` and the file it was read from, or null when it has none. */
async function readStoredRung(
  dir: string,
  origin: ScopeKind,
): Promise<EffectiveSourceConfig | null> {
  const config = await loadSourceConfig(dir, origin);
  return config && { config, origin, configPath: getInstalledConfigPath(dir) };
}

/** The directory whose config is a project's own, or null at the home root. */
function ownProjectDir(projectDir: string | undefined): string | null {
  return projectDir === undefined || isHomeDirectory(projectDir) ? null : projectDir;
}

/** Nothing at the home root, whose config is the global one; the axis is which file was read. */
async function loadOwnProjectSourceConfig(
  projectDir: string | undefined,
): Promise<Partial<ProjectConfig> | null> {
  const ownDir = ownProjectDir(projectDir);
  return ownDir === null ? null : loadProjectSourceConfig(ownDir);
}

function recordedMarketplaceName(
  effective: EffectiveSourceConfig | null,
): RecordedMarketplaceName | undefined {
  if (effective?.config.marketplaceName === undefined) return undefined;
  return {
    marketplace: effective.config.marketplaceName,
    marketplaceRecordedIn: effective.configPath,
  };
}

/** Precedence: flag > env > project > global > default; the env rung is read for `init` only. */
export async function resolveSource(request: ResolveSourceRequest): Promise<ResolvedConfig> {
  const { caller, flag, projectDir } = request;
  const effective = await loadEffectiveSourceConfig(projectDir);
  const storedSource = effective?.config.marketplace ?? DEFAULT_SOURCE;
  // The stored name labels only the ref it was read beside.
  const recorded = recordedMarketplaceName(effective);
  const labelFor = (source: string) => source === storedSource && recorded;

  if (flag !== undefined) {
    assertNamedSourceUsable(flag);
    verbose(`Marketplace named by this run: ${flag}`);
    return { source: flag, sourceOrigin: "flag", ...labelFor(flag) };
  }

  const envSource = caller === "init" ? readEnvSource() : undefined;
  if (envSource !== undefined) {
    return { source: envSource, sourceOrigin: "env", ...labelFor(envSource) };
  }

  if (effective?.config.marketplace) {
    verbose(`Marketplace from ${effective.origin} config: ${effective.config.marketplace}`);
    return {
      source: effective.config.marketplace,
      sourceOrigin: effective.origin,
      ...labelFor(effective.config.marketplace),
    };
  }

  verbose(`Using default marketplace: ${DEFAULT_SOURCE}`);
  return { source: DEFAULT_SOURCE, sourceOrigin: "default", ...labelFor(DEFAULT_SOURCE) };
}

/**
 * Origin-neutral: a `"stored"` caller may name a marketplace too, and never passed `--marketplace`.
 */
const NAMED_SOURCE_LABEL = "The marketplace";

/** Raised, not warned: somebody named this, so falling through would install from elsewhere. */
function assertNamedSourceUsable(flag: string): void {
  if (flag.trim() === "") {
    throw new Error(
      `${NAMED_SOURCE_LABEL} cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')`,
    );
  }
  validateSourceFormat(flag.trim(), NAMED_SOURCE_LABEL);
}

/** Unset, empty or unusable falls through with a warning: the environment is ambient. */
function readEnvSource(): string | undefined {
  const envValue = process.env[SOURCE_ENV_VAR];
  if (!envValue) return undefined;

  const trimmed = envValue.trim();
  if (trimmed === "") {
    warn(`${SOURCE_ENV_VAR} is set but empty — ignoring and falling back to the next rung.`);
    return undefined;
  }

  try {
    validateSourceFormat(trimmed, SOURCE_ENV_VAR);
  } catch (error) {
    warn(
      `${SOURCE_ENV_VAR} has an invalid value — ignoring and falling back to the next rung.\n${getErrorMessage(error)}`,
    );
    return undefined;
  }

  verbose(`Marketplace from ${SOURCE_ENV_VAR} env var: ${trimmed}`);
  return trimmed;
}

export async function resolveAuthor(projectDir?: string): Promise<string | undefined> {
  const effective = await loadEffectiveSourceConfig(projectDir);
  return effective?.config.author;
}

export type ResolvedBranding = {
  name: string;
};

/** Per field, not per file: the project's, then the global one's, then the shipped default. */
export async function resolveBranding(projectDir?: string): Promise<ResolvedBranding> {
  const [own, global] = await Promise.all([
    loadOwnProjectSourceConfig(projectDir),
    loadGlobalSourceConfig(),
  ]);

  return {
    name: own?.branding?.name ?? global?.branding?.name ?? DEFAULT_BRANDING.NAME,
  };
}

/** As a `SourceEntry`, the shape the listing surfaces (`search`, `doctor`) want. */
export async function resolvePrimarySourceEntry(projectDir?: string): Promise<SourceEntry> {
  const resolvedConfig = await resolveSource({ caller: "stored", projectDir });
  return {
    name: "marketplace",
    url: resolvedConfig.source,
    description: "Primary skills marketplace",
  };
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

/** `flagName` is what carried the value, as the messages name it back. */
export function validateSourceFormat(source: string, flagName: string): void {
  if (NULL_BYTE_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters.\n\n` +
        `Marketplace values must not contain null bytes.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} github:user/repo`,
    );
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    throw new Error(
      `${flagName} value is too long (${source.length} characters, max ${MAX_SOURCE_LENGTH}).\n\n` +
        `Provide a shorter marketplace path or URL.\n` +
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

  // Block path traversal in any remote marketplace (refs, branches, query params)
  if (PATH_TRAVERSAL_PATTERN.test(pathAfterProtocol)) {
    throw new Error(
      `${flagName} contains path traversal in URL: "${source}"\n\n` +
        `Remote marketplace URLs must not contain '..' sequences.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} https://github.com/user/repo`,
    );
  }

  if (protocol === "https://" || protocol === "http://") {
    validateHttpUrl(source, flagName);
    return;
  }

  validateGitShorthand(source, pathAfterProtocol, flagName);
}

function validateHttpUrl(source: string, flagName: string): void {
  // Basic URL structure check: must have a hostname with at least one dot or localhost
  const afterProtocol = source.replace(/^https?:\/\//, "");
  // Strip port number for hostname validation (e.g., "localhost:8080" -> "localhost")
  const hostnameWithPort = afterProtocol.split("/")[0] ?? "";
  const hostname = hostnameWithPort.split(":")[0] ?? "";

  if (!namesAcceptedHost(hostname, hostnameWithPort)) {
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
        `Marketplace URLs must not target private network addresses.\n` +
        `Use a public hostname instead.\n` +
        `Examples:\n` +
        `  ${flagName} https://github.com/user/repo\n` +
        `  ${flagName} https://gitlab.company.com/team/skills`,
    );
  }
}

/**
 * Whether the URL names an accepted host: a dotted hostname (github.com), localhost, or a
 * bracketed IPv6 address ([::1]).
 */
function namesAcceptedHost(hostname: string, hostnameWithPort: string): boolean {
  if (!hostname) return false;
  const isBracketedIPv6 = hostnameWithPort.startsWith("[") && hostnameWithPort.includes("]");
  return hostname.includes(".") || hostname === "localhost" || isBracketedIPv6;
}

function validateGitShorthand(source: string, repoPath: string, flagName: string): void {
  // Git shorthand format: protocol:owner/repo (must have at least owner/repo)
  if (!repoPath.includes("/")) {
    throw new Error(
      `${flagName} has an invalid repository reference: "${source}"\n\n` +
        `Git shorthand marketplaces require an owner/repo format.\n` +
        `Examples:\n` +
        `  ${flagName} github:user/repo\n` +
        `  ${flagName} gh:organization/skills`,
    );
  }
}

function validateLocalPath(source: string, flagName: string): void {
  // eslint-disable-next-line no-control-regex -- control characters (bar common whitespace) are what this rejects
  const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0E-\x1F\x7F]/u;
  if (CONTROL_CHAR_PATTERN.test(source)) {
    throw new Error(
      `${flagName} contains invalid characters: "${source}"\n\n` +
        `Marketplace paths must not contain control characters.\n` +
        `Examples:\n` +
        `  ${flagName} ./my-skills\n` +
        `  ${flagName} /home/user/skills`,
    );
  }

  // UNC paths can trigger SMB authentication to an attacker's server, leaking credentials.
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

/** Asked of the source string; where a directory is in hand, use `isPublicCatalogueCheckout`. */
export function isDefaultSource(source: string): boolean {
  return source === DEFAULT_SOURCE;
}

/** The only field of a repository's package.json this module reads. */
const packageIdentitySchema = z.object({ name: z.string() });

/** Read off package identity, never off `marketplace.json`'s name, which the author writes. */
export async function isPublicCatalogueCheckout(basePath: string): Promise<boolean> {
  const raw = await readFileOptional(path.join(basePath, STANDARD_FILES.PACKAGE_JSON));
  return declaredPackageName(raw) === PUBLIC_CATALOGUE_PACKAGE;
}

/** The `name` a package.json declares, or null when there is none to read. */
function declaredPackageName(raw: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = packageIdentitySchema.safeParse(json);
  return parsed.success ? parsed.data.name : null;
}

/** Read by both stack lookups so offering and resolving agree; a catalogue checkout counts too. */
export async function offersBuiltInStacks(basePath: string, source: string): Promise<boolean> {
  return isDefaultSource(source) || (await isPublicCatalogueCheckout(basePath));
}

export function isLocalSource(source: string): boolean {
  if (source.startsWith("/") || source.startsWith(".")) {
    return true;
  }

  const hasRemoteProtocol = REMOTE_PROTOCOLS.some((prefix) => source.startsWith(prefix));
  if (hasRemoteProtocol) return false;

  if (source.includes("..") || source.includes("~")) {
    throw new Error(
      `Invalid marketplace path: ${source}. Path traversal patterns like '..' and '~' are not allowed for security reasons. Use absolute paths or remote URLs instead (e.g., '/home/user/skills' or 'https://github.com/user/repo').`,
    );
  }
  return true;
}
