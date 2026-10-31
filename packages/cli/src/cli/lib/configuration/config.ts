import { BlockList, isIPv4 } from "net";
import os from "os";
import path from "path";
import { z } from "zod";
import { DEFAULT_SOURCE } from "@workspace/compile";
import { fileExists, readFileOptional } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { inertLine } from "../../utils/string";
import {
  DEFAULT_BRANDING,
  GITHUB_SOURCE,
  PUBLIC_CATALOGUE_PACKAGE,
  SOURCE_ROOT_DIR,
  STANDARD_FILES,
  type Provider,
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
import {
  declaresNoContent,
  inheritedGlobalProvider,
  providerInUse,
} from "../installation/install-layout";
import { initProviderToNameAt, providerToNameAt } from "../installation/provider-to-name";
import { isHomeDirectory } from "../installation/is-home-directory";
import type { ScopeKind } from "../installation/source-scopes";

export { DEFAULT_SOURCE };
export const SOURCE_ENV_VAR = "CC_MARKETPLACE";

export type { SourceEntry } from "../../types/config";

// Lives in install-base-dir.ts to avoid an import cycle.
export { getProjectConfigPath };

export type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
} & (RecordedMarketplaceName | { marketplace?: undefined; marketplaceRecordedIn?: undefined });

/** A pair, because a refusal of the name sends the reader to the file holding it. */
type RecordedMarketplaceName = { marketplace: string; marketplaceRecordedIn: string };

/**
 * `"init"` chooses a marketplace: the one named, then the environment's, then the default, since
 * a shared id naming none names the public catalogue. `"stored"` reads the one recorded: project,
 * then global, then the default, though any caller may still name one to read.
 */
export type SourceCaller = "init" | "stored";

type ResolveSourceRequest = {
  caller: SourceCaller;
  /** The marketplace this run named, where it named one. */
  flag?: string | undefined;
  /** The project whose `config.ts` is the first stored rung. */
  projectDir?: string | undefined;
  /** Whose configs the stored rungs are, where a scope holds two; read off each folder otherwise. */
  provider?: Provider | undefined;
};

type StoredConfig = { settings: Partial<ProjectConfig>; declaresNothing: boolean };

/**
 * `null` only when the file is absent. A present file that cannot load is raised, never reported as
 * absence, and is judged as the full-config reader judges it. Callers abort, except
 * `validateRegisteredSources`, which degrades.
 */
async function readStoredConfig(
  dir: string,
  scope: ScopeKind,
  provider?: Provider,
): Promise<StoredConfig | null> {
  const scopeLabel = scope === "project" ? "Project" : "Global";
  const configPath = storedConfigPath(dir, provider);

  if (!(await fileExists(configPath))) {
    verbose(`${scopeLabel} config not found at ${configPath}`);
    return null;
  }

  const unreadable = refuseInstallationConfig(
    configPath,
    scope,
    dir,
    provider ?? providerInUse(dir),
  );
  const installation = await readConfigOrRefuse(configPath, projectConfigLoaderSchema, unreadable);
  if (installation === null) throw unreadable(NO_VALID_DEFAULT_EXPORT);
  const settings = readSettings(configPath, installation);

  verbose(`Loaded ${scope} config from ${dir}`);
  return {
    settings,
    declaresNothing: declaresNoContent({
      skills: installation.skills ?? [],
      agents: installation.agents ?? [],
    }),
  };
}

async function loadSourceConfig(
  dir: string,
  scope: ScopeKind,
  provider?: Provider,
): Promise<Partial<ProjectConfig> | null> {
  const stored = await readStoredConfig(dir, scope, provider);
  return stored === null ? null : stored.settings;
}

/** How a reader words a config that is there and will not load, from the reason it gives. */
type RefuseUnreadable = (reason: string, cause?: unknown) => Error;

/** Worded as `ensureConfigReadable` words the same file. */
function refuseInstallationConfig(
  configPath: string,
  scope: ScopeKind,
  scopeRoot: string,
  provider: Provider,
): RefuseUnreadable {
  const providerToName = providerToNameAt(scopeRoot, provider);
  const initProviderToName = initProviderToNameAt(scopeRoot, provider);
  return (reason, cause) =>
    new Error(
      installationConfigsUnreadable([
        { configPath, reason, scope, scopeRoot, providerToName, initProviderToName },
      ]),
      { cause },
    );
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

/** `loadConfig` already names the file and the parser's reason, so it is passed on as-is. */
const unreadableSourceRepoConfig: RefuseUnreadable = (reason, cause) =>
  new Error(configUnreadableError(reason), { cause });

/**
 * A source repo's own config, with absence told apart from a file that declares nothing, which
 * `loadConfig` answers `null` for alike.
 */
export type SourceRepoConfigRead =
  | { kind: "absent" }
  | { kind: "declares-nothing"; configPath: string }
  | { kind: "declared"; config: Partial<ProjectConfig> };

/** A source repo's own `<base>/.agents-inc/config.ts`, provider-neutral: layout has no provider. */
export async function readSourceRepoConfig(basePath: string): Promise<SourceRepoConfigRead> {
  const configPath = path.join(basePath, SOURCE_ROOT_DIR, STANDARD_FILES.CONFIG_TS);
  if (!(await fileExists(configPath))) {
    verbose(`Source config not found at ${configPath}`);
    return { kind: "absent" };
  }

  const config = await readConfigOrRefuse(
    configPath,
    projectSourceConfigSchema,
    unreadableSourceRepoConfig,
  );
  return config === null ? { kind: "declares-nothing", configPath } : { kind: "declared", config };
}

/** Null when the repo declares no layout of its own, whether the file is absent or empty. */
export async function loadSourceRepoConfig(
  basePath: string,
): Promise<Partial<ProjectConfig> | null> {
  const read = await readSourceRepoConfig(basePath);
  return read.kind === "declared" ? read.config : null;
}

/** The scope it announces is derived: at the home root this file is the global config. */
export async function loadProjectSourceConfig(
  projectDir: string,
): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(projectDir, isHomeDirectory(projectDir) ? "global" : "project");
}

/** `provider` names the installation where the home holds two; the default is the one in use. */
export async function loadGlobalSourceConfig(
  provider?: Provider,
): Promise<Partial<ProjectConfig> | null> {
  return loadSourceConfig(os.homedir(), "global", provider);
}

/** The effective source config, which scope it was actually loaded from, and its file. */
type EffectiveSourceConfig = {
  config: Partial<ProjectConfig>;
  origin: ScopeKind;
  configPath: string;
};

async function loadEffectiveSourceConfig(
  projectDir?: string,
  provider?: Provider,
): Promise<EffectiveSourceConfig | null> {
  const ownDir = ownProjectDir(projectDir);
  const own = ownDir === null ? null : await readStoredRung(ownDir, "project", provider);
  if (own !== null && !readsAsNoConfig(own)) return own;
  return readStoredRung(os.homedir(), "global", provider ?? inheritedBy(projectDir));
}

/** A project config declaring nothing reads as none, though a marketplace it names is still read. */
function readsAsNoConfig(own: StoredRung): boolean {
  return own.declaresNothing && own.config.marketplace === undefined;
}

/** The global installation a project inherits, or home's own where the run names no project. */
function inheritedBy(projectDir: string | undefined): Provider {
  return inheritedGlobalProvider(projectDir ?? os.homedir());
}

type StoredRung = EffectiveSourceConfig & Pick<StoredConfig, "declaresNothing">;

/** One stored rung: the config at `dir` and the file it was read from, or null when it has none. */
async function readStoredRung(
  dir: string,
  origin: ScopeKind,
  provider?: Provider,
): Promise<StoredRung | null> {
  const stored = await readStoredConfig(dir, origin, provider);
  return (
    stored && {
      config: stored.settings,
      declaresNothing: stored.declaresNothing,
      origin,
      configPath: storedConfigPath(dir, provider),
    }
  );
}

/** The named installation's config, or the one the folder holds where none is named. */
function storedConfigPath(dir: string, provider: Provider | undefined): string {
  return provider === undefined ? getInstalledConfigPath(dir) : getProjectConfigPath(dir, provider);
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

/** Precedence: flag > env > project > global > default; `init` reads env, never the configs. */
export async function resolveSource(request: ResolveSourceRequest): Promise<ResolvedConfig> {
  const { caller, flag, projectDir, provider } = request;
  const effective = await loadEffectiveSourceConfig(projectDir, provider);
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

  if (caller === "stored" && effective?.config.marketplace) {
    assertStoredSourceUsable(effective.config.marketplace, effective.configPath);
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

/** Origin-neutral: a `"stored"` caller may name a marketplace too, without `--marketplace`. */
const NAMED_SOURCE_LABEL = "The marketplace";

/** Whoever carried a marketplace value: a refusal names them, and writes its examples their way. */
export type MarketplaceCarrier = Readonly<{
  subject: string;
  writes: (marketplace: string) => string;
}>;

/** Named by this run, written as the flag a user names one with. */
export const NAMED_MARKETPLACE: MarketplaceCarrier = {
  subject: NAMED_SOURCE_LABEL,
  writes: (marketplace) => `--marketplace ${marketplace}`,
};

/** Recorded in a config file, quoted as the config the CLI writes quotes it. */
function marketplaceInConfig(configPath: string): MarketplaceCarrier {
  return {
    subject: `${NAMED_SOURCE_LABEL} in ${configPath}`,
    writes: (marketplace) => `marketplace: '${marketplace}'`,
  };
}

const ENVIRONMENT_MARKETPLACE: MarketplaceCarrier = {
  subject: SOURCE_ENV_VAR,
  writes: (marketplace) => `${SOURCE_ENV_VAR}=${marketplace}`,
};

/** Raised, not warned: somebody named this, so falling through would install from elsewhere. */
export function assertNamedSourceUsable(flag: string): void {
  if (flag.trim() === "") {
    throw new Error(
      `${NAMED_SOURCE_LABEL} cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')`,
    );
  }
  validateSourceFormat(flag.trim(), NAMED_MARKETPLACE);
}

/** Raised as a named one is, naming the file: whoever wrote it there chose it as surely. */
function assertStoredSourceUsable(source: string, configPath: string): void {
  validateSourceFormat(source, marketplaceInConfig(configPath));
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
    validateSourceFormat(trimmed, ENVIRONMENT_MARKETPLACE);
  } catch (error) {
    warn(
      `${SOURCE_ENV_VAR} has an invalid value — ignoring and falling back to the next rung.\n${getErrorMessage(error)}`,
    );
    return undefined;
  }

  verbose(`Marketplace from ${SOURCE_ENV_VAR} env var: ${trimmed}`);
  return trimmed;
}

type ResolvedBranding = {
  name: string;
};

/** Per field, not per file: the project's, then the global one's, then the shipped default. */
export async function resolveBranding(projectDir?: string): Promise<ResolvedBranding> {
  const [own, global] = await Promise.all([
    loadOwnProjectSourceConfig(projectDir),
    loadGlobalSourceConfig(inheritedBy(projectDir)),
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
  GITHUB_SOURCE.GITHUB_PREFIX,
  GITHUB_SOURCE.GH_PREFIX,
  "gitlab:",
  "bitbucket:",
  "sourcehut:",
  "https://",
  "http://",
] as const;

type RemoteProtocol = (typeof REMOTE_PROTOCOLS)[number];

const MIN_REMOTE_PATH_LENGTH = 3;
const MAX_SOURCE_LENGTH = 512;

// A null byte truncates the string in downstream C-level tools.
const NULL_BYTE_PATTERN = /\0/;

const PATH_TRAVERSAL_PATTERN = /\.\./;

// A UNC path can trigger SMB authentication to an attacker's server, leaking credentials.
const UNC_PATH_PATTERN = /^(?:\/\/|\\\\)/;

type Subnet = { network: string; prefix: number };

/**
 * Private and reserved ranges a marketplace URL must not target (SSRF via giget). Reads the URL's
 * text only: a redirect, a `.json` source naming another URL, a name resolving to a private
 * address, an operator's NAT64 prefix, and a URL read from anywhere but a marketplace value (a cache
 * record, a host-refreshed marketplace) are not checked; only a connect-time check of the resolved
 * address would see them, and there is none.
 */
const PRIVATE_IPV4_SUBNETS: readonly Subnet[] = [
  { network: "127.0.0.0", prefix: 8 },
  { network: "10.0.0.0", prefix: 8 },
  { network: "172.16.0.0", prefix: 12 },
  { network: "192.168.0.0", prefix: 16 },
  { network: "169.254.0.0", prefix: 16 },
  { network: "0.0.0.0", prefix: 8 }, // "this network"; 0.0.0.0 itself connects to the loopback
  { network: "100.64.0.0", prefix: 10 }, // shared carrier-grade NAT space
  { network: "192.0.0.0", prefix: 24 }, // IETF protocol assignments
  { network: "198.18.0.0", prefix: 15 }, // benchmarking
  { network: "224.0.0.0", prefix: 4 }, // multicast
  { network: "240.0.0.0", prefix: 4 }, // reserved, up to the broadcast 255.255.255.255
];

const PRIVATE_IPV6_SUBNETS: readonly Subnet[] = [
  { network: "::", prefix: 128 }, // unspecified: 0.0.0.0's twin, and it too connects to the loopback
  { network: "::1", prefix: 128 },
  { network: "fc00::", prefix: 7 }, // unique local
  { network: "fe80::", prefix: 10 }, // link-local
  { network: "ff00::", prefix: 8 }, // multicast
  // NAT64 local use, whole: where it carries IPv4 depends on the prefix length (RFC 6052).
  { network: "64:ff9b:1::", prefix: 48 },
];

/** Where an IPv6 address holds the IPv4 one it carries: its lowest bit, and whether inverted. */
type CarriedIPv4 = Readonly<{ lowestBit: bigint; inverted: boolean }>;

const IN_THE_LAST_32_BITS: CarriedIPv4 = { lowestBit: 0n, inverted: false };

/** IPv6 forms that carry an IPv4 address; a connection to one reaches the address it carries. */
const IPV4_CARRYING_FORMS: readonly (Subnet & { carries: readonly CarriedIPv4[] })[] = [
  { network: "::ffff:0:0", prefix: 96, carries: [IN_THE_LAST_32_BITS] }, // IPv4-mapped
  { network: "::ffff:0:0:0", prefix: 96, carries: [IN_THE_LAST_32_BITS] }, // IPv4-translated
  { network: "::", prefix: 96, carries: [IN_THE_LAST_32_BITS] }, // IPv4-compatible
  { network: "64:ff9b::", prefix: 96, carries: [IN_THE_LAST_32_BITS] }, // NAT64
  { network: "2002::", prefix: 16, carries: [{ lowestBit: 80n, inverted: false }] }, // 6to4
  // Teredo: the server that relays to the client, and the client, inverted.
  {
    network: "2001::",
    prefix: 32,
    carries: [
      { lowestBit: 64n, inverted: false },
      { lowestBit: 0n, inverted: true },
    ],
  },
];

const PRIVATE_IPV4_ADDRESSES = blockListOf(PRIVATE_IPV4_SUBNETS, "ipv4");
const PRIVATE_IPV6_ADDRESSES = blockListOf(PRIVATE_IPV6_SUBNETS, "ipv6");
const IPV4_CARRIERS = IPV4_CARRYING_FORMS.map(({ carries, ...subnet }) => ({
  carries,
  addresses: blockListOf([subnet], "ipv6"),
}));

const IPV6_GROUP_COUNT = 8;
const IPV6_GROUP_BITS = 16n;
const HEX_RADIX = 16;
const IPV4_BITS_MASK = 0xffff_ffffn;
const IPV4_OCTET_LOWEST_BITS = [24n, 16n, 8n, 0n];
const OCTET_MASK = 0xffn;

/**
 * Thrown for a marketplace value the check refuses, so a refusal is told apart from a fault. Its
 * `name` stays `Error`: `eject` lets a refusal reach the binary, which prints `<name>: <message>`.
 */
export class MarketplaceRefusedError extends Error {}

/** The examples each refusal offers, written out by the carrier of the value it refused. */
const LOCAL_OR_SHORTHAND_EXAMPLES = ["./my-skills", "github:user/repo"];
const REMOTE_EXAMPLES = ["github:user/repo", "https://github.com/user/repo"];
const URL_EXAMPLES = ["https://github.com/user/repo", "https://gitlab.company.com/team/skills"];
const SHORTHAND_EXAMPLES = ["github:user/repo", "gh:organization/skills"];
const LOCAL_EXAMPLES = ["./my-skills", "/home/user/skills"];
const LOCAL_OR_URL_EXAMPLES = [...LOCAL_EXAMPLES, "https://github.com/user/repo"];

/** What is wrong with the value, why, and what to write instead, the way its carrier writes one. */
function refusal(
  carrier: MarketplaceCarrier,
  problem: string,
  why: readonly string[],
  examples: readonly string[],
): MarketplaceRefusedError {
  return new MarketplaceRefusedError(
    [
      `${carrier.subject} ${problem}`,
      "",
      ...why,
      "Examples:",
      ...examples.map((example) => `  ${carrier.writes(example)}`),
    ].join("\n"),
  );
}

export function validateSourceFormat(source: string, carrier: MarketplaceCarrier): void {
  if (NULL_BYTE_PATTERN.test(source)) {
    throw refusal(
      carrier,
      "contains invalid characters.",
      ["Marketplace values must not contain null bytes."],
      LOCAL_OR_SHORTHAND_EXAMPLES,
    );
  }

  if (source.length > MAX_SOURCE_LENGTH) {
    throw refusal(
      carrier,
      `value is too long (${source.length} characters, max ${MAX_SOURCE_LENGTH}).`,
      ["Provide a shorter marketplace path or URL."],
      LOCAL_OR_SHORTHAND_EXAMPLES,
    );
  }

  const matchedProtocol = REMOTE_PROTOCOLS.find((prefix) => source.startsWith(prefix));

  if (matchedProtocol) {
    validateRemoteSource(source, matchedProtocol, carrier);
  } else {
    validateLocalPath(source, carrier);
  }
}

function validateRemoteSource(
  source: string,
  protocol: RemoteProtocol,
  carrier: MarketplaceCarrier,
): void {
  const isHttp = protocol === "https://" || protocol === "http://";

  // First: every refusal below echoes the URL, and this one must not.
  if (isHttp) refuseCredentials(source, protocol, carrier);
  refuseLineBreaksAndControls(source, carrier, REMOTE_EXAMPLES);

  const pathAfterProtocol = source.slice(protocol.length).trim();

  if (pathAfterProtocol.length < MIN_REMOTE_PATH_LENGTH) {
    throw refusal(
      carrier,
      `has an incomplete URL: "${source}"`,
      ["A repository path is required after the protocol prefix."],
      REMOTE_EXAMPLES,
    );
  }

  if (PATH_TRAVERSAL_PATTERN.test(pathAfterProtocol)) {
    throw refusal(
      carrier,
      `contains path traversal in URL: "${source}"`,
      ["Remote marketplace URLs must not contain '..' sequences."],
      REMOTE_EXAMPLES,
    );
  }

  if (isHttp) {
    validateHttpUrl(source, carrier);
    return;
  }

  validateGitShorthand(source, pathAfterProtocol, carrier);
}

/** What the URL parser drops from a URL wherever it stands, before reading any of it. */
const TABS_AND_NEWLINES = /[\t\n\r]/g;

/** The run of `/` and `\` the URL parser skips after a special scheme such as http(s). */
const SLASHES_BEFORE_AUTHORITY = /^[/\\]*/;

/** Where the URL parser ends a URL's authority, for a special scheme such as http(s). */
const AUTHORITY_END = /[/?#\\]/;

const CREDENTIALS_MASK = "***";

/**
 * Shown and refused without the username or password: an echo would put them in a log. Shown as
 * the URL parser reads it, since that reading is the text the mask is cut from.
 */
function refuseCredentials(source: string, protocol: string, carrier: MarketplaceCarrier): void {
  const fromAuthority = fromAuthorityOn(source, protocol);
  const userinfo = userinfoOf(fromAuthority);
  if (userinfo === null) return;

  const shown = `${protocol}${CREDENTIALS_MASK}${fromAuthority.slice(userinfo.length)}`;
  throw refusal(
    carrier,
    `carries a username or password in its URL: "${shown}"`,
    [
      "Credentials in a marketplace URL end up in config files, shared configurations and logs.",
      "For a private repository, set the GIGET_AUTH environment variable instead:",
      "  export GIGET_AUTH=ghp_your_github_token",
    ],
    URL_EXAMPLES,
  );
}

/**
 * The http(s) URL from its authority on, as the URL parser reaches it: tabs and newlines dropped,
 * then the slashes after the scheme skipped. Read off the text rather than through `new URL`, so a
 * URL the parser cannot read is caught too, before a refusal that echoes it.
 */
function fromAuthorityOn(source: string, protocol: string): string {
  return source
    .replace(TABS_AND_NEWLINES, "")
    .slice(protocol.length)
    .replace(SLASHES_BEFORE_AUTHORITY, "");
}

/** As the URL parser reads it: everything in the authority before its last `@`; null if none. */
function userinfoOf(fromAuthority: string): string | null {
  const authorityEnd = fromAuthority.search(AUTHORITY_END);
  const authority = authorityEnd === -1 ? fromAuthority : fromAuthority.slice(0, authorityEnd);
  const lastAt = authority.lastIndexOf("@");
  return lastAt === -1 ? null : authority.slice(0, lastAt);
}

function validateHttpUrl(source: string, carrier: MarketplaceCarrier): void {
  const hostname = parsedHostname(source);

  if (hostname === null || !namesAcceptedHost(hostname)) {
    throw refusal(
      carrier,
      `has an invalid URL: "${source}"`,
      ["The URL must include a valid hostname."],
      URL_EXAMPLES,
    );
  }

  if (namesPrivateAddress(hostname)) {
    throw refusal(
      carrier,
      `points to a private or reserved IP address: "${source}"`,
      [
        "Marketplace URLs must not target private network addresses.",
        "Use a public hostname instead.",
      ],
      URL_EXAMPLES,
    );
  }
}

/**
 * The host as giget's download reads it (`new URL`), with port, query and fragment stripped and an
 * IPv4 address in dotted decimal however it was spelled; null when unreadable.
 */
function parsedHostname(source: string): string | null {
  return URL.canParse(source) ? new URL(source).hostname : null;
}

/**
 * A dotted hostname, localhost, or an IPv6 address. `localhost` passes on purpose: the e2e suite
 * and hand runs serve a remote, cached marketplace from it.
 */
function namesAcceptedHost(hostname: string): boolean {
  return hostname.includes(".") || hostname === "localhost" || isIPv6Host(hostname);
}

/** A domain name is not an address, so it is never private by this check. */
function namesPrivateAddress(hostname: string): boolean {
  if (isIPv6Host(hostname)) return isPrivateIPv6(hostname.slice(1, -1));
  return isIPv4(hostname) && isPrivateIPv4(hostname);
}

function isPrivateIPv4(address: string): boolean {
  return PRIVATE_IPV4_ADDRESSES.check(address, "ipv4");
}

function isPrivateIPv6(address: string): boolean {
  return (
    PRIVATE_IPV6_ADDRESSES.check(address, "ipv6") ||
    carriedIPv4Addresses(address).some(isPrivateIPv4)
  );
}

/** Every IPv4 address `address` carries, in each form it is written in. */
function carriedIPv4Addresses(address: string): string[] {
  const bits = ipv6Bits(address);
  return formsWrittenIn(address).flatMap(({ carries }) =>
    carries.map((carried) => ipv4Carried(bits, carried)),
  );
}

function formsWrittenIn(address: string): typeof IPV4_CARRIERS {
  return IPV4_CARRIERS.filter(({ addresses }) => addresses.check(address, "ipv6"));
}

function ipv4Carried(bits: bigint, { lowestBit, inverted }: CarriedIPv4): string {
  const held = (bits >> lowestBit) & IPV4_BITS_MASK;
  return dottedQuad(inverted ? held ^ IPV4_BITS_MASK : held);
}

function dottedQuad(ipv4Bits: bigint): string {
  return IPV4_OCTET_LOWEST_BITS.map((octetBit) => (ipv4Bits >> octetBit) & OCTET_MASK).join(".");
}

/** The address as one 128-bit number. */
function ipv6Bits(address: string): bigint {
  return ipv6Groups(address).reduce((bits, group) => (bits << IPV6_GROUP_BITS) | BigInt(group), 0n);
}

/** Read as the URL parser writes an IPv6 host: lowercase hex groups, one `::` at most, no IPv4 tail. */
function ipv6Groups(address: string): number[] {
  const gap = address.indexOf("::");
  if (gap === -1) return hexGroups(address);

  const head = hexGroups(address.slice(0, gap));
  const tail = hexGroups(address.slice(gap + "::".length));
  const zeros = Array.from({ length: IPV6_GROUP_COUNT - head.length - tail.length }, () => 0);
  return [...head, ...zeros, ...tail];
}

function hexGroups(part: string): number[] {
  if (part === "") return [];
  return part.split(":").map((group) => Number.parseInt(group, HEX_RADIX));
}

/** The URL parser writes an IPv6 host in brackets, and only an IPv6 host. */
function isIPv6Host(hostname: string): boolean {
  return hostname.startsWith("[");
}

function blockListOf(subnets: readonly Subnet[], family: "ipv4" | "ipv6"): BlockList {
  const blockList = new BlockList();
  subnets.forEach(({ network, prefix }) => blockList.addSubnet(network, prefix, family));
  return blockList;
}

function validateGitShorthand(source: string, repoPath: string, carrier: MarketplaceCarrier): void {
  if (!repoPath.includes("/")) {
    throw refusal(
      carrier,
      `has an invalid repository reference: "${source}"`,
      ["Git shorthand marketplaces require an owner/repo format."],
      SHORTHAND_EXAMPLES,
    );
  }
}

/**
 * Every line naming a marketplace echoes it, so it must be one line of plain text; the refusal's
 * own echo is made inert. A tab is kept, as the sanitiser keeps it.
 */
function refuseLineBreaksAndControls(
  source: string,
  carrier: MarketplaceCarrier,
  examples: readonly string[],
): void {
  const inert = inertLine(source);
  if (inert === source) return;

  throw refusal(
    carrier,
    `contains invalid characters: "${inert}"`,
    ["Marketplace values must not contain line breaks or control characters."],
    examples,
  );
}

function validateLocalPath(source: string, carrier: MarketplaceCarrier): void {
  refuseLineBreaksAndControls(source, carrier, LOCAL_EXAMPLES);

  if (UNC_PATH_PATTERN.test(source)) {
    throw refusal(
      carrier,
      `contains a UNC network path: "${source}"`,
      [
        "Network paths (\\\\server\\share or //server/share) are not allowed for security reasons.",
        "Use a local directory path or a remote URL instead.",
      ],
      LOCAL_OR_URL_EXAMPLES,
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
