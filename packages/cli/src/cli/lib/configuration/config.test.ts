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
  resolveBranding,
  resolvePrimarySourceEntry,
  resolveSource,
  validateSourceFormat,
} from "./config";
import { DEFAULT_BRANDING, STANDARD_FILES } from "../../consts";

/** A source named by the config that lives at the home root — i.e. the global one. */
const HOME_CONFIG_SOURCE = "github:home/skills";
/** A source named by a project's own `config.ts`. */
const PROJECT_CONFIG_SOURCE = "github:project-of-its-own/skills";

/** A marketplace a config recorded, the name recorded beside it, and one it did not record. */
const STORED_MARKETPLACE = "github:acme/skills";
const STORED_NAME = "acme";
const OTHER_MARKETPLACE = "github:plain/skills";

/** A literal: a test reading the product's own constant cannot fail when its value changes. */
const MARKETPLACE_ENV_VAR = "CC_MARKETPLACE";

/** Read by nothing: an exported `CC_SOURCE` must act as if unset. */
const WITHDRAWN_SOURCE_ENV_VAR = "CC_SOURCE";

/** Mirrored like the env var; passed as `flagName`, which the messages interpolate. */
const MARKETPLACE_FLAG = "--marketplace";

/** A second, deliberately different label — proves the messages interpolate what they are given. */
const OTHER_FLAG_LABEL = "--agent-marketplace";

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
      // Bare directory names are ambiguous but treated as local
      expect(isLocalSource("my-skills")).toBe(true);
    });

    it("should throw error for path traversal in bare names", () => {
      // Bare names (no / or . prefix) with traversal patterns are suspicious
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
      // Paths starting with . are recognized as relative and allowed
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
        expect(() => validateSourceFormat("github:user/repo", MARKETPLACE_FLAG)).not.toThrow();
        expect(() => validateSourceFormat("github:org/my-skills", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should accept valid gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:user/repo", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should accept valid gitlab: shorthand", () => {
        expect(() => validateSourceFormat("gitlab:user/repo", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should accept valid bitbucket: shorthand", () => {
        expect(() => validateSourceFormat("bitbucket:user/repo", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should accept valid sourcehut: shorthand", () => {
        expect(() => validateSourceFormat("sourcehut:user/repo", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should accept valid https:// URLs", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
        expect(() =>
          validateSourceFormat("https://gitlab.company.com/team/skills", MARKETPLACE_FLAG),
        ).not.toThrow();
      });

      it("should accept valid http:// URLs", () => {
        expect(() =>
          validateSourceFormat("http://github.com/user/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
      });

      it("should accept localhost URLs", () => {
        expect(() =>
          validateSourceFormat("https://localhost/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
      });

      it("should accept valid local paths", () => {
        expect(() => validateSourceFormat("./my-skills", MARKETPLACE_FLAG)).not.toThrow();
        expect(() =>
          validateSourceFormat("../other-project/skills", MARKETPLACE_FLAG),
        ).not.toThrow();
        expect(() => validateSourceFormat("/home/user/skills", MARKETPLACE_FLAG)).not.toThrow();
        expect(() => validateSourceFormat("my-skills", MARKETPLACE_FLAG)).not.toThrow();
      });
    });

    describe("invalid remote sources", () => {
      it("should reject incomplete github: shorthand", () => {
        expect(() => validateSourceFormat("github:", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("github:x", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
      });

      it("should reject github: without owner/repo format", () => {
        expect(() => validateSourceFormat("github:just-a-name", MARKETPLACE_FLAG)).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
      });

      it("should reject gh: without owner/repo format", () => {
        expect(() => validateSourceFormat("gh:just-a-name", MARKETPLACE_FLAG)).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete https:// URLs", () => {
        expect(() => validateSourceFormat("https://", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("https://x", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
      });

      it("should reject https:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("https://not-a-host/repo", MARKETPLACE_FLAG)).toThrow(
          /invalid URL/,
        );
      });

      it("should reject http:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("http://", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://x", MARKETPLACE_FLAG)).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://not-a-host/repo", MARKETPLACE_FLAG)).toThrow(
          /invalid URL/,
        );
      });
    });

    describe("invalid local sources", () => {
      it("should reject paths with control characters", () => {
        expect(() => validateSourceFormat("my-skills\x00", MARKETPLACE_FLAG)).toThrow(
          /invalid characters/,
        );
        expect(() => validateSourceFormat("my\x07skills", MARKETPLACE_FLAG)).toThrow(
          /invalid characters/,
        );
      });

      it("should reject UNC paths (Windows network paths)", () => {
        expect(() => validateSourceFormat("//attacker.com/payload", MARKETPLACE_FLAG)).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("\\\\attacker.com\\share", MARKETPLACE_FLAG)).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("//192.168.1.1/share", MARKETPLACE_FLAG)).toThrow(
          /UNC network path/,
        );
      });
    });

    describe("null byte validation", () => {
      it("should reject null bytes in any source type", () => {
        expect(() => validateSourceFormat("github:user/repo\x00", MARKETPLACE_FLAG)).toThrow(
          /null bytes/,
        );
        expect(() =>
          validateSourceFormat("https://github.com/user/repo\x00", MARKETPLACE_FLAG),
        ).toThrow(/null bytes/);
        expect(() => validateSourceFormat("./my-\x00skills", MARKETPLACE_FLAG)).toThrow(
          /null bytes/,
        );
      });
    });

    describe("path traversal in remote sources", () => {
      it("should reject .. in git shorthand paths", () => {
        expect(() => validateSourceFormat("github:user/repo/../other", MARKETPLACE_FLAG)).toThrow(
          /path traversal/,
        );
        expect(() => validateSourceFormat("gh:user/../../etc", MARKETPLACE_FLAG)).toThrow(
          /path traversal/,
        );
      });

      it("should reject .. in HTTP URL paths", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/../admin/repo", MARKETPLACE_FLAG),
        ).toThrow(/path traversal/);
        expect(() =>
          validateSourceFormat("http://gitlab.com/user/repo/../../etc", MARKETPLACE_FLAG),
        ).toThrow(/path traversal/);
      });

      it("should reject .. in git ref query parameters", () => {
        expect(() =>
          validateSourceFormat("github:user/repo?branch=../../etc/passwd", MARKETPLACE_FLAG),
        ).toThrow(/path traversal/);
        expect(() => validateSourceFormat("gh:user/repo#../sensitive", MARKETPLACE_FLAG)).toThrow(
          /path traversal/,
        );
      });

      it("should accept legitimate paths without traversal", () => {
        expect(() => validateSourceFormat("github:user/repo", MARKETPLACE_FLAG)).not.toThrow();
        expect(() =>
          validateSourceFormat("https://github.com/user/repo/tree/main", MARKETPLACE_FLAG),
        ).not.toThrow();
        expect(() => validateSourceFormat("gitlab:team/skills", MARKETPLACE_FLAG)).not.toThrow();
      });
    });

    describe("private IP address validation", () => {
      it("should reject loopback addresses", () => {
        expect(() => validateSourceFormat("https://127.0.0.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("http://127.0.0.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
        expect(() =>
          validateSourceFormat("https://127.255.255.255/repo", MARKETPLACE_FLAG),
        ).toThrow(/private or reserved IP/);
      });

      it("should reject private network addresses (10.x.x.x)", () => {
        expect(() => validateSourceFormat("https://10.0.0.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://10.255.255.255/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject private network addresses (172.16-31.x.x)", () => {
        expect(() => validateSourceFormat("https://172.16.0.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://172.31.255.255/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject private network addresses (192.168.x.x)", () => {
        expect(() => validateSourceFormat("https://192.168.0.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://192.168.1.100/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject 0.0.0.0", () => {
        expect(() => validateSourceFormat("https://0.0.0.0/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject link-local addresses (169.254.x.x)", () => {
        expect(() => validateSourceFormat("https://169.254.1.1/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject IPv6 loopback", () => {
        expect(() => validateSourceFormat("https://[::1]/repo", MARKETPLACE_FLAG)).toThrow(
          /private or reserved IP/,
        );
      });

      it("should allow public IP addresses", () => {
        expect(() => validateSourceFormat("https://8.8.8.8/repo", MARKETPLACE_FLAG)).not.toThrow();
        expect(() => validateSourceFormat("https://1.2.3.4/repo", MARKETPLACE_FLAG)).not.toThrow();
      });

      it("should allow non-private 172.x addresses", () => {
        expect(() =>
          validateSourceFormat("https://172.32.0.1/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
        expect(() =>
          validateSourceFormat("https://172.15.0.1/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
      });

      it("should still allow localhost by hostname", () => {
        expect(() =>
          validateSourceFormat("https://localhost/repo", MARKETPLACE_FLAG),
        ).not.toThrow();
      });
    });

    describe("length validation", () => {
      it("should reject sources exceeding max length", () => {
        const longSource = "a".repeat(513);
        expect(() => validateSourceFormat(longSource, MARKETPLACE_FLAG)).toThrow(/too long/);
      });

      it("should accept sources at max length", () => {
        const maxSource = "./a".repeat(170); // 510 chars, under 512
        expect(() => validateSourceFormat(maxSource, MARKETPLACE_FLAG)).not.toThrow();
      });
    });

    describe("error message quality", () => {
      it("should include flag name in error messages", () => {
        expect(() => validateSourceFormat("github:", MARKETPLACE_FLAG)).toThrow(MARKETPLACE_FLAG);
        expect(() => validateSourceFormat("github:", OTHER_FLAG_LABEL)).toThrow(OTHER_FLAG_LABEL);
      });

      it("should include examples in error messages", () => {
        expect(() => validateSourceFormat("github:", MARKETPLACE_FLAG)).toThrow(/Examples/);
      });
    });

    /** Messages interpolate `flagName`; the prose around it must not say "source". */
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
        expect(() => validateSourceFormat(value, MARKETPLACE_FLAG)).toThrow(MARKETPLACE_FLAG);
        expect(() => validateSourceFormat(value, MARKETPLACE_FLAG)).not.toThrow(WITHDRAWN_NOUN);
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

      it("should warn and fall back to project config for invalid env var", async () => {
        process.env[MARKETPLACE_ENV_VAR] = "github:just-a-name";

        await writeTestTsConfig(tempDir, buildSourceConfig({ marketplace: "github:project/repo" }));

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("project");
        expect(result.source).toBe("github:project/repo");
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

    it("should load agentsDir from project config", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ agentsDir: "lib/agents" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.agentsDir).toBe("lib/agents");
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
      expect(config?.agentsDir).toBeUndefined();
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
          agentsDir: "lib/agents",
          stacksFile: "data/stacks.ts",
          categoriesFile: "data/categories.yaml",
          rulesFile: "data/rules.yaml",
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.marketplace).toBe("github:myorg/skills");
      expect(config?.skillsDir).toBe("lib/skills");
      expect(config?.agentsDir).toBe("lib/agents");
      expect(config?.stacksFile).toBe("data/stacks.ts");
      expect(config?.categoriesFile).toBe("data/categories.yaml");
      expect(config?.rulesFile).toBe("data/rules.yaml");
    });
  });

  describe("loadProjectSourceConfig with agentsSource", () => {
    it("should load agentsSource from project config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ agentsSource: "https://my-company.com/agents" }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.agentsSource).toBe("https://my-company.com/agents");
    });

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
      expect(config?.agentsSource).toBe("https://agents.example.com");
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
