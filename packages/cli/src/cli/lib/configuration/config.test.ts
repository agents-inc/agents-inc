import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildSourceConfig,
} from "../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { setVerbose } from "../../utils/logger";
import {
  DEFAULT_SOURCE,
  getProjectConfigPath,
  isLocalSource,
  loadProjectSourceConfig,
  resolveBranding,
  resolveSource,
  SOURCE_ENV_VAR,
  validateSourceFormat,
} from "./config";
import { CLAUDE_SRC_DIR, DEFAULT_BRANDING, STANDARD_FILES } from "../../consts";

/** A source named by the config that lives at the home root — i.e. the global one. */
const HOME_CONFIG_SOURCE = "github:home/skills";
/** A source named by a project's own `.claude-src/config.ts`. */
const PROJECT_CONFIG_SOURCE = "github:project-of-its-own/skills";

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-test-");
    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    delete process.env[SOURCE_ENV_VAR];
  });

  describe("DEFAULT_SOURCE", () => {
    it("should be set to the skills repo", () => {
      expect(DEFAULT_SOURCE).toBe("github:agents-inc/skills");
    });
  });

  describe("SOURCE_ENV_VAR", () => {
    it("should be CC_SOURCE", () => {
      expect(SOURCE_ENV_VAR).toBe("CC_SOURCE");
    });
  });

  describe("getProjectConfigPath", () => {
    it("should return path in project .claude-src directory", () => {
      const configPath = getProjectConfigPath("/my/project");
      expect(configPath).toBe(`/my/project/${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
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
      // Plain directory names without / or . prefix are ambiguous
      // but we treat them as local
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

  describe("validateSourceFormat", () => {
    describe("valid sources", () => {
      it("should accept valid github: shorthand", () => {
        expect(() => validateSourceFormat("github:user/repo", "--source")).not.toThrow();
        expect(() => validateSourceFormat("github:org/my-skills", "--source")).not.toThrow();
      });

      it("should accept valid gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:user/repo", "--source")).not.toThrow();
      });

      it("should accept valid gitlab: shorthand", () => {
        expect(() => validateSourceFormat("gitlab:user/repo", "--source")).not.toThrow();
      });

      it("should accept valid bitbucket: shorthand", () => {
        expect(() => validateSourceFormat("bitbucket:user/repo", "--source")).not.toThrow();
      });

      it("should accept valid sourcehut: shorthand", () => {
        expect(() => validateSourceFormat("sourcehut:user/repo", "--source")).not.toThrow();
      });

      it("should accept valid https:// URLs", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/repo", "--source"),
        ).not.toThrow();
        expect(() =>
          validateSourceFormat("https://gitlab.company.com/team/skills", "--source"),
        ).not.toThrow();
      });

      it("should accept valid http:// URLs", () => {
        expect(() => validateSourceFormat("http://github.com/user/repo", "--source")).not.toThrow();
      });

      it("should accept localhost URLs", () => {
        expect(() => validateSourceFormat("https://localhost/repo", "--source")).not.toThrow();
      });

      it("should accept valid local paths", () => {
        expect(() => validateSourceFormat("./my-skills", "--source")).not.toThrow();
        expect(() => validateSourceFormat("../other-project/skills", "--source")).not.toThrow();
        expect(() => validateSourceFormat("/home/user/skills", "--source")).not.toThrow();
        expect(() => validateSourceFormat("my-skills", "--source")).not.toThrow();
      });
    });

    describe("invalid remote sources", () => {
      it("should reject incomplete github: shorthand", () => {
        expect(() => validateSourceFormat("github:", "--source")).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("github:x", "--source")).toThrow(/incomplete URL/);
      });

      it("should reject github: without owner/repo format", () => {
        expect(() => validateSourceFormat("github:just-a-name", "--source")).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete gh: shorthand", () => {
        expect(() => validateSourceFormat("gh:", "--source")).toThrow(/incomplete URL/);
      });

      it("should reject gh: without owner/repo format", () => {
        expect(() => validateSourceFormat("gh:just-a-name", "--source")).toThrow(
          /owner\/repo format/,
        );
      });

      it("should reject incomplete https:// URLs", () => {
        expect(() => validateSourceFormat("https://", "--source")).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("https://x", "--source")).toThrow(/incomplete URL/);
      });

      it("should reject https:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("https://not-a-host/repo", "--source")).toThrow(
          /invalid URL/,
        );
      });

      it("should reject http:// URLs without valid hostname", () => {
        expect(() => validateSourceFormat("http://", "--source")).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://x", "--source")).toThrow(/incomplete URL/);
        expect(() => validateSourceFormat("http://not-a-host/repo", "--source")).toThrow(
          /invalid URL/,
        );
      });
    });

    describe("invalid local sources", () => {
      it("should reject paths with control characters", () => {
        expect(() => validateSourceFormat("my-skills\x00", "--source")).toThrow(
          /invalid characters/,
        );
        expect(() => validateSourceFormat("my\x07skills", "--source")).toThrow(
          /invalid characters/,
        );
      });

      it("should reject UNC paths (Windows network paths)", () => {
        expect(() => validateSourceFormat("//attacker.com/payload", "--source")).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("\\\\attacker.com\\share", "--source")).toThrow(
          /UNC network path/,
        );
        expect(() => validateSourceFormat("//192.168.1.1/share", "--source")).toThrow(
          /UNC network path/,
        );
      });
    });

    describe("null byte validation", () => {
      it("should reject null bytes in any source type", () => {
        expect(() => validateSourceFormat("github:user/repo\x00", "--source")).toThrow(
          /null bytes/,
        );
        expect(() => validateSourceFormat("https://github.com/user/repo\x00", "--source")).toThrow(
          /null bytes/,
        );
        expect(() => validateSourceFormat("./my-\x00skills", "--source")).toThrow(/null bytes/);
      });
    });

    describe("path traversal in remote sources", () => {
      it("should reject .. in git shorthand paths", () => {
        expect(() => validateSourceFormat("github:user/repo/../other", "--source")).toThrow(
          /path traversal/,
        );
        expect(() => validateSourceFormat("gh:user/../../etc", "--source")).toThrow(
          /path traversal/,
        );
      });

      it("should reject .. in HTTP URL paths", () => {
        expect(() =>
          validateSourceFormat("https://github.com/user/../admin/repo", "--source"),
        ).toThrow(/path traversal/);
        expect(() =>
          validateSourceFormat("http://gitlab.com/user/repo/../../etc", "--source"),
        ).toThrow(/path traversal/);
      });

      it("should reject .. in git ref query parameters", () => {
        expect(() =>
          validateSourceFormat("github:user/repo?branch=../../etc/passwd", "--source"),
        ).toThrow(/path traversal/);
        expect(() => validateSourceFormat("gh:user/repo#../sensitive", "--source")).toThrow(
          /path traversal/,
        );
      });

      it("should accept legitimate paths without traversal", () => {
        expect(() => validateSourceFormat("github:user/repo", "--source")).not.toThrow();
        expect(() =>
          validateSourceFormat("https://github.com/user/repo/tree/main", "--source"),
        ).not.toThrow();
        expect(() => validateSourceFormat("gitlab:team/skills", "--source")).not.toThrow();
      });
    });

    describe("private IP address validation", () => {
      it("should reject loopback addresses", () => {
        expect(() => validateSourceFormat("https://127.0.0.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("http://127.0.0.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://127.255.255.255/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject private network addresses (10.x.x.x)", () => {
        expect(() => validateSourceFormat("https://10.0.0.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://10.255.255.255/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject private network addresses (172.16-31.x.x)", () => {
        expect(() => validateSourceFormat("https://172.16.0.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://172.31.255.255/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject private network addresses (192.168.x.x)", () => {
        expect(() => validateSourceFormat("https://192.168.0.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
        expect(() => validateSourceFormat("https://192.168.1.100/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject 0.0.0.0", () => {
        expect(() => validateSourceFormat("https://0.0.0.0/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject link-local addresses (169.254.x.x)", () => {
        expect(() => validateSourceFormat("https://169.254.1.1/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should reject IPv6 loopback", () => {
        expect(() => validateSourceFormat("https://[::1]/repo", "--source")).toThrow(
          /private or reserved IP/,
        );
      });

      it("should allow public IP addresses", () => {
        expect(() => validateSourceFormat("https://8.8.8.8/repo", "--source")).not.toThrow();
        expect(() => validateSourceFormat("https://1.2.3.4/repo", "--source")).not.toThrow();
      });

      it("should allow non-private 172.x addresses", () => {
        expect(() => validateSourceFormat("https://172.32.0.1/repo", "--source")).not.toThrow();
        expect(() => validateSourceFormat("https://172.15.0.1/repo", "--source")).not.toThrow();
      });

      it("should still allow localhost by hostname", () => {
        expect(() => validateSourceFormat("https://localhost/repo", "--source")).not.toThrow();
      });
    });

    describe("length validation", () => {
      it("should reject sources exceeding max length", () => {
        const longSource = "a".repeat(513);
        expect(() => validateSourceFormat(longSource, "--source")).toThrow(/too long/);
      });

      it("should accept sources at max length", () => {
        const maxSource = "./a".repeat(170); // 510 chars, under 512
        expect(() => validateSourceFormat(maxSource, "--source")).not.toThrow();
      });
    });

    describe("error message quality", () => {
      it("should include flag name in error messages", () => {
        expect(() => validateSourceFormat("github:", "--source")).toThrow(/--source/);
        expect(() => validateSourceFormat("github:", "--agent-source")).toThrow(/--agent-source/);
      });

      it("should include examples in error messages", () => {
        expect(() => validateSourceFormat("github:", "--source")).toThrow(/Examples/);
      });
    });
  });

  describe("loadProjectSourceConfig", () => {
    it("should return null if config file does not exist", async () => {
      const config = await loadProjectSourceConfig(tempDir);
      expect(config).toBeNull();
    });

    it("should load config from .claude-src/config.ts", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:mycompany/skills" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config).toStrictEqual({ source: "github:mycompany/skills" });
    });

    it("when config.ts contains invalid syntax, should return null", async () => {
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config).toBeNull();
    });

    it("should load marketplace from project config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ marketplace: "https://custom-marketplace.io" }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.marketplace).toBe("https://custom-marketplace.io");
    });
  });

  describe("resolveSource", () => {
    let savedHome: string;
    let homeDir: string;

    beforeEach(async () => {
      savedHome = process.env.HOME ?? "";
      // Point HOME inside the temp dir so resolveSource doesn't fall back to real
      // ~/.claude-src/ — and keep it a DIFFERENT directory from `tempDir`, which
      // stands in for the project. Collapsed into one directory there is only one
      // config file, and the project rung cannot be told apart from the global one.
      homeDir = path.join(tempDir, "home");
      await mkdir(homeDir, { recursive: true });
      process.env.HOME = homeDir;
    });

    afterEach(() => {
      process.env.HOME = savedHome;
    });

    it("should return flag value with highest priority", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/repo";

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/repo",
        projectDir: tempDir,
      });

      expect(result.source).toBe("github:flag/repo");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should return env value when no flag is provided", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/repo";

      const result = await resolveSource({ caller: "init", projectDir: tempDir });

      expect(result.source).toBe("github:env/repo");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should return project config when no flag or env", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:project/repo" }));

      const result = await resolveSource({ caller: "stored", projectDir: tempDir });

      expect(result.source).toBe("github:project/repo");
      expect(result.sourceOrigin).toBe("project");
    });

    it("should return default when no config is set", async () => {
      const result = await resolveSource({ caller: "stored", projectDir: tempDir });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });

    it("when projectDir is undefined and no flag provided, should fall back to default source", async () => {
      const result = await resolveSource({ caller: "stored" });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });

    it("should prioritize flag over all other sources", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/repo";
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:project/repo" }));

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/repo",
        projectDir: tempDir,
      });

      expect(result.source).toBe("github:flag/repo");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should prioritize env over project config", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/repo";
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:project/repo" }));

      const result = await resolveSource({ caller: "init", projectDir: tempDir });

      expect(result.source).toBe("github:env/repo");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should throw error for empty source flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "", projectDir: tempDir }),
      ).rejects.toThrow(/The source cannot be empty/);
    });

    it("should throw error for whitespace-only source flag", async () => {
      await expect(
        resolveSource({ caller: "init", flag: "   ", projectDir: tempDir }),
      ).rejects.toThrow(/The source cannot be empty/);
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
        process.env[SOURCE_ENV_VAR] = "github:env/repo";
        await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:project/repo" }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source, "a stored caller reads what the install recorded").toBe(
          "github:project/repo",
        );
        expect(result.sourceOrigin).toBe("project");
      });

      it("should ignore the env var for a stored caller with nothing stored", async () => {
        process.env[SOURCE_ENV_VAR] = "github:env/repo";

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source, "an ambient env var must not stand in for a stored source").toBe(
          DEFAULT_SOURCE,
        );
        expect(result.sourceOrigin).toBe("default");
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
        process.env[SOURCE_ENV_VAR] = "github:org/repo";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:org/repo");
        expect(result.sourceOrigin).toBe("env");
      });

      it("should warn and fall back to default for invalid env var (incomplete URL)", async () => {
        process.env[SOURCE_ENV_VAR] = "github:";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back to project config for invalid env var", async () => {
        process.env[SOURCE_ENV_VAR] = "github:just-a-name";

        await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:project/repo" }));

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("project");
        expect(result.source).toBe("github:project/repo");
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back for whitespace-only env var", async () => {
        process.env[SOURCE_ENV_VAR] = "   ";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("empty"));
      });

      it("should warn and fall back for malformed URL in env var", async () => {
        process.env[SOURCE_ENV_VAR] = "https://";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should warn and fall back for UNC path in env var", async () => {
        process.env[SOURCE_ENV_VAR] = "//attacker.com/payload";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.sourceOrigin).toBe("default");
        expect(result.source).toBe(DEFAULT_SOURCE);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid value"));
      });

      it("should trim valid env var values", async () => {
        process.env[SOURCE_ENV_VAR] = "  github:org/repo  ";

        const result = await resolveSource({ caller: "init", projectDir: tempDir });

        expect(result.source).toBe("github:org/repo");
        expect(result.sourceOrigin).toBe("env");
      });
    });

    describe("marketplace resolution", () => {
      it("should return marketplace from project config", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({ marketplace: "https://my-company.com/plugins" }),
        );

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.marketplace).toBe("https://my-company.com/plugins");
      });

      it("should return marketplace alongside source from project config", async () => {
        await writeTestTsConfig(
          tempDir,
          buildSourceConfig({
            source: "github:mycompany/skills",
            marketplace: "https://enterprise.example.com/plugins",
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
    });

    describe("the config at the home root is the global one", () => {
      it("should label a source read at the home root as global", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ source: HOME_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: homeDir });

        expect(result.source).toBe(HOME_CONFIG_SOURCE);
        expect(
          result.sourceOrigin,
          "~/.claude-src/config.ts is the global config — running from the home root does not make it a project's",
        ).toBe("global");
      });

      it("should label a source read from a project's own config as project", async () => {
        await writeTestTsConfig(tempDir, buildSourceConfig({ source: PROJECT_CONFIG_SOURCE }));
        await writeTestTsConfig(homeDir, buildSourceConfig({ source: HOME_CONFIG_SOURCE }));

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(result.source).toBe(PROJECT_CONFIG_SOURCE);
        expect(result.sourceOrigin).toBe("project");
      });

      it("should label a project config carrying only global-scoped entries as project", async () => {
        await writeTestTsConfig(tempDir, {
          ...buildProjectConfig({
            skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          }),
          source: PROJECT_CONFIG_SOURCE,
        });

        const result = await resolveSource({ caller: "stored", projectDir: tempDir });

        expect(
          result.sourceOrigin,
          "the origin names the file the source was read from, not the scope the entries in it carry",
        ).toBe("project");
      });

      it("should fall back to the global config from a project that has none", async () => {
        await writeTestTsConfig(homeDir, buildSourceConfig({ source: HOME_CONFIG_SOURCE }));

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

      it("should not claim a --source flag for a caller that has none", async () => {
        // `doctor` validates a source repository by pointing the loader at a path.
        // It is a stored caller: `--source` is `init`'s flag and nobody else's.
        await resolveSource({ caller: "stored", flag: namedSource, projectDir: tempDir });

        expect(consoleSpies.log).toHaveBeenCalledWith(expect.stringContaining(namedSource));
        expect(
          consoleSpies.log,
          "no --source flag was passed to this run, so the line must not say one was",
        ).not.toHaveBeenCalledWith(expect.stringContaining("--source"));
      });

      it("should still name the source init passed as its flag", async () => {
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
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:myorg/skills" }));

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
          source: "github:myorg/skills",
          skillsDir: "lib/skills",
          agentsDir: "lib/agents",
          stacksFile: "data/stacks.ts",
          categoriesFile: "data/categories.yaml",
          rulesFile: "data/rules.yaml",
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.source).toBe("github:myorg/skills");
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
          source: "github:myorg/skills",
          marketplace: "https://market.example.com",
          agentsSource: "https://agents.example.com",
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.source).toBe("github:myorg/skills");
      expect(config?.marketplace).toBe("https://market.example.com");
      expect(config?.agentsSource).toBe("https://agents.example.com");
    });
  });

  describe("loadProjectSourceConfig with branding", () => {
    it("should load branding name from project config", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          branding: { name: "Acme Dev Tools", tagline: "Build faster with Acme" },
        }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding?.name).toBe("Acme Dev Tools");
      expect(config?.branding?.tagline).toBe("Build faster with Acme");
    });

    it("should return undefined branding when not configured", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:myorg/skills" }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding).toBeUndefined();
    });

    it("should load partial branding (name only)", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ branding: { name: "My Company" } }));

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding?.name).toBe("My Company");
      expect(config?.branding?.tagline).toBeUndefined();
    });

    it("should load partial branding (tagline only)", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ branding: { tagline: "Custom tagline" } }),
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.branding?.name).toBeUndefined();
      expect(config?.branding?.tagline).toBe("Custom tagline");
    });
  });

  describe("resolveBranding", () => {
    it("should return default branding when no config exists", async () => {
      const branding = await resolveBranding(tempDir);
      expect(branding.name).toBe(DEFAULT_BRANDING.NAME);
      expect(branding.tagline).toBe(DEFAULT_BRANDING.TAGLINE);
    });

    it("should return default branding when projectDir is undefined", async () => {
      const branding = await resolveBranding(undefined);
      expect(branding.name).toBe(DEFAULT_BRANDING.NAME);
      expect(branding.tagline).toBe(DEFAULT_BRANDING.TAGLINE);
    });

    it("should return custom branding when configured", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          branding: { name: "Acme Dev Tools", tagline: "Build faster with Acme" },
        }),
      );

      const branding = await resolveBranding(tempDir);
      expect(branding.name).toBe("Acme Dev Tools");
      expect(branding.tagline).toBe("Build faster with Acme");
    });

    it("should merge custom branding with defaults for missing fields", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ branding: { name: "Acme Dev Tools" } }));

      const branding = await resolveBranding(tempDir);
      expect(branding.name).toBe("Acme Dev Tools");
      expect(branding.tagline).toBe(DEFAULT_BRANDING.TAGLINE);
    });

    it("should use default name when only tagline is configured", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ branding: { tagline: "Custom tagline" } }),
      );

      const branding = await resolveBranding(tempDir);
      expect(branding.name).toBe(DEFAULT_BRANDING.NAME);
      expect(branding.tagline).toBe("Custom tagline");
    });

    it("should return default branding when config has no branding section", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:myorg/skills" }));

      const branding = await resolveBranding(tempDir);
      expect(branding.name).toBe(DEFAULT_BRANDING.NAME);
      expect(branding.tagline).toBe(DEFAULT_BRANDING.TAGLINE);
    });
  });
});
