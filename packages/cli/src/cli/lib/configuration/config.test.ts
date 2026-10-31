import { mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  writeRawTestConfig,
  writeTestPackageJson,
  writeTestTsConfig,
} from "../__tests__/helpers/config-io.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildSourceConfig,
} from "../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { setVerbose } from "../../utils/logger";
import {
  DEFAULT_SOURCE,
  getProjectConfigPath,
  isLocalSource,
  isPublicCatalogueCheckout,
  loadProjectSourceConfig,
  loadSourceRepoConfig,
  readSourceRepoConfig,
  resolveBranding,
  resolvePrimarySourceEntry,
  NAMED_MARKETPLACE,
  resolveSource,
  validateSourceFormat,
  type MarketplaceCarrier,
} from "./config";
import { ConfigDefaultExportError, ConfigSchemaError } from "./config-loader";
import {
  renderConfigTsWithNamedExportOnly,
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../__tests__/factories/unloadable-config-factories.js";
import { DEFAULT_BRANDING, STANDARD_FILES } from "../../consts";
import { sourceFolderInUse } from "../installation/install-layout";

/** A source named by the config that lives at the home root — i.e. the global one. */
const HOME_CONFIG_SOURCE = "github:home/skills";
/** A source named by a project's own `config.ts`. */
const PROJECT_CONFIG_SOURCE = "github:project-of-its-own/skills";

/** A marketplace a config recorded, the name recorded beside it, and one it did not record. */
const STORED_MARKETPLACE = "github:acme/skills";
const STORED_NAME = "acme";
const OTHER_MARKETPLACE = "github:plain/skills";

/** Marketplaces a config file may name: the cloud metadata service, and its private neighbours. */
const METADATA_ENDPOINT = "http://169.254.169.254/latest";
const PRIVATE_NETWORK_MARKETPLACE = "https://10.0.0.1/team/skills";
const NETWORK_SHARE = "//attacker.example/share";
const PUBLIC_MARKETPLACE = "https://gitlab.company.com/team/skills";
const LOCALHOST_MARKETPLACE = "http://localhost:47322/source.tar.gz";

/** Out of the refusal's own words, so a negative over the message can only find an echo. */
const FIXTURE_PASSWORD = "hunter2";
const FIXTURE_TOKEN = "ghp_fixture0token";

/** A marketplace URL carrying a username and password, and one carrying a token as its username. */
const CREDENTIALED_MARKETPLACE = `https://user:${FIXTURE_PASSWORD}@github.com/acme/skills`;
const TOKEN_MARKETPLACE = `https://${FIXTURE_TOKEN}@github.com/acme/skills`;

/** Credentials and a `..`: the traversal refusal echoes the URL, so it must not be the one raised. */
const CREDENTIALED_TRAVERSAL_MARKETPLACE = `https://user:${FIXTURE_PASSWORD}@github.com/acme/../skills`;

/** The URL parser skips the extra slash, and reads the username and password after it. */
const SLASHED_CREDENTIALED_MARKETPLACE = `https:///user:${FIXTURE_PASSWORD}@github.com/acme/skills`;

/** An `@` inside the username, then inside the password: the URL parser cuts at the last `@`. */
const AT_IN_USERNAME_MARKETPLACE = `https://me@example.com:${FIXTURE_PASSWORD}@github.com/acme/skills`;
const AT_IN_PASSWORD_MARKETPLACE = `https://user:p@${FIXTURE_PASSWORD}@github.com/acme/skills`;

/**
 * Credentials the URL parser reads although the text after `https://` does not start with them: it
 * drops tabs and newlines wherever they are, then skips any run of `/` and `\` after the scheme.
 */
const RESPELLED_CREDENTIALS: [respelling: string, value: string, credential: string][] = [
  ["an extra slash", SLASHED_CREDENTIALED_MARKETPLACE, FIXTURE_PASSWORD],
  ["a backslash", `https://\\user:${FIXTURE_PASSWORD}@github.com/acme/skills`, FIXTURE_PASSWORD],
  [
    "two extra slashes before a token",
    `https:////${FIXTURE_TOKEN}@github.com/acme/skills`,
    FIXTURE_TOKEN,
  ],
  ["a tab", `https://\t/user:${FIXTURE_PASSWORD}@github.com/acme/skills`, FIXTURE_PASSWORD],
  [
    "a line ending",
    `https://\r\n/user:${FIXTURE_PASSWORD}@github.com/acme/skills`,
    FIXTURE_PASSWORD,
  ],
  [
    "an extra slash, before a private address whose refusal echoes the URL",
    `http:///user:${FIXTURE_PASSWORD}@10.0.0.5/repo`,
    FIXTURE_PASSWORD,
  ],
  [
    "an extra slash, before a host the URL parser cannot read",
    `https:///user:${FIXTURE_PASSWORD}@git hub.com/acme/skills`,
    FIXTURE_PASSWORD,
  ],
];

/** A literal: a test reading the product's own constant cannot fail when its value changes. */
const MARKETPLACE_ENV_VAR = "CC_MARKETPLACE";

/** Read by nothing: an exported `CC_SOURCE` must act as if unset. */
const WITHDRAWN_SOURCE_ENV_VAR = "CC_SOURCE";

/** Mirrored like the env var; the examples of a refusal of a named marketplace write it. */
const MARKETPLACE_FLAG = "--marketplace";

/** A second, deliberately different label — proves the messages interpolate what they are given. */
const OTHER_FLAG_LABEL = "--agent-marketplace";
const OTHER_FLAG_CARRIER: MarketplaceCarrier = {
  subject: OTHER_FLAG_LABEL,
  writes: (marketplace) => `${OTHER_FLAG_LABEL} ${marketplace}`,
};

/** Whole word, so `sourcehut:` and paths spelling it do not match. */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/** A literal, like the env var above. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

const UNEVALUATABLE_CONFIG = "invalid typescript content {{";

/** The parser's words: a refusal must carry the cause. */
const UNEVALUATABLE_CONFIG_CAUSE = "Missing semicolon";

/**
 * A literal, like the env var; `e2e/pages/constants.ts` mirrors it as `DOCTOR_TIP_RECREATE_CONFIG`.
 */
const RECREATE_CONFIG_ROUTE = "still works on a config it cannot read";

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-test-");
    delete process.env[MARKETPLACE_ENV_VAR];
    delete process.env[WITHDRAWN_SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    delete process.env[MARKETPLACE_ENV_VAR];
    delete process.env[WITHDRAWN_SOURCE_ENV_VAR];
  });

  describe("DEFAULT_SOURCE", () => {
    it("should be set to the skills repo", () => {
      expect(DEFAULT_SOURCE).toBe("github:agents-inc/skills");
    });
  });

  describe("the primary entry the listing surfaces read", () => {
    it("should keep naming the marketplace it is, with the description it carries", async () => {
      const entry = await resolvePrimarySourceEntry(tempDir);

      expect(
        entry.name,
        "doctor prints this label in front of the ref — a user never sees the config field it now reads like, so the label stays the plain noun",
      ).toBe("marketplace");
      expect(entry.description).toBe("Primary skills marketplace");
      expect(entry.url).toBe(DEFAULT_SOURCE);
    });
  });

  describe("getProjectConfigPath", () => {
    // A literal: it is text on people's disks.
    it("should return path in the folder a new installation is created in", () => {
      const configPath = getProjectConfigPath("/my/project", "claude");
      expect(configPath).toBe(`/my/project/.agents-inc/claude/${STANDARD_FILES.CONFIG_TS}`);
    });
  });

  describe("isLocalSource", () => {
    it("should return true for absolute paths", () => {
      expect(isLocalSource("/home/user/skills")).toBe(true);
      expect(isLocalSource("/var/lib/skills")).toBe(true);
    });

    it("should return true for relative paths starting with .", () => {
      expect(isLocalSource("./skills")).toBe(true);
      expect(isLocalSource("../skills")).toBe(true);
      expect(isLocalSource(".")).toBe(true);
    });

    it("should return false for github: URLs", () => {
      expect(isLocalSource("github:org/repo")).toBe(false);
      expect(isLocalSource("gh:org/repo")).toBe(false);
    });

    it("should return false for gitlab: URLs", () => {
      expect(isLocalSource("gitlab:org/repo")).toBe(false);
    });

    it("should return false for https: URLs", () => {
      expect(isLocalSource("https://github.com/org/repo")).toBe(false);
      expect(isLocalSource("http://github.com/org/repo")).toBe(false);
    });

    it("should return true for paths without protocol prefix", () => {
      expect(isLocalSource("my-skills")).toBe(true);
    });

    it("should throw error for path traversal in bare names", () => {
      expect(() => isLocalSource("my-skills/../../../etc")).toThrow(
        /Path traversal patterns like '\.\.' and '~' are not allowed for security reasons/,
      );
    });

    it("should throw error for home directory expansion in bare names", () => {
      // Bare names with ~ are suspicious since shell expansion doesn't happen
      expect(() => isLocalSource("skills~backup")).toThrow(
        /Path traversal patterns like '\.\.' and '~' are not allowed for security reasons/,
      );
    });

    it("should allow legitimate relative paths with ..", () => {
      expect(isLocalSource("../../../other-project/skills")).toBe(true);
      expect(isLocalSource("../skills")).toBe(true);
    });
  });

  describe("isPublicCatalogueCheckout", () => {
    it("recognises a directory holding the public catalogue's own package", async () => {
      await writeTestPackageJson(tempDir, { name: PUBLIC_CATALOGUE_PACKAGE });

      expect(
        await isPublicCatalogueCheckout(tempDir),
        "the question this one answers is about a DIRECTORY, read off package identity",
      ).toBe(true);
    });

    it("refuses a directory whose package merely resembles the catalogue's", async () => {
      await writeTestPackageJson(tempDir, { name: `${PUBLIC_CATALOGUE_PACKAGE}-extra` });

      expect(await isPublicCatalogueCheckout(tempDir)).toBe(false);
    });

    it("refuses a directory that declares no package at all", async () => {
      expect(await isPublicCatalogueCheckout(tempDir)).toBe(false);
    });
  });

  describe("validateSourceFormat", () => {
    describe("valid sources", () => {
      it("should accept valid github: shorthand", () => {
        expect(() => validateSourceFormat("github:user/repo", NAMED_MARKETPLACE)).not.toThrow();
        expect(() => validateSourceFormat("github:org/my-skills", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should accept valid gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:user/repo", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should accept valid gitlab: shorthand", () => {
        expect(() => validateSourceFormat("gitlab:user/repo", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should accept valid bitbucket: shorthand", () => {
        expect(() => validateSourceFormat("bitbucket:user/repo", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should accept valid sourcehut: shorthand", () => {
        expect(() => validateSourceFormat("sourcehut:user/repo", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should accept valid https:// URLs", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
        expect(() =>
          validateSourceFormat("https://gitlab.company.com/team/skills", NAMED_MARKETPLACE),
        ).not.toThrow();
      });

      it("should accept valid http:// URLs", () => {
        expect(() =>
          validateSourceFormat("http://github.com/user/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
      });

      it("should accept localhost URLs", () => {
        expect(() =>
          validateSourceFormat("https://localhost/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
      });

      it("should accept valid local paths", () => {
        expect(() => validateSourceFormat("./my-skills", NAMED_MARKETPLACE)).not.toThrow();
        expect(() =>
          validateSourceFormat("../other-project/skills", NAMED_MARKETPLACE),
        ).not.toThrow();
        expect(() => validateSourceFormat("/home/user/skills", NAMED_MARKETPLACE)).not.toThrow();
        expect(() => validateSourceFormat("my-skills", NAMED_MARKETPLACE)).not.toThrow();
      });
    });

    describe("invalid remote sources", () => {
      it("should reject incomplete github: shorthand", () => {
        expect(() => validateSourceFormat("github:", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("github:x", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
      });

      it("should reject github: without owner/repo format", () => {
        expect(() => validateSourceFormat("github:just-a-name", NAMED_MARKETPLACE)).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
      });

      it("should reject gh: without owner/repo format", () => {
        expect(() => validateSourceFormat("gh:just-a-name", NAMED_MARKETPLACE)).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete https:// URLs", () => {
        expect(() => validateSourceFormat("https://", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("https://x", NAMED_MARKETPLACE)).toThrow(
          /incomplete URL/,
        );
      });

      it("should reject https:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("https://not-a-host/repo", NAMED_MARKETPLACE)).toThrow(
          /invalid URL/,
        );
      });

      it("should reject http:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("http://", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://x", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://not-a-host/repo", NAMED_MARKETPLACE)).toThrow(
          /invalid URL/,
        );
      });
    });

    describe("invalid local sources", () => {
      it("should reject paths with control characters", () => {
        expect(() => validateSourceFormat("my-skills\x00", NAMED_MARKETPLACE)).toThrow(
          /invalid characters/,
        );
        expect(() => validateSourceFormat("my\x07skills", NAMED_MARKETPLACE)).toThrow(
          /invalid characters/,
        );
      });

      it("should reject UNC paths (Windows network paths)", () => {
        expect(() => validateSourceFormat("//attacker.com/payload", NAMED_MARKETPLACE)).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("\\\\attacker.com\\share", NAMED_MARKETPLACE)).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("//192.168.1.1/share", NAMED_MARKETPLACE)).toThrow(
          /UNC network path/,
        );
      });
    });

    describe("null byte validation", () => {
      it("should reject null bytes in any source type", () => {
        expect(() => validateSourceFormat("github:user/repo\x00", NAMED_MARKETPLACE)).toThrow(
          /null bytes/,
        );
        expect(() =>
          validateSourceFormat("https://github.com/user/repo\x00", NAMED_MARKETPLACE),
        ).toThrow(/null bytes/);
        expect(() => validateSourceFormat("./my-\x00skills", NAMED_MARKETPLACE)).toThrow(
          /null bytes/,
        );
      });
    });

    describe("path traversal in remote sources", () => {
      it("should reject .. in git shorthand paths", () => {
        expect(() => validateSourceFormat("github:user/repo/../other", NAMED_MARKETPLACE)).toThrow(
          /path traversal/,
        );
        expect(() => validateSourceFormat("gh:user/../../etc", NAMED_MARKETPLACE)).toThrow(
          /path traversal/,
        );
      });

      it("should reject .. in HTTP URL paths", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/../admin/repo", NAMED_MARKETPLACE),
        ).toThrow(/path traversal/);
        expect(() =>
          validateSourceFormat("http://gitlab.com/user/repo/../../etc", NAMED_MARKETPLACE),
        ).toThrow(/path traversal/);
      });

      it("should reject .. in git ref query parameters", () => {
        expect(() =>
          validateSourceFormat("github:user/repo?branch=../../etc/passwd", NAMED_MARKETPLACE),
        ).toThrow(/path traversal/);
        expect(() => validateSourceFormat("gh:user/repo#../sensitive", NAMED_MARKETPLACE)).toThrow(
          /path traversal/,
        );
      });

      it("should accept legitimate paths without traversal", () => {
        expect(() => validateSourceFormat("github:user/repo", NAMED_MARKETPLACE)).not.toThrow();
        expect(() =>
          validateSourceFormat("https://github.com/user/repo/tree/main", NAMED_MARKETPLACE),
        ).not.toThrow();
        expect(() => validateSourceFormat("gitlab:team/skills", NAMED_MARKETPLACE)).not.toThrow();
      });
    });

    describe("private IP address validation", () => {
      it("should reject loopback addresses", () => {
        expect(() => validateSourceFormat("https://127.0.0.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("http://127.0.0.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
        expect(() =>
          validateSourceFormat("https://127.255.255.255/repo", NAMED_MARKETPLACE),
        ).toThrow(/private or reserved IP/);
      });

      it("should reject private network addresses (10.x.x.x)", () => {
        expect(() => validateSourceFormat("https://10.0.0.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
        expect(() =>
          validateSourceFormat("https://10.255.255.255/repo", NAMED_MARKETPLACE),
        ).toThrow(/private or reserved IP/);
      });

      it("should reject private network addresses (172.16-31.x.x)", () => {
        expect(() => validateSourceFormat("https://172.16.0.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
        expect(() =>
          validateSourceFormat("https://172.31.255.255/repo", NAMED_MARKETPLACE),
        ).toThrow(/private or reserved IP/);
      });

      it("should reject private network addresses (192.168.x.x)", () => {
        expect(() => validateSourceFormat("https://192.168.0.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://192.168.1.100/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject 0.0.0.0", () => {
        expect(() => validateSourceFormat("https://0.0.0.0/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject link-local addresses (169.254.x.x)", () => {
        expect(() => validateSourceFormat("https://169.254.1.1/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject IPv6 loopback", () => {
        expect(() => validateSourceFormat("https://[::1]/repo", NAMED_MARKETPLACE)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should allow public IP addresses", () => {
        expect(() => validateSourceFormat("https://8.8.8.8/repo", NAMED_MARKETPLACE)).not.toThrow();
        expect(() => validateSourceFormat("https://1.2.3.4/repo", NAMED_MARKETPLACE)).not.toThrow();
      });

      it("should allow non-private 172.x addresses", () => {
        expect(() =>
          validateSourceFormat("https://172.32.0.1/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
        expect(() =>
          validateSourceFormat("https://172.15.0.1/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
      });

      it("should still allow localhost by hostname", () => {
        expect(() =>
          validateSourceFormat("https://localhost/repo", NAMED_MARKETPLACE),
        ).not.toThrow();
      });
    });

    describe("length validation", () => {
      it("should reject sources exceeding max length", () => {
        const longSource = "a".repeat(513);
        expect(() => validateSourceFormat(longSource, NAMED_MARKETPLACE)).toThrow(/too long/);
      });

      it("should accept sources at max length", () => {
        const maxSource = "./a".repeat(170); // 510 chars, under 512
        expect(() => validateSourceFormat(maxSource, NAMED_MARKETPLACE)).not.toThrow();
      });
    });

    describe("error message quality", () => {
      it("should include flag name in error messages", () => {
        expect(() => validateSourceFormat("github:", NAMED_MARKETPLACE)).toThrow(MARKETPLACE_FLAG);
        expect(() => validateSourceFormat("github:", OTHER_FLAG_CARRIER)).toThrow(OTHER_FLAG_LABEL);
      });

      it("should include examples in error messages", () => {
        expect(() => validateSourceFormat("github:", NAMED_MARKETPLACE)).toThrow(/Examples/);
      });
    });

    /** Messages interpolate the carrier's words; the prose around them must not say "source". */
    describe("the prose around the flag name", () => {
      const REFUSALS: [name: string, value: string][] = [
        ["null byte", "github:user/repo\x00"],
        ["over-length", "a".repeat(513)],
        ["incomplete remote", "github:"],
        ["path traversal", "github:user/repo/../other"],
        ["bare git shorthand", "github:just-a-name"],
        ["hostname-less URL", "https://not-a-host/repo"],
        ["private address", "https://192.168.1.100/repo"],
        ["control character", "my\x07skills"],
        ["UNC path", "//attacker.com/payload"],
      ];

      it.each(REFUSALS)("should not say 'source' when refusing a %s", (_name, value) => {
        // Subject guard: `not.toThrow` would also pass for a call that never refused.
        expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(MARKETPLACE_FLAG);
        expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).not.toThrow(WITHDRAWN_NOUN);
      });

      it("should refuse a path traversal in a bare name without naming a source", () => {
        expect(() => isLocalSource("my-skills/../../../etc")).toThrow(/Path traversal patterns/);
        expect(() => isLocalSource("my-skills/../../../etc")).not.toThrow(WITHDRAWN_NOUN);
      });
    });
  });

  describe("loadProjectSourceConfig", () => {
    it("should return null if config file does not exist", async () => {
      const config = await loadProjectSourceConfig(tempDir);
      expect(config).toBeNull();
    });

    it("should load config from the source folder the project is on", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ marketplace: "github:mycompany/skills" }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config).toStrictEqual({ marketplace: "github:mycompany/skills" });
    });

    it("should load marketplace from project config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ marketplaceName: "https://custom-marketplace.io" }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.marketplaceName).toBe("https://custom-marketplace.io");
    });

    /**
     * Hard errors rather than answering `null`, the absent file's answer (pinned two specs above).
     */
    describe("a config that exists and cannot be evaluated", () => {
      it("refuses rather than reporting the file absent", async () => {
        await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        await expect(loadProjectSourceConfig(tempDir)).rejects.toThrow();
      });

      it("names the file it could not read", async () => {
        const configPath = await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        await expect(loadProjectSourceConfig(tempDir)).rejects.toThrow(configPath);
      });

      it("carries the parser's own reason rather than saying only that something failed", async () => {
        await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        await expect(loadProjectSourceConfig(tempDir)).rejects.toThrow(UNEVALUATABLE_CONFIG_CAUSE);
      });

      it("offers the route that actually clears an unreadable config", async () => {
        await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        await expect(loadProjectSourceConfig(tempDir)).rejects.toThrow(RECREATE_CONFIG_ROUTE);
      });

      it("refuses without calling it a source config", async () => {
        await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        await expect(loadProjectSourceConfig(tempDir)).rejects.not.toThrow(WITHDRAWN_NOUN);
      });
    });
  });

  describe("resolveSource", () => {
    let savedHome: string;
    let homeDir: string;

    beforeEach(async () => {
      savedHome = process.env.HOME ?? "";
      // HOME inside the temp dir and distinct from the project, so the two rungs can be told apart.
      homeDir = path.join(tempDir, "home");
      await mkdir(homeDir, { recursive: true });
      process.env.HOME = homeDir;
    });

    afterEach(() => {
      process.env.HOME = savedHome;
    });

    it("should return flag value with highest priority", async () => {
      process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/repo",
        projectDir: tempDir,
      });

      expect(result.source).toBe("github:flag/repo");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should return env value when no flag is provided", async () => {
      process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";

      const result = await resolveSource({ caller: "init", projectDir: tempDir });

      expect(result.source).toBe("github:env/repo");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should return project config when no flag or env", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

      const result = await resolveSource({ caller: "stored", projectDir: tempDir });

      expect(result.source).toBe("github:project/repo");
      expect(result.sourceOrigin).toBe("project");
    });

    it("should return default when no config is set", async () => {
      const result = await resolveSource({ caller: "stored", projectDir: tempDir });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });

    /** An unevaluatable config must not read as absence (the default marketplace), either rung. */
    describe("a config that exists and cannot be evaluated", () => {
      it("refuses rather than walking past the project rung to the default marketplace", async () => {
        await writeRawTestConfig(tempDir, UNEVALUATABLE_CONFIG);

        const resolution = resolveSource({ caller: "stored", projectDir: tempDir });

        await expect(resolution).rejects.toThrow(RECREATE_CONFIG_ROUTE);
      });

      it("refuses rather than walking past the global rung to the default marketplace", async () => {
        await writeRawTestConfig(homeDir, UNEVALUATABLE_CONFIG);

        const resolution = resolveSource({ caller: "stored", projectDir: tempDir });

        await expect(resolution).rejects.toThrow(RECREATE_CONFIG_ROUTE);
      });

      it("still names the marketplace an intact project config carries", async () => {
        await writeRawTestConfig(homeDir, UNEVALUATABLE_CONFIG);
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: PROJECT_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(
          result.source,
          "the project rung answered first, so the global config was never read",
        ).toBe(PROJECT_CONFIG_SOURCE);
      });
    });

    it("when projectDir is undefined and no flag provided, should fall back to default source", async () => {
      const result = await resolveSource({ caller: "stored" });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });

    it("should prioritize flag over all other sources", async () => {
      process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/repo",
        projectDir: tempDir,
      });

      expect(result.source).toBe("github:flag/repo");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should prioritize env over project config", async () => {
      process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

      const result = await resolveSource({ caller: "init", projectDir: tempDir });

      expect(result.source).toBe("github:env/repo");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should throw error for empty source flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "", projectDir: tempDir }),
      ).rejects.toThrow(/The marketplace cannot be empty/);
    });

    it("should throw error for whitespace-only source flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "   ", projectDir: tempDir }),
      ).rejects.toThrow(/The marketplace cannot be empty/);
    });

    /** The label is origin-neutral, so it can say neither `--marketplace` nor "source". */
    it("should refuse an empty named marketplace without saying 'source'", async () => {
      await expect(
        resolveSource({ caller: "stored", flag: "", projectDir: tempDir }),
      ).rejects.toThrow(/cannot be empty/);
      await expect(
        resolveSource({ caller: "stored", flag: "", projectDir: tempDir }),
      ).rejects.not.toThrow(WITHDRAWN_NOUN);
    });

    it("should throw error for incomplete github: URL in flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "github:", projectDir: tempDir }),
      ).rejects.toThrow(/incomplete URL/);
    });

    it("should throw error for github: without owner/repo in flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "github:just-a-name", projectDir: tempDir }),
      ).rejects.toThrow(/owner\/repo format/);
    });

    it("should throw error for invalid https:// URL in flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "https://", projectDir: tempDir }),
      ).rejects.toThrow(/incomplete URL/);
    });

    describe("the env var is the init caller's rung alone", () => {
      it("should ignore the env var for a stored caller and read the project config", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source, "a stored caller reads what the install recorded").toBe(
          "github:project/repo",
        );
        expect(result.sourceOrigin).toBe("project");
      });

      it("should ignore the env var for a stored caller with nothing stored", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source, "an ambient env var must not stand in for a stored source").toBe(
          DEFAULT_SOURCE,
        );
        expect(result.sourceOrigin).toBe("default");
      });
    });

    /** A shared id naming no marketplace names the public catalogue, not another install's. */
    describe("the stored rungs are the stored caller's alone", () => {
      it("should pass over the project config's marketplace for an init caller", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(result.sourceOrigin).toBe("default");
      });

      it("should pass over the global config's marketplace for an init caller", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: "github:global/repo" }));

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(result.sourceOrigin).toBe("default");
      });
    });

    /** Not aliased, warned about or read: `CC_SOURCE` chooses nothing. */
    describe("the environment rung names the marketplace", () => {
      let warnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("should read the marketplace-named env var for an init caller", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:env/repo");
        expect(result.sourceOrigin).toBe("env");
      });

      it("should not read the withdrawn env var", async () => {
        process.env[WITHDRAWN_SOURCE_ENV_VAR] = "github:withdrawn/repo";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source, "the withdrawn spelling is aliased to nothing").toBe(DEFAULT_SOURCE);
        expect(result.sourceOrigin).toBe("default");
      });

      it("should let the marketplace-named env var win over the withdrawn one", async () => {
        process.env[WITHDRAWN_SOURCE_ENV_VAR] = "github:withdrawn/repo";
        process.env[MARKETPLACE_ENV_VAR] = "github:env/repo";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:env/repo");
      });

      it("should not warn about the withdrawn env var", async () => {
        process.env[WITHDRAWN_SOURCE_ENV_VAR] = "github:";

        await resolveSource({ caller: "init", projectDir: tempDir });

        expect(
          warnSpy,
          "an unusable value in a variable nothing reads is not this run's problem",
        ).not.toHaveBeenCalled();
      });

      it("should name the marketplace-named env var in the warning it does raise", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:";

        await resolveSource({ caller: "init", projectDir: tempDir });

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(MARKETPLACE_ENV_VAR));
        expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining(WITHDRAWN_SOURCE_ENV_VAR));
      });

      it("should not fall back to a 'source' when the env var is unusable", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "   ";

        await resolveSource({ caller: "init", projectDir: tempDir });

        expect(warnSpy).toHaveBeenCalledWith(expect.not.stringMatching(WITHDRAWN_NOUN));
      });
    });

    describe("env var validation", () => {
      let warnSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it("should accept valid env var source", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:org/repo";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:org/repo");
        expect(result.sourceOrigin).toBe("env");
      });

      it("should warn and fall back to default for invalid env var (incomplete URL)", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back past the project config to the default for invalid env var", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:just-a-name";

        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back for whitespace-only env var", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "   ";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("empty"));
      });

      it("should warn and fall back for malformed URL in env var", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "https://";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back for UNC path in env var", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "//attacker.com/payload";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should trim valid env var values", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "  github:org/repo  ";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:org/repo");
        expect(result.sourceOrigin).toBe("env");
      });
    });

    /** Raised, as for a named one: falling through would install from a marketplace nobody named. */
    describe("a marketplace a config names, checked as one this run names", () => {
      it("refuses a project config's private address, naming the file it is in", async () => {
        const configPath = await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: METADATA_ENDPOINT }),
        );

        await expect(resolveSource({ caller: "stored", projectDir: tempDir })).rejects.toThrow(
          `The marketplace in ${configPath} points to a private or reserved IP address: "${METADATA_ENDPOINT}"`,
        );
      });

      it("refuses the global config's private address", async () => {
        const configPath = await writeTestTsConfig(
          homeDir,
          buildSourceConfig({ marketplace: PRIVATE_NETWORK_MARKETPLACE }),
        );

        await expect(resolveSource({ caller: "stored", projectDir: tempDir })).rejects.toThrow(
          `The marketplace in ${configPath} points to a private or reserved IP address: "${PRIVATE_NETWORK_MARKETPLACE}"`,
        );
      });

      it("refuses a project config's URL carrying a username or password, naming the file it is in", async () => {
        const configPath = await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: CREDENTIALED_MARKETPLACE }),
        );

        await expect(resolveSource({ caller: "stored", projectDir: tempDir })).rejects.toThrow(
          expect.objectContaining({
            message: `The marketplace in ${configPath} carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  marketplace: 'https://github.com/user/repo'\n  marketplace: 'https://gitlab.company.com/team/skills'`,
          }),
        );
      });

      it("refuses a network share a config names", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: NETWORK_SHARE }));

        await expect(resolveSource({ caller: "stored", projectDir: tempDir })).rejects.toThrow(
          `contains a UNC network path: "${NETWORK_SHARE}"`,
        );
      });

      it("still names a public address a config carries", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: PUBLIC_MARKETPLACE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe(PUBLIC_MARKETPLACE);
        expect(result.sourceOrigin).toBe("project");
      });

      it("still names a marketplace a config serves from localhost", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: LOCALHOST_MARKETPLACE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe(LOCALHOST_MARKETPLACE);
        expect(result.sourceOrigin).toBe("global");
      });

      it("takes a usable named marketplace over a config naming a private address it then never reaches", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: METADATA_ENDPOINT }));

        const result = await resolveSource({
          caller: "init",
          flag: PUBLIC_MARKETPLACE,
          projectDir: tempDir,
        });

        expect(result.source).toBe(PUBLIC_MARKETPLACE);
        expect(result.sourceOrigin).toBe("flag");
      });
    });

    /** The first line names whoever carried the value; the examples write it the way they do. */
    describe("the refusal's examples, written as the value's origin writes a marketplace", () => {
      const consoleSpies = silenceConsole(["warn"]);

      it("writes a marketplace this run names as the flag", async () => {
        await expect(
          resolveSource({ caller: "init", flag: METADATA_ENDPOINT, projectDir: tempDir }),
        ).rejects.toThrow(
          expect.objectContaining({
            message: `The marketplace points to a private or reserved IP address: "${METADATA_ENDPOINT}"\n\nMarketplace URLs must not target private network addresses.\nUse a public hostname instead.\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills`,
          }),
        );
      });

      it("writes a marketplace a config names as the config's own line", async () => {
        const configPath = await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: METADATA_ENDPOINT }),
        );

        await expect(resolveSource({ caller: "stored", projectDir: tempDir })).rejects.toThrow(
          expect.objectContaining({
            message: `The marketplace in ${configPath} points to a private or reserved IP address: "${METADATA_ENDPOINT}"\n\nMarketplace URLs must not target private network addresses.\nUse a public hostname instead.\nExamples:\n  marketplace: 'https://github.com/user/repo'\n  marketplace: 'https://gitlab.company.com/team/skills'`,
          }),
        );
      });

      it("writes the environment's marketplace as the assignment that sets it", async () => {
        process.env[MARKETPLACE_ENV_VAR] = METADATA_ENDPOINT;

        await resolveSource({ caller: "init", projectDir: tempDir });

        expect(consoleSpies.warn).toHaveBeenCalledWith(
          `  Warning: CC_MARKETPLACE has an invalid value — ignoring and falling back to the next rung.\nCC_MARKETPLACE points to a private or reserved IP address: "${METADATA_ENDPOINT}"\n\nMarketplace URLs must not target private network addresses.\nUse a public hostname instead.\nExamples:\n  CC_MARKETPLACE=https://github.com/user/repo\n  CC_MARKETPLACE=https://gitlab.company.com/team/skills`,
        );
      });
    });

    describe("marketplace resolution", () => {
      it("should return marketplace from project config", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplaceName: "https://my-company.com/plugins" }),
        );

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.marketplace).toBe("https://my-company.com/plugins");
      });

      it("should return marketplace alongside source from project config", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({
            marketplace: "github:mycompany/skills",
            marketplaceName: "https://enterprise.example.com/plugins",
          }),
        );

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe("github:mycompany/skills");
        expect(result.sourceOrigin).toBe("project");
        expect(result.marketplace).toBe("https://enterprise.example.com/plugins");
      });

      it("should return undefined marketplace when not configured", async () => {
        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.marketplace).toBeUndefined();
      });

      /**
       * The stored name labels the marketplace recorded beside it; the case below is the control.
       */
      it("does not label a marketplace this run names with the name stored beside another", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: STORED_MARKETPLACE, marketplaceName: STORED_NAME }),
        );

        const result = await resolveSource({
          caller: "init",
          flag: OTHER_MARKETPLACE,
          projectDir: tempDir,
        });

        expect(result.source).toBe(OTHER_MARKETPLACE);
        expect(
          result.marketplace,
          "the stored name belongs to the marketplace it was recorded beside, and to no other",
        ).toBeUndefined();
      });

      it("keeps the stored name for the stored marketplace named back", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: STORED_MARKETPLACE, marketplaceName: STORED_NAME }),
        );

        const result = await resolveSource({
          caller: "init",
          flag: STORED_MARKETPLACE,
          projectDir: tempDir,
        });

        expect(result.source).toBe(STORED_MARKETPLACE);
        expect(result.marketplace).toBe(STORED_NAME);
      });
    });

    /** Read without setting the run's provider, so one run can ask of each installation. */
    describe("a project holding a Claude and a Codex installation", () => {
      beforeEach(async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: STORED_MARKETPLACE }));
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: OTHER_MARKETPLACE }),
          sourceFolderInUse(tempDir, "codex").relName,
        );
      });

      it("reads the marketplace the named installation's config stores", async () => {
        const result = await resolveSource({
          caller: "stored",
          projectDir: tempDir,
          provider: "codex",
        });

        expect(result).toStrictEqual({ source: OTHER_MARKETPLACE, sourceOrigin: "project" });
      });

      it("reads the folder in use where the request names no installation", async () => {
        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result).toStrictEqual({ source: STORED_MARKETPLACE, sourceOrigin: "project" });
      });
    });

    describe("the config at the home root is the global one", () => {
      it("should label a source read at the home root as global", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: HOME_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: homeDir });

        expect(result.source).toBe(HOME_CONFIG_SOURCE);
        expect(
          result.sourceOrigin,
          "the home root's own config.ts is the global config — running from the home root does not make it a project's",
        ).toBe("global");
      });

      it("should label a source read from a project's own config as project", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: PROJECT_CONFIG_SOURCE }));
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: HOME_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe(PROJECT_CONFIG_SOURCE);
        expect(result.sourceOrigin).toBe("project");
      });

      it("should label a project config carrying only global-scoped entries as project", async () => {
        await writeTestTsConfig(
          tempDir,
          buildProjectConfig({
            skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
            marketplace: PROJECT_CONFIG_SOURCE,
          }),
        );

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(
          result.sourceOrigin,
          "the origin names the file the source was read from, not the scope the entries in it carry",
        ).toBe("project");
      });

      it("should fall back to the global config from a project that has none", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: HOME_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe(HOME_CONFIG_SOURCE);
        expect(result.sourceOrigin).toBe("global");
      });
    });

    describe("a project config that declares nothing, under a global config naming a marketplace", () => {
      beforeEach(async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: HOME_CONFIG_SOURCE }));
      });

      it("reads the marketplace the same project reads with no config: the global one", async () => {
        const withoutConfig = await resolveSource({ caller: "stored", projectDir: tempDir });
        await writeTestTsConfig(tempDir, buildProjectConfig({ skills: [], agents: [] }));

        const declaringNothing = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(withoutConfig, "subject guard: with no config, the global one").toStrictEqual({
          source: HOME_CONFIG_SOURCE,
          sourceOrigin: "global",
        });
        expect(declaringNothing).toStrictEqual(withoutConfig);
      });

      it("is the global one for the listing surfaces' primary entry too", async () => {
        await writeTestTsConfig(tempDir, buildProjectConfig({ skills: [], agents: [] }));

        const entry = await resolvePrimarySourceEntry(tempDir);

        expect(entry.url).toBe(HOME_CONFIG_SOURCE);
      });

      it("is not the global one for a project config declaring a skill and naming no marketplace", async () => {
        await writeTestTsConfig(tempDir, buildProjectConfig());

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result).toStrictEqual({ source: DEFAULT_SOURCE, sourceOrigin: "default" });
      });
    });

    describe("the verbose line for a named source", () => {
      const consoleSpies = silenceConsole(["log"]);
      let namedSource: string;

      beforeEach(() => {
        namedSource = path.join(tempDir, "source-repo");
        setVerbose(true);
      });

      afterEach(() => {
        setVerbose(false);
      });

      it("should not claim the marketplace flag for a caller that has none", async () => {
        // `doctor` points the loader at a path; it is a stored caller.
        await resolveSource({ caller: "stored", flag: namedSource, projectDir: tempDir });

        expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining(namedSource));
        expect(
          consoleSpies.log,
          "no marketplace flag was passed to this run, so the line must not say one was",
        ).not.toHaveBeenCalledWith(expect.stringContaining(MARKETPLACE_FLAG));
      });

      it("should still name the marketplace init passed as its flag", async () => {
        await resolveSource({ caller: "init", flag: namedSource, projectDir: tempDir });

        expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining(namedSource));
      });
    });
  });

  describe("loadProjectSourceConfig with path overrides", () => {
    it("should load skillsDir from project config", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ skillsDir: "lib/skills" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.skillsDir).toBe("lib/skills");
    });

    it("should load stacksFile from project config", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ stacksFile: "data/stacks.ts" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.stacksFile).toBe("data/stacks.ts");
    });

    it("should load categoriesFile from project config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ categoriesFile: "data/categories.yaml" }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.categoriesFile).toBe("data/categories.yaml");
    });

    it("should load rulesFile from project config", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ rulesFile: "data/rules.yaml" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.rulesFile).toBe("data/rules.yaml");
    });

    it("should return undefined for missing path fields (defaults applied by consumer)", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:myorg/skills" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.skillsDir).toBeUndefined();
      expect(config?.stacksFile).toBeUndefined();
      expect(config?.categoriesFile).toBeUndefined();
      expect(config?.rulesFile).toBeUndefined();
    });

    it("should load all path fields together", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          marketplace: "github:myorg/skills",
          skillsDir: "lib/skills",
          // A key nothing reads: pins that a config naming it still loads.
          agentsDir: "lib/agents",
          stacksFile: "data/stacks.ts",
          categoriesFile: "data/categories.yaml",
          rulesFile: "data/rules.yaml",
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.marketplace).toBe("github:myorg/skills");
      expect(config?.skillsDir).toBe("lib/skills");
      expect(config?.stacksFile).toBe("data/stacks.ts");
      expect(config?.categoriesFile).toBe("data/categories.yaml");
      expect(config?.rulesFile).toBe("data/rules.yaml");
    });
  });

  describe("loadProjectSourceConfig, given a config still naming agentsSource", () => {
    it("should load all config fields together", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          marketplace: "github:myorg/skills",
          marketplaceName: "https://market.example.com",
          agentsSource: "https://agents.example.com",
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.marketplace).toBe("github:myorg/skills");
      expect(config?.marketplaceName).toBe("https://market.example.com");
    });
  });

  describe("loadProjectSourceConfig with branding", () => {
    it("should load branding name from project config", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ branding: { name: "Acme Dev Tools" } }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding).toStrictEqual({ name: "Acme Dev Tools" });
    });

    it("should return undefined branding when not configured", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:myorg/skills" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding).toBeUndefined();
    });
  });

  describe("resolveBranding", () => {
    // `resolveBranding` falls through to the global config via `os.homedir()`, which bun fixes at
    // startup, so both HOME and the homedir are stubbed.
    let savedHome: string;
    let homeDir: string;

    beforeEach(async () => {
      savedHome = process.env.HOME ?? "";
      homeDir = path.join(tempDir, "branding-home");
      await mkdir(homeDir, { recursive: true });
      process.env.HOME = homeDir;
      vi.spyOn(os, "homedir").mockReturnValue(homeDir);
    });

    afterEach(() => {
      process.env.HOME = savedHome;
      vi.mocked(os.homedir).mockRestore();
    });

    it("should return default branding when no config exists", async () => {
      const branding = await resolveBranding(tempDir);
      expect(branding).toStrictEqual({ name: DEFAULT_BRANDING.NAME });
    });

    it("should return default branding when projectDir is undefined", async () => {
      const branding = await resolveBranding(undefined);
      expect(branding).toStrictEqual({ name: DEFAULT_BRANDING.NAME });
    });

    it("should return custom branding when configured", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ branding: { name: "Acme Dev Tools" } }));

      const branding = await resolveBranding(tempDir);
      expect(branding).toStrictEqual({ name: "Acme Dev Tools" });
    });

    it("should return default branding when config has no branding section anywhere", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:myorg/skills" }));

      const branding = await resolveBranding(tempDir);
      expect(branding).toStrictEqual({ name: DEFAULT_BRANDING.NAME });
    });

    /** Branding falls back per field: a project config naming none still shows the global one. */
    describe("global branding reaches a project that does not override it", () => {
      const GLOBAL_NAME = "Globally Branded";

      beforeEach(async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ branding: { name: GLOBAL_NAME } }));
      });

      it("shows global branding through a project config that carries none", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:myorg/skills" }));

        const branding = await resolveBranding(tempDir);

        expect(branding).toStrictEqual({ name: GLOBAL_NAME });
      });

      /** A project that DOES name one takes precedence over the global scope. */
      it("lets a project override the global name", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ branding: { name: "This Project" } }));

        const branding = await resolveBranding(tempDir);

        expect(branding).toStrictEqual({ name: "This Project" });
      });

      /** The control: with no project config at all, the global one was always reached. */
      it("still reaches global branding when the project has no config at all", async () => {
        const branding = await resolveBranding(tempDir);

        expect(branding).toStrictEqual({ name: GLOBAL_NAME });
      });

      /** And the shipped default is still the floor when neither scope names it. */
      it("falls through both scopes to the shipped default", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ marketplace: "github:home/skills" }));
        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:myorg/skills" }));

        const branding = await resolveBranding(tempDir);

        expect(branding).toStrictEqual({ name: DEFAULT_BRANDING.NAME });
      });
    });
  });
});

/** Each refusal of a marketplace this run names, word for word; its examples write the flag. */
const SOURCE_REFUSALS: [name: string, value: string, message: string][] = [
  [
    "a null byte",
    "github:user/repo\x00",
    "The marketplace contains invalid characters.\n\nMarketplace values must not contain null bytes.\nExamples:\n  --marketplace ./my-skills\n  --marketplace github:user/repo",
  ],
  [
    "an over-long value",
    "a".repeat(513),
    "The marketplace value is too long (513 characters, max 512).\n\nProvide a shorter marketplace path or URL.\nExamples:\n  --marketplace ./my-skills\n  --marketplace github:user/repo",
  ],
  [
    "an incomplete remote",
    "github:x",
    'The marketplace has an incomplete URL: "github:x"\n\nA repository path is required after the protocol prefix.\nExamples:\n  --marketplace github:user/repo\n  --marketplace https://github.com/user/repo',
  ],
  [
    "a path traversal",
    "github:user/repo/../other",
    "The marketplace contains path traversal in URL: \"github:user/repo/../other\"\n\nRemote marketplace URLs must not contain '..' sequences.\nExamples:\n  --marketplace github:user/repo\n  --marketplace https://github.com/user/repo",
  ],
  [
    "a URL with no hostname",
    "https://not-a-host/repo",
    'The marketplace has an invalid URL: "https://not-a-host/repo"\n\nThe URL must include a valid hostname.\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a private address",
    "https://192.168.1.100/repo",
    'The marketplace points to a private or reserved IP address: "https://192.168.1.100/repo"\n\nMarketplace URLs must not target private network addresses.\nUse a public hostname instead.\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a git shorthand with no owner",
    "github:just-a-name",
    'The marketplace has an invalid repository reference: "github:just-a-name"\n\nGit shorthand marketplaces require an owner/repo format.\nExamples:\n  --marketplace github:user/repo\n  --marketplace gh:organization/skills',
  ],
  [
    "a control character",
    "my\x07skills",
    'The marketplace contains invalid characters: "myskills"\n\nMarketplace values must not contain line breaks or control characters.\nExamples:\n  --marketplace ./my-skills\n  --marketplace /home/user/skills',
  ],
  [
    "a path a link wrote a terminal control and a line break into, echoing it inert on one line",
    "./my-skills\u001B]0;MK\u0007\nNothing is removed.",
    'The marketplace contains invalid characters: "./my-skills Nothing is removed."\n\nMarketplace values must not contain line breaks or control characters.\nExamples:\n  --marketplace ./my-skills\n  --marketplace /home/user/skills',
  ],
  [
    "a path holding a line break alone",
    "./my-skills\nNothing is removed.",
    'The marketplace contains invalid characters: "./my-skills Nothing is removed."\n\nMarketplace values must not contain line breaks or control characters.\nExamples:\n  --marketplace ./my-skills\n  --marketplace /home/user/skills',
  ],
  [
    "a URL holding a line break, which the URL parser would drop",
    "https://github.com/acme/skills\nNothing is removed.",
    'The marketplace contains invalid characters: "https://github.com/acme/skills Nothing is removed."\n\nMarketplace values must not contain line breaks or control characters.\nExamples:\n  --marketplace github:user/repo\n  --marketplace https://github.com/user/repo',
  ],
  [
    "a git shorthand holding a terminal control",
    "github:acme/skills\u001B[2J",
    'The marketplace contains invalid characters: "github:acme/skills"\n\nMarketplace values must not contain line breaks or control characters.\nExamples:\n  --marketplace github:user/repo\n  --marketplace https://github.com/user/repo',
  ],
  [
    "a UNC path",
    "//attacker.com/payload",
    'The marketplace contains a UNC network path: "//attacker.com/payload"\n\nNetwork paths (\\\\server\\share or //server/share) are not allowed for security reasons.\nUse a local directory path or a remote URL instead.\nExamples:\n  --marketplace ./my-skills\n  --marketplace /home/user/skills\n  --marketplace https://github.com/user/repo',
  ],
  [
    "a username and password in the URL",
    CREDENTIALED_MARKETPLACE,
    'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a username alone in the URL, as a pasted token sits",
    TOKEN_MARKETPLACE,
    'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a username and password after an extra slash, shown as the URL parser reads the URL",
    SLASHED_CREDENTIALED_MARKETPLACE,
    'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a username holding an @, masked up to the last @ before the host",
    AT_IN_USERNAME_MARKETPLACE,
    'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
  [
    "a password holding an @, masked up to the last @ before the host",
    AT_IN_PASSWORD_MARKETPLACE,
    'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
  ],
];

describe("the marketplace value checks, at their edges", () => {
  it.each(SOURCE_REFUSALS)("refuses %s in these words", async (_name, value, message) => {
    await expect(resolveSource({ caller: "init", flag: value })).rejects.toThrow(
      expect.objectContaining({ message }),
    );
  });

  it.each([
    [CREDENTIALED_MARKETPLACE, FIXTURE_PASSWORD],
    [TOKEN_MARKETPLACE, FIXTURE_TOKEN],
    [CREDENTIALED_TRAVERSAL_MARKETPLACE, FIXTURE_PASSWORD],
    [AT_IN_USERNAME_MARKETPLACE, FIXTURE_PASSWORD],
    [AT_IN_PASSWORD_MARKETPLACE, FIXTURE_PASSWORD],
  ])("refuses %s without repeating the credential it carries", async (value, credential) => {
    const refusal = resolveSource({ caller: "init", flag: value });

    await expect(refusal).rejects.toThrow("carries a username or password in its URL");
    await expect(refusal).rejects.not.toThrow(credential);
  });

  it.each(RESPELLED_CREDENTIALS)(
    "refuses a URL carrying credentials behind %s, without repeating them",
    async (_respelling, value, credential) => {
      const refusal = resolveSource({ caller: "init", flag: value });

      await expect(refusal).rejects.toThrow("carries a username or password in its URL");
      await expect(refusal).rejects.not.toThrow(credential);
    },
  );

  it("refuses a URL ending right after a token, showing no more of it than the mask", async () => {
    await expect(
      resolveSource({ caller: "init", flag: `https://${FIXTURE_TOKEN}@` }),
    ).rejects.toThrow(
      expect.objectContaining({
        message:
          'The marketplace carries a username or password in its URL: "https://***@"\n\nCredentials in a marketplace URL end up in config files, shared configurations and logs.\nFor a private repository, set the GIGET_AUTH environment variable instead:\n  export GIGET_AUTH=ghp_your_github_token\nExamples:\n  --marketplace https://github.com/user/repo\n  --marketplace https://gitlab.company.com/team/skills',
      }),
    );
  });

  it("reads only an http(s) URL for credentials: a shorthand with an @ before its first slash passes", () => {
    expect(() => validateSourceFormat("github:user@org/repo", NAMED_MARKETPLACE)).not.toThrow();
  });

  it("accepts a value of exactly the maximum length", () => {
    expect(() => validateSourceFormat(`./${"a".repeat(510)}`, NAMED_MARKETPLACE)).not.toThrow();
  });

  it("accepts the shortest repository path after a protocol, and refuses one shorter", () => {
    expect(() => validateSourceFormat("github:a/b", NAMED_MARKETPLACE)).not.toThrow();
    expect(() => validateSourceFormat("github:ab", NAMED_MARKETPLACE)).toThrow(/incomplete URL/);
  });

  it("measures the repository path without the spaces around it", () => {
    expect(() => validateSourceFormat("github:   ab  ", NAMED_MARKETPLACE)).toThrow(
      /incomplete URL/,
    );
  });

  it.each(["https://:8080/repo", "https:///repo", "https://[::1/repo", "https://host]/repo"])(
    "refuses %s, whose hostname is empty or half-bracketed",
    (value) => {
      expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(/invalid URL/);
    },
  );

  it.each([
    "https://[::1]:8080/repo",
    "https://[fe80::1]:443/repo",
    "https://[::ffff:10.0.0.1]:80/repo",
  ])("refuses a private IPv6 address with a port as it refuses one without: %s", (value) => {
    expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(/private or reserved IP/);
  });

  it("accepts a public IPv6 address with a port", () => {
    expect(() =>
      validateSourceFormat("https://[2001:db8::1]:8443/repo", NAMED_MARKETPLACE),
    ).not.toThrow();
  });

  /** Written out in full, with no `::`, and ending in a one-digit group. */
  it("accepts a public IPv6 address that has no zeros to elide", () => {
    expect(() =>
      validateSourceFormat("https://[2606:4700:4700:1111:0:1:2:3]/repo", NAMED_MARKETPLACE),
    ).not.toThrow();
  });

  it("treats an absolute path that climbs a level as local, without the traversal refusal", () => {
    expect(isLocalSource("/srv/skills/../shared")).toBe(true);
  });
});

describe("the marketplace a run names, checked once trimmed", () => {
  it("refuses a UNC path behind leading spaces", async () => {
    await expect(resolveSource({ caller: "init", flag: "  //attacker.com/share" })).rejects.toThrow(
      /UNC network path/,
    );
  });

  it("refuses an empty marketplace in these words", async () => {
    await expect(resolveSource({ caller: "init", flag: "" })).rejects.toThrow(
      expect.objectContaining({
        message:
          "The marketplace cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')",
      }),
    );
  });
});

describe("what the config readers say and raise", () => {
  const consoleSpies = silenceConsole(["log"]);
  let tempDir: string;
  let homeDir: string;
  let savedHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-readers-");
    homeDir = path.join(tempDir, "home");
    await mkdir(homeDir, { recursive: true });
    savedHome = process.env.HOME ?? "";
    process.env.HOME = homeDir;
    vi.spyOn(os, "homedir").mockReturnValue(homeDir);
    delete process.env[MARKETPLACE_ENV_VAR];
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    process.env.HOME = savedHome;
    vi.mocked(os.homedir).mockRestore();
    delete process.env[MARKETPLACE_ENV_VAR];
    await cleanupTempDir(tempDir);
  });

  it("says a project has no config, naming it as the project's", async () => {
    await loadProjectSourceConfig(tempDir);

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Project config not found at ${getProjectConfigPath(tempDir, "claude")}`,
    );
  });

  it("says the home directory has no config, naming it as the global one", async () => {
    await resolveSource({ caller: "stored" });

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Global config not found at ${getProjectConfigPath(homeDir, "claude")}`,
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(`  Using default marketplace: ${DEFAULT_SOURCE}`);
  });

  it("says which config it loaded and which marketplace it read from it", async () => {
    await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: STORED_MARKETPLACE }));

    await resolveSource({ caller: "stored", projectDir: tempDir });

    expect(consoleSpies.log).toHaveBeenCalledWith(`  Loaded project config from ${tempDir}`);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Marketplace from project config: ${STORED_MARKETPLACE}`,
    );
  });

  it("says the marketplace came from the environment", async () => {
    process.env[MARKETPLACE_ENV_VAR] = OTHER_MARKETPLACE;

    await resolveSource({ caller: "init", projectDir: tempDir });

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Marketplace from CC_MARKETPLACE env var: ${OTHER_MARKETPLACE}`,
    );
  });

  it("answers null for a marketplace repository with no config, and says it has none", async () => {
    const config = await loadSourceRepoConfig(tempDir);

    expect(config).toBeNull();
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Source config not found at ${path.join(tempDir, ".agents-inc", STANDARD_FILES.CONFIG_TS)}`,
    );
  });

  it("tells a marketplace config that declares nothing apart from an absent one", async () => {
    expect(await readSourceRepoConfig(tempDir)).toStrictEqual({ kind: "absent" });

    const configPath = await writeRawTestConfig(tempDir, "", ".agents-inc");

    expect(await readSourceRepoConfig(tempDir)).toStrictEqual({
      kind: "declares-nothing",
      configPath,
    });
    expect(
      await loadSourceRepoConfig(tempDir),
      "a reader of the layout reads it as absent",
    ).toBeNull();
  });

  it("refuses a config that exports nothing as having no valid default export", async () => {
    await writeRawTestConfig(tempDir, "export default {};\n");

    await expect(loadProjectSourceConfig(tempDir)).rejects.toThrow(
      "the file has no valid default export",
    );
  });

  it("keeps the loader's own failure as the cause of an unreadable installation config", async () => {
    await writeRawTestConfig(tempDir, renderUnparseableConfigTs());

    await expect(loadProjectSourceConfig(tempDir)).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("Failed to load config from"),
      }),
    });
  });

  it("keeps the loader's own failure as the cause of an unreadable marketplace config", async () => {
    await writeRawTestConfig(tempDir, renderUnparseableConfigTs(), ".agents-inc");

    await expect(loadSourceRepoConfig(tempDir)).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining("Failed to load config from"),
      }),
    });
  });

  it("passes a schema refusal on as it is, since it already names the field", async () => {
    await writeRawTestConfig(tempDir, renderSchemaViolatingConfigTs());

    await expect(loadProjectSourceConfig(tempDir)).rejects.toBeInstanceOf(ConfigSchemaError);
  });

  it("passes a missing default export on as it is, since it already names the export", async () => {
    await writeRawTestConfig(tempDir, renderConfigTsWithNamedExportOnly({ name: "named-only" }));

    await expect(loadProjectSourceConfig(tempDir)).rejects.toBeInstanceOf(ConfigDefaultExportError);
  });
});

describe("the private-address refusal, octet by octet", () => {
  it.each([
    "127.10.20.30",
    "10.20.30.40",
    "172.16.20.30",
    "172.25.20.30",
    "172.31.20.30",
    "192.168.20.30",
    "169.254.20.30",
    "[::ffff:127.10.20.30]",
    "[::ffff:10.20.30.40]",
    "[::ffff:192.168.20.30]",
    "[fd12:3456::1]",
    "[fe80::abcd]",
  ])("refuses https://%s/repo, every octet more than one digit long", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).toThrow(
      /private or reserved IP/,
    );
  });

  it.each(["172.15.20.30", "172.32.20.30", "10.20.30.40.example.com", "110.20.30.40"])(
    "accepts https://%s/repo, which lies outside every private range",
    (host) => {
      expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).not.toThrow();
    },
  );

  it.each([
    "127.255.255.255",
    "10.255.255.255",
    "172.31.255.255",
    "192.168.255.255",
    "169.254.255.255",
    "[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]",
    "[fe80:ffff:ffff:ffff:ffff:ffff:ffff:ffff]",
  ])("refuses https://%s/repo, the last address of its private range", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).toThrow(
      /private or reserved IP/,
    );
  });

  it.each([
    "126.255.255.255",
    "128.0.0.0",
    "9.255.255.255",
    "11.0.0.0",
    "172.15.255.255",
    "172.32.0.0",
    "192.167.255.255",
    "192.169.0.0",
    "169.253.255.255",
    "169.255.0.0",
  ])("accepts https://%s/repo, a public address just outside a private range", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).not.toThrow();
  });

  it("accepts a local path that merely holds a double slash", () => {
    expect(() => validateSourceFormat("./skills//nested", NAMED_MARKETPLACE)).not.toThrow();
  });
});

describe("the private-address refusal, for a host written in a form a URL parser reads differently", () => {
  it.each([
    "https://10.0.0.5?ref=main",
    "https://[::1]:8080?ref=main",
    "https://10.0.0.5#main",
    "https://127.1/repo",
    "https://0x7f.0.0.1/repo",
    "https://0177.0.0.1/repo",
    "https://%31%30.0.0.1/repo",
    "https://１０.0.0.1/repo",
    "https://1\t0.0.0.1/repo",
    "https://10.0.0.1\\repo",
    "https://10.0.0.1./repo",
    "https://[0:0:0:0:0:0:0:1]/repo",
    "https://[::ffff:172.16.0.1]/repo",
    "https://[::ffff:169.254.1.1]/repo",
    "https://[::ffff:0.0.0.0]/repo",
    "https://[::ffff:7f00:1]/repo",
  ])("refuses %s, which reaches a private address", (value) => {
    expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(/private or reserved IP/);
  });

  it.each([
    "https://github.com?ref=main",
    "https://8.8.8.8#main",
    "https://0x8.8.8.8/repo",
    "https://github.com./repo",
    "https://[::ffff:8.8.8.8]/repo",
  ])("accepts %s, the same spelling of a public host", (value) => {
    expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).not.toThrow();
  });

  /** A username in front of the host, private or public, is refused before the host is read. */
  it.each([
    "https://user.name@10.0.0.5/repo",
    "https://github.com@192.168.1.1:8080/repo",
    "https://a.b@[::1]/repo",
    "https://user.name@github.com/repo",
  ])("refuses %s for the username it carries", (value) => {
    expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(
      /carries a username or password in its URL/,
    );
  });

  /** The URL parser ends the host at `/`, `?`, `#` or `\`, so an `@` after one names no user. */
  it.each([
    "https://github.com/acme/skills@v1",
    "https://github.com/acme/skills?ref=user@example",
    "https://github.com/acme/skills#v1@main",
    "https://github.com\\@evil.example/skills",
    "https:///github.com/acme/skills@v1",
  ])("accepts %s, whose @ comes after the host", (value) => {
    expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).not.toThrow();
  });

  it.each(["https://a10.20.30.40/repo", "https://git hub.com/repo"])(
    "refuses %s, whose host the URL parser cannot read",
    (value) => {
      expect(() => validateSourceFormat(value, NAMED_MARKETPLACE)).toThrow(/invalid URL/);
    },
  );
});

/**
 * Each range by an address inside it and its last address, beside the public addresses just
 * outside it. The IPv6 ranges have no such neighbours: what borders them is reserved, not public.
 */
describe("the private-address refusal, for the reserved ranges", () => {
  it.each([
    ["0.20.30.40", "0.0.0.0/8, this network"],
    ["0.255.255.255", "0.0.0.0/8, this network"],
    ["100.64.20.30", "100.64.0.0/10, shared carrier-grade NAT space"],
    ["100.127.255.255", "100.64.0.0/10, shared carrier-grade NAT space"],
    ["192.0.0.20", "192.0.0.0/24, IETF protocol assignments"],
    ["192.0.0.255", "192.0.0.0/24, IETF protocol assignments"],
    ["198.18.20.30", "198.18.0.0/15, benchmarking"],
    ["198.19.255.255", "198.18.0.0/15, benchmarking"],
    ["224.0.0.1", "224.0.0.0/4, multicast"],
    ["239.255.255.255", "224.0.0.0/4, multicast"],
    ["240.20.30.40", "240.0.0.0/4, reserved"],
    ["255.255.255.255", "240.0.0.0/4, reserved, at the broadcast address"],
    ["4294967295", "240.0.0.0/4, reserved, at the broadcast address written as one number"],
    ["[::]", "::/128, the unspecified address, which connects to the loopback"],
    ["[0:0:0:0:0:0:0:0]", "::/128, the unspecified address, which connects to the loopback"],
    ["[fc00::1]", "fc00::/7, unique local"],
    ["[fcff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]", "fc00::/7, unique local"],
    ["[fe81::1]", "fe80::/10, link-local"],
    ["[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]", "fe80::/10, link-local"],
    ["[ff02::1]", "ff00::/8, multicast"],
    ["[ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]", "ff00::/8, multicast"],
    ["[64:ff9b:1::7f00:1]", "64:ff9b:1::/48, NAT64 local use"],
    ["[64:ff9b:1::a9fe:a9fe]", "64:ff9b:1::/48, NAT64 local use"],
    ["[64:ff9b:1:ffff:ffff:ffff:ffff:ffff]", "64:ff9b:1::/48, NAT64 local use"],
  ])("refuses https://%s/repo, in %s", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).toThrow(
      /private or reserved IP/,
    );
  });

  it.each([
    ["1.0.0.0", "0.0.0.0/8"],
    ["100.63.255.255", "100.64.0.0/10"],
    ["100.128.0.0", "100.64.0.0/10"],
    ["191.255.255.255", "192.0.0.0/24"],
    ["192.0.1.0", "192.0.0.0/24"],
    ["198.17.255.255", "198.18.0.0/15"],
    ["198.20.0.0", "198.18.0.0/15"],
    ["223.255.255.255", "224.0.0.0/4"],
  ])("accepts https://%s/repo, a public address just outside %s", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).not.toThrow();
  });
});

/** The IPv4 ranges decide these, so each form is shown carrying a private and a public address. */
describe("the private-address refusal, for an IPv6 address that carries an IPv4 one", () => {
  it.each([
    ["[::127.0.0.1]", "IPv4-compatible, carrying 127.0.0.1"],
    ["[::ffff:0:127.0.0.1]", "IPv4-translated, carrying 127.0.0.1"],
    ["[64:ff9b::127.0.0.0]", "NAT64, carrying 127.0.0.0"],
    ["[64:ff9b::192.168.1.1]", "NAT64, carrying 192.168.1.1"],
    ["[2002:7f00:1::]", "6to4, carrying 127.0.0.1"],
    ["[2002:c0a8:101::1]", "6to4, carrying 192.168.1.1"],
    ["[2001:0:4136:e378:8000:63bf:80ff:fffe]", "Teredo, carrying the client 127.0.0.1"],
    ["[2001:0:a00:1:8000:63bf:f7f7:f7f7]", "Teredo, carrying the server 10.0.0.1"],
    ["[2001:0:c0a8:101:8000:63bf:f7f7:f7f7]", "Teredo, carrying the server 192.168.1.1"],
  ])("refuses https://%s/repo, %s", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).toThrow(
      /private or reserved IP/,
    );
  });

  it.each([
    ["[::8.8.8.8]", "IPv4-compatible, carrying 8.8.8.8"],
    ["[::ffff:0:8.8.8.8]", "IPv4-translated, carrying 8.8.8.8"],
    ["[64:ff9b::126.255.255.255]", "NAT64, carrying 126.255.255.255, just below 127.0.0.0/8"],
    ["[64:ff9b::128.0.0.0]", "NAT64, carrying 128.0.0.0, just above 127.0.0.0/8"],
    ["[2002:808:808::]", "6to4, carrying 8.8.8.8"],
    ["[2003:7f00:1::]", "just outside 6to4's 2002::/16, where 6to4 would carry 127.0.0.1"],
    [
      "[2001:0:4136:e378:8000:63bf:f7f7:f7f7]",
      "Teredo, carrying the server 65.54.227.120 and the client 8.8.8.8",
    ],
    [
      "[2001:0:4136:e378::f7f7:f7f7]",
      "Teredo, carrying the same two, with flags and port of 0 written as ::",
    ],
  ])("accepts https://%s/repo, %s", (host) => {
    expect(() => validateSourceFormat(`https://${host}/repo`, NAMED_MARKETPLACE)).not.toThrow();
  });
});
