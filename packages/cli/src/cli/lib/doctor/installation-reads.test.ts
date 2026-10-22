import path from "path";
import { mkdir, realpath, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hostsOf,
  hostsOnDisk,
  installedPluginSkillIds,
  providersInPlay,
  resolveConfigState,
  unofferablePlacements,
  type CheckedInstallation,
} from "./installation-reads.js";
import { hostFor } from "../hosts/host-for.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { getPluginManifestPath } from "../plugins/plugin-finder.js";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { renderUnparseableConfigTs } from "../__tests__/factories/unloadable-config-factories.js";
import { writeRawTestConfig, writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { createMockPluginHost } from "../__tests__/helpers/mock-plugin-host.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import type { PluginHost } from "../hosts/plugin-host.js";
import type { Provider } from "../../consts.js";

// The real door by default; one spec at a time hands back a host whose listing it controls.
vi.mock("../hosts/host-for.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hosts/host-for.js")>();
  return { ...actual, hostFor: vi.fn(actual.hostFor) };
});

/** A marketplace origin rather than eject, which makes a skill plugin-mode. */
const PLUGIN_MODE_ORIGIN = "agents-inc";

const DECLARES_NOTHING = { skills: [], agents: [] };

function folderOf(provider: Provider): string {
  return sourceFolderInUse("", provider).relName;
}

describe("installation-reads", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-doctor-installation-reads-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    projectDir = await realpath(projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  function on(provider: Provider, dir = projectDir): CheckedInstallation {
    return { projectDir: dir, hosts: hostsOf(provider) };
  }

  describe("hostsOnDisk", () => {
    it("reads each scope's provider off that scope's own folder", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(), folderOf("codex"));
      await writeTestTsConfig(home.dir, buildProjectConfig(), folderOf("claude"));

      expect(hostsOnDisk(projectDir)).toStrictEqual({ project: "codex", global: "claude" });
    });
  });

  describe("providersInPlay", () => {
    it("answers the project's installations, leaving the global ones out", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(), folderOf("claude"));
      await writeTestTsConfig(projectDir, buildProjectConfig(), folderOf("codex"));
      await writeTestTsConfig(home.dir, buildProjectConfig(), folderOf("claude"));

      expect(await providersInPlay(projectDir)).toStrictEqual(["claude", "codex"]);
    });

    it("answers the global installations where the project holds none", async () => {
      await writeTestTsConfig(home.dir, buildProjectConfig(), folderOf("codex"));

      expect(await providersInPlay(projectDir)).toStrictEqual(["codex"]);
    });
  });

  describe("resolveConfigState", () => {
    it("reads the project's config through the named provider's folder, not the one on disk", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "on-claude" }));
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "on-codex" }),
        folderOf("codex"),
      );

      expect(await resolveConfigState(on("codex"))).toStrictEqual({
        kind: "loaded",
        config: expect.objectContaining({ name: "on-codex" }),
        inherited: false,
      });
    });

    it("inherits the global config where the project's own declares nothing", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig(DECLARES_NOTHING));
      await writeTestTsConfig(home.dir, buildProjectConfig({ name: "global-one" }));

      expect(await resolveConfigState(on("claude"))).toStrictEqual({
        kind: "loaded",
        config: expect.objectContaining({ name: "global-one" }),
        inherited: true,
      });
    });

    it("keeps a config that declares nothing where there is nothing to inherit", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ ...DECLARES_NOTHING, name: "empty" }),
      );

      expect(await resolveConfigState(on("claude"))).toStrictEqual({
        kind: "declares-nothing",
        config: expect.objectContaining({ name: "empty" }),
      });
    });

    it("never reads the home directory's config as inherited by itself", async () => {
      await writeTestTsConfig(home.dir, buildProjectConfig({ ...DECLARES_NOTHING, name: "home" }));

      expect(await resolveConfigState(on("claude", home.dir))).toStrictEqual({
        kind: "declares-nothing",
        config: expect.objectContaining({ name: "home" }),
      });
    });

    it("answers absent where neither scope holds the named provider's config", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig());

      expect(await resolveConfigState(on("codex"))).toStrictEqual({ kind: "absent" });
    });

    it("answers unreadable, carrying the loader's failure, for a config that will not load", async () => {
      const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      expect(await resolveConfigState(on("claude"))).toStrictEqual({
        kind: "unreadable",
        failure: expect.objectContaining({ configPath, scopeRoot: projectDir, scope: "project" }),
      });
    });
  });

  describe("installedPluginSkillIds", () => {
    const installPath = (name: string) => path.join(tempDir, "cache", name);

    async function plantManifest(name: string): Promise<void> {
      const manifestPath = getPluginManifestPath(installPath(name));
      await mkdir(path.dirname(manifestPath), { recursive: true });
      await writeFile(manifestPath, JSON.stringify({ name }));
    }

    it("keeps the enabled plugins whose manifest is on disk, as listed by the named provider's host", async () => {
      await plantManifest("react");
      await plantManifest("zustand");
      vi.mocked(hostFor).mockImplementationOnce(() =>
        createMockPluginHost({
          listPlugins: vi.fn<PluginHost["listPlugins"]>().mockResolvedValue([
            {
              pluginKey: "web-framework-react@acme",
              installPath: installPath("react"),
              enabled: true,
            },
            {
              pluginKey: "web-state-zustand@acme",
              installPath: installPath("zustand"),
              enabled: false,
            },
            {
              pluginKey: "api-framework-hono@acme",
              installPath: installPath("hono"),
              enabled: true,
            },
          ]),
        }),
      );

      expect(await installedPluginSkillIds(projectDir, "codex")).toStrictEqual(
        new Set(["web-framework-react"]),
      );
      expect(hostFor).toHaveBeenLastCalledWith("codex");
    });

    it("answers none where the host cannot list its plugins", async () => {
      vi.mocked(hostFor).mockImplementationOnce(() =>
        createMockPluginHost({
          listPlugins: vi
            .fn<PluginHost["listPlugins"]>()
            .mockRejectedValue(new Error("registry unreadable")),
        }),
      );

      expect(await installedPluginSkillIds(projectDir, "claude")).toStrictEqual(new Set());
    });
  });

  describe("unofferablePlacements", () => {
    const projectPluginSkill = (id: "web-framework-react" | "web-state-zustand") =>
      buildProjectConfig({
        skills: buildSkillConfigs([id], { origin: PLUGIN_MODE_ORIGIN }),
        agents: buildAgentConfigs(["web-developer"]),
      });

    const refusedByCodex = (id: string) =>
      `Refusing to install ${id} as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.`;

    it("asks each scope's config of the named provider's host, the project's first", async () => {
      await writeTestTsConfig(
        projectDir,
        projectPluginSkill("web-framework-react"),
        folderOf("codex"),
      );
      await writeTestTsConfig(home.dir, projectPluginSkill("web-state-zustand"), folderOf("codex"));

      expect(await unofferablePlacements(on("codex"))).toStrictEqual([
        refusedByCodex("web-framework-react"),
        refusedByCodex("web-state-zustand"),
      ]);
    });

    it("names nothing where the named host offers every placement asked for", async () => {
      await writeTestTsConfig(projectDir, projectPluginSkill("web-framework-react"));

      expect(await unofferablePlacements(on("claude"))).toStrictEqual([]);
    });

    it("passes over a config that will not load, which the Config Valid row names", async () => {
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs(), folderOf("codex"));
      await writeTestTsConfig(home.dir, projectPluginSkill("web-state-zustand"), folderOf("codex"));

      expect(await unofferablePlacements(on("codex"))).toStrictEqual([
        refusedByCodex("web-state-zustand"),
      ]);
    });
  });
});
