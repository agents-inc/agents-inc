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
  LEGACY_SOURCE_DIR,
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

// DEFAULT_SOURCE lives in @workspace/compile, because the editor's output preview records it for
// a configuration naming no marketplace; re-exported here for existing importers of this module.
export { DEFAULT_SOURCE };
export const SOURCE_ENV_VAR = "CC_MARKETPLACE";

// Re-export types that moved to src/cli/types/config.ts for backward compatibility
export type { SourceEntry, BrandingConfig } from "../../types/config";

// getProjectConfigPath lives in install-base-dir.ts (a neutral leaf) to avoid an
// import cycle; re-exported here for existing importers of this module.
export { getProjectConfigPath };

export type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
} & (RecordedMarketplaceName | { marketplace?: undefined; marketplaceRecordedIn?: undefined });

/**
 * The marketplace name an installation recorded beside its source, and the `config.ts` it was
 * recorded in. A pair, because a refusal of the name sends the reader to the file holding it.
 */
type RecordedMarketplaceName = { marketplace: string; marketplaceRecordedIn: string };

/**
 * Who is asking for a marketplace, and therefore whether this run may CHOOSE one.
 *
 * Choosing is an install-time decision (owner ruling 2026-08-09): `--marketplace` is
 * `init`'s flag and nobody else's, and {@link SOURCE_ENV_VAR} is the same choice made
 * without typing it — so the environment rung is read for `init` and for nothing else.
 * Every later command asks as `"stored"` and gets what the install recorded: the
 * project config, then the global one, then {@link DEFAULT_SOURCE}.
 *
 * A `"stored"` caller may still NAME a marketplace it is reading for its own sake —
 * `doctor` validating a marketplace repository points the loader at a path — which is why
 * the flag is not tied to the caller. What `init` alone gets is the ambient environment.
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
 * Reads the settings config at `dir`, or answers `null` when there is none to read.
 *
 * **A file that EXISTS and cannot be loaded is raised, never reported as absence** (owner ruling
 * 2026-08-20). `resolveSource` reads the return value alone, so a swallowed failure was
 * indistinguishable from a config that is not there: the run walked past this rung to
 * {@link DEFAULT_SOURCE} and installed from a marketplace nobody named, while the config naming a
 * private one sat unread on disk. Every way a config can fail is on the loud side of that line — a
 * file that could not be evaluated, a module whose exports are all named, a file that declared
 * nothing, and a shape the installation schema refuses.
 *
 * **The file is judged as the full-config reader judges it** (`loadProjectConfigFromDir`) before
 * its settings are read. The settings schema declares only the settings fields and lets everything
 * else through, so judged by it alone an empty file read as absent and a refused `skills` beside a
 * named marketplace read as usable — while `list`, `edit` and `doctor` refused the very same file.
 *
 * A MISSING file keeps its `null`, and that is the whole of what `null` means here: the legitimate
 * state `init` exists for, and the state `edit` reports as "no installation".
 *
 * Every call site chose a posture and states it where it stands. All but one ABORT: the marketplace
 * a run installs from is not a thing to guess at, and the two sites that read this file to locate a
 * marketplace's own skills or agent partials would otherwise walk a tree it says is elsewhere. The
 * exception is `validateRegisteredSources`, which DEGRADES — a command whose job is naming what is
 * wrong here has to survive the thing it is naming, so `doctor`'s `safeCheck` turns the raise into
 * a failed row and its `readsConfig: true` rows stand down before reaching here at all. Two further
 * sites are unreachable rather than chosen: `mergeWithExistingConfig` loads the full config first,
 * and `ensureMinimalConfig` reads only where the file is absent.
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

/**
 * The refusal for an installation's config, worded as `ensureConfigReadable` words the same file:
 * whose config it is, and the folder the way out is taken from.
 */
function refuseInstallationConfig(
  configPath: string,
  scope: ScopeKind,
  scopeRoot: string,
): RefuseUnreadable {
  return (reason, cause) =>
    new Error(installationConfigsUnreadable([{ configPath, reason, scope, scopeRoot }]), { cause });
}

/**
 * The config at `configPath` as `schema` admits it, or `null` when it evaluated and declared
 * nothing — which each caller answers for itself: an installation's file declaring nothing is
 * refused, while a source repo declaring nothing in one folder is asked about the next.
 *
 * Every way of failing raises. Split out from {@link loadSourceConfig} so that function's own body
 * reads as the states it answers, with a file that will not load named once here rather than
 * assembled from a `let` and a `try`.
 */
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

/**
 * The settings an installation's config carries, read out of a config its installation schema has
 * already admitted.
 *
 * Parsed rather than taken as they stand, because that schema lets the settings-only fields through
 * unread — `branding` and the directory overrides are not its fields — and one of the wrong type is
 * refused here as it always was, naming the field.
 */
function readSettings(configPath: string, installation: unknown): Partial<ProjectConfig> {
  const settings = projectSourceConfigSchema.safeParse(installation);
  if (!settings.success) {
    throw new ConfigSchemaError(configPath, formatZodIssues(settings.error.issues));
  }
  return settings.data;
}

/**
 * Whether a load failure already names the field or the export at fault, and so is handed on as
 * itself rather than re-worded.
 *
 * The two it admits fault a LINE of a file the user still owns and can go and correct. Everything
 * else says only that the file would not evaluate, which is what each reader's own
 * {@link RefuseUnreadable} exists to turn into a way out.
 */
function describesItsOwnFault(error: unknown): boolean {
  return error instanceof ConfigSchemaError || error instanceof ConfigDefaultExportError;
}

/**
 * The refusal for a marketplace repository's own config that exists and cannot be evaluated.
 *
 * `loadConfig` already names the file and the parser's own reason — `Failed to load config from
 * '<path>': ParseError: Missing semicolon` — so it is handed straight to
 * {@link configUnreadableError} rather than restated. An installation's config is refused by
 * {@link installationConfigsUnreadable} instead, which can say whose config it is.
 */
const unreadableSourceRepoConfig: RefuseUnreadable = (reason, cause) =>
  new Error(configUnreadableError(reason), { cause });

/**
 * The config a MARKETPLACE SOURCE REPOSITORY declares about itself, or `null` when it declares
 * none: `<base>/.agents-inc/config.ts`, falling back to `<base>/.claude-src/config.ts`.
 *
 * Its own door, because it answers a different question from every other reader of this file.
 * An INSTALLATION's config lives inside a provider folder — one installation is exactly one
 * provider and the folder is what says which. A source repo's config is provider-NEUTRAL and
 * carries no provider segment: `skillsDir` and `stacksFile` describe the repository's own layout
 * and have nothing to do with a provider, and a marketplace serving both would otherwise have to
 * declare its layout twice.
 *
 * The old name is a fallback with NO sunset. The CLI can never move a folder in a repository it
 * only reads, and an author who moved it would break every consumer still on an older CLI —
 * silently, as "No skills found". Keeping both names reachable from one function is what lets
 * "read `.claude-src` in sources forever" and "sunset `.claude-src` for installs" both be true.
 */
export async function loadSourceRepoConfig(
  basePath: string,
): Promise<Partial<ProjectConfig> | null> {
  for (const folder of SOURCE_REPO_CONFIG_FOLDERS) {
    const declared = await readDeclaredConfig(path.join(basePath, folder));
    if (declared) return declared;
  }
  return null;
}

/** Where a source repo may declare itself, in the order the first one found wins. */
const SOURCE_REPO_CONFIG_FOLDERS = [SOURCE_ROOT_DIR, LEGACY_SOURCE_DIR];

/** The config in one candidate folder, or `null` when that folder declares none. */
async function readDeclaredConfig(dir: string): Promise<Partial<ProjectConfig> | null> {
  const configPath = path.join(dir, STANDARD_FILES.CONFIG_TS);
  if (!(await fileExists(configPath))) {
    verbose(`Source config not found at ${configPath}`);
    return null;
  }
  return readConfigOrRefuse(configPath, projectSourceConfigSchema, unreadableSourceRepoConfig);
}

/**
 * Load source config from a directory's own installation folder.
 *
 * The scope it announces is derived, not assumed: at the home root the file this reads
 * IS the global config, and a caller asking a project question there — `doctor` deciding
 * whether the cwd is a source repository — must not be told a project config was found
 * where none exists.
 */
export async function loadProjectSourceConfig(
  projectDir: string,
): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(projectDir, isHomeDirectory(projectDir) ? "global" : "project");
}

/** Load source config from the global home directory's own source folder. */
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

/** The directory whose config is a project's own, or null — see {@link loadOwnProjectSourceConfig}. */
function ownProjectDir(projectDir: string | undefined): string | null {
  return projectDir === undefined || isHomeDirectory(projectDir) ? null : projectDir;
}

/**
 * A project's OWN source config, and nothing at the home root.
 *
 * `~/.claude-src/config.ts` is the global config, so reading it as a project's would label
 * one file both things at once: `compile` naming `Marketplace: project` beside
 * `Compiling global agents...`, `edit` announcing `(project)` while refusing scope toggles
 * as a global context. The axis is which FILE the settings were read from — never what
 * scope the skill and agent entries inside it carry.
 */
async function loadOwnProjectSourceConfig(
  projectDir: string | undefined,
): Promise<Partial<ProjectConfig> | null> {
  const ownDir = ownProjectDir(projectDir);
  return ownDir === null ? null : loadProjectSourceConfig(ownDir);
}

/** The marketplace name the effective config recorded, with the file it recorded it in. */
function recordedMarketplaceName(
  effective: EffectiveSourceConfig | null,
): RecordedMarketplaceName | undefined {
  if (effective?.config.marketplaceName === undefined) return undefined;
  return {
    marketplace: effective.config.marketplaceName,
    marketplaceRecordedIn: effective.configPath,
  };
}

/**
 * Precedence: flag > env > project > global > default, with the first two rungs
 * reachable by `init` alone — see {@link SourceCaller}.
 */
export async function resolveSource(request: ResolveSourceRequest): Promise<ResolvedConfig> {
  const { caller, flag, projectDir } = request;
  const effective = await loadEffectiveSourceConfig(projectDir);
  const storedSource = effective?.config.marketplace ?? DEFAULT_SOURCE;
  // The stored NAME becomes this result's `marketplace` — the ref it was read beside becomes the
  // `source`. It labels that ref and no other: a project set up from another marketplace than the
  // one its global installation stored read the global's name as its own, and installed plugins
  // against a marketplace Claude Code had registered under a different one.
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
 * How a marketplace this run NAMED is referred to back to whoever named it.
 *
 * Origin-neutral on purpose: `--marketplace` is `init`'s flag and nobody else's, while a
 * `"stored"` caller may still name a marketplace it is reading for its own sake — `doctor`
 * points the loader at a marketplace repository. Naming the flag in a sentence that caller
 * reads blames an option it never passed.
 */
const NAMED_SOURCE_LABEL = "The marketplace";

/**
 * Refuses a named marketplace that cannot be one. Raised rather than warned: somebody named
 * this, so falling through to another would install from a place they did not name.
 */
function assertNamedSourceUsable(flag: string): void {
  if (flag.trim() === "") {
    throw new Error(
      `${NAMED_SOURCE_LABEL} cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')`,
    );
  }
  validateSourceFormat(flag.trim(), NAMED_SOURCE_LABEL);
}

/**
 * The marketplace {@link SOURCE_ENV_VAR} names, or undefined when it names none this run.
 *
 * Unset, empty and unusable all fall through to the next rung with a warning rather than
 * a refusal — the environment is ambient, so an exported value nobody meant for this run
 * must not be able to fail it. That is the opposite of {@link assertNamedSourceUsable},
 * and deliberately so: one was typed at this command, the other was already there.
 */
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

/** Resolved branding with defaults applied for any missing fields */
export type ResolvedBranding = {
  name: string;
};

/**
 * Branding resolved per FIELD: this project's, then the global one's, then the shipped default.
 *
 * Per field rather than per file, and that distinction is the whole of this function. Everything
 * else reads {@link loadEffectiveSourceConfig}, which answers with the project's config if that
 * FILE exists and the global one otherwise — right for `marketplace`, where a project's is its own
 * and inheriting one would install from somewhere nobody named. Branding is the opposite kind of
 * field: it is presentation, a user sets it once for themselves, and a project that says nothing
 * about it is not asking for the shipped name back.
 *
 * Read per file it did exactly that. A user who branded globally stopped seeing their own name the
 * moment any project config existed — which is every installed project — and nothing announced it;
 * the name simply reverted. This function's own docblock described the per-field behaviour for as
 * long as the code did not perform it.
 */
export async function resolveBranding(projectDir?: string): Promise<ResolvedBranding> {
  const [own, global] = await Promise.all([
    loadOwnProjectSourceConfig(projectDir),
    loadGlobalSourceConfig(),
  ]);

  return {
    name: own?.branding?.name ?? global?.branding?.name ?? DEFAULT_BRANDING.NAME,
  };
}

/**
 * The one marketplace this installation reads skills from, as a {@link SourceEntry}.
 *
 * Distinct from {@link resolveSource}, which answers the same question as a
 * {@link ResolvedConfig} (source string plus where it came from). This is the shape the
 * surfaces that LIST sources want — `search` and `doctor` — and there is exactly one of
 * them: the registered-extras array this used to return alongside it was withdrawn with
 * the marketplace axis itself.
 */
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

/**
 * Validates a marketplace string format before it reaches giget or filesystem operations.
 * Catches obviously invalid formats early with clear error messages.
 *
 * @param source - The trimmed, non-empty marketplace value to validate
 * @param flagName - What carried this value, as the error messages name it back: `init`'s
 *   `--marketplace`, {@link SOURCE_ENV_VAR}, or {@link NAMED_SOURCE_LABEL} when no flag did
 */
export function validateSourceFormat(source: string, flagName: string): void {
  // Null bytes can bypass C-level string termination in downstream tools (giget, git)
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

  // For https:// and http:// URLs, validate basic URL structure
  if (protocol === "https://" || protocol === "http://") {
    validateHttpUrl(source, flagName);
    return;
  }

  // For git shorthand protocols (github:, gh:, gitlab:, etc.), validate org/repo pattern
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
  // Check for control characters (except common whitespace)
  // eslint-disable-next-line no-control-regex
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

/**
 * Whether a resolved marketplace IS the default public one, asked of the source
 * STRING.
 *
 * The one place that question is answered, because more than one surface asks it
 * and they must agree: the install-mode tagger decides whether the marketplace it
 * labels skills with is public or private, and both stack lookups ask it as half
 * of {@link offersBuiltInStacks}. A marketplace named explicitly — by flag, env
 * or config — is the default one when it spells {@link DEFAULT_SOURCE}.
 *
 * A path is not this question's subject. Nothing in a source STRING that happens
 * to be a path says which repository it holds; {@link isPublicCatalogueCheckout}
 * asks the directory instead, and it is the one to use where a directory is in hand.
 */
export function isDefaultSource(source: string): boolean {
  return source === DEFAULT_SOURCE;
}

/** The only field of a repository's package.json this module reads. */
const packageIdentitySchema = z.object({ name: z.string() });

/**
 * Whether the DIRECTORY at `basePath` is a checkout of the public catalogue's own
 * repository, read off package identity.
 *
 * Never off the name in `marketplace.json`: that name is a claim the author
 * writes, so a guard keyed on it would exempt exactly the source it exists to
 * catch. {@link PUBLIC_CATALOGUE_PACKAGE} carries what the signal is and is not
 * worth.
 *
 * The build side asks a different question of the same identity and is spelled
 * apart from this one on purpose: `isCatalogueOwnReservedName` in
 * `marketplace-generator.ts` asks whether a marketplace NAME about to be
 * published is the catalogue's own, and takes the package name it already holds
 * rather than a directory to read one from.
 */
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

/**
 * Whether the CLI's built-in stack catalogue stands in for a marketplace that
 * ships no stacks of its own.
 *
 * Two spellings of one marketplace, and BOTH stack lookups must read this rather
 * than either half. `resolveOfferedStacks` decides the list the wizard offers and
 * `loadStackById` resolves the id the user then picked; a rule they answer
 * differently offers a stack and refuses to install it.
 *
 * The built-in stacks ARE the public catalogue's stacks — that repository ships
 * no `config/stacks.ts` at all — so a checkout of it read off a path has to reach
 * them too, and the source string cannot say that a path is that repository.
 */
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

/**
 * Whether two marketplace refs name one marketplace.
 *
 * A folder on disk is one marketplace however its path is spelled, so two local paths are compared
 * resolved against `fromDir` — the directory a relative one is read from — and `path.resolve`
 * drops a trailing slash on the way. A remote ref names one repository only as written.
 */
export function isSameMarketplace(a: string, b: string, fromDir: string): boolean {
  if (isLocalSource(a) && isLocalSource(b)) {
    return path.resolve(fromDir, a) === path.resolve(fromDir, b);
  }
  return a === b;
}
