import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";

import { sharedConfigFixtureRepos } from "./shared-config-fixture-repos.js";
import {
  findConfig,
  findSharedImport,
  findWorkspaces,
  readWorkspaceManifest,
  repoRootFromArgv,
} from "./workspace-manifests.js";

const SHARED_CONFIG_PACKAGE = "@workspace/thing-config";
const SHARED_BASE_ENTRY = `${SHARED_CONFIG_PACKAGE}/base`;
const LOOKALIKE_PACKAGE = `${SHARED_CONFIG_PACKAGE}-extra`;
const OPT_OUT_KEY = "//no-shared-thing-config";
const OPT_OUT_REASON = "nothing here is checked by the thing";
const SHARED_CONFIG = { packageName: SHARED_CONFIG_PACKAGE, optOutKey: OPT_OUT_KEY };

const WORKSPACE_DIR = "packages/thing";
const OTHER_WORKSPACE_DIR = "packages/other";
const FOLDER_WITHOUT_MANIFEST = "packages/loose";

const THING_CONFIG = { basenames: ["thing.config"], extensions: [".js", ".ts"] };
const THING_CONFIG_TS_FIRST = { basenames: ["thing.config"], extensions: [".ts", ".js"] };
const THING_CONFIG_JS = "thing.config.js";
const THING_CONFIG_TS = "thing.config.ts";
const UNRELATED_CONFIG = "other.config.js";

const IMPORTING_CONFIG = `import { base } from "${SHARED_BASE_ENTRY}";\n\nexport default base;\n`;
const RE_EXPORTING_CONFIG = `export { default } from "${SHARED_CONFIG_PACKAGE}";\n`;
const COMMENTING_CONFIG = `// Not ${SHARED_CONFIG_PACKAGE}: nothing here is shared.\nexport default {};\n`;
const LOOKALIKE_CONFIG = `import thing from "${LOOKALIKE_PACKAGE}";\n\nexport default thing;\n`;

const ARGV_HEAD = ["bun", "run-check.ts"];
const ROOT_FLAG = "--root";
const FIXTURE_ROOT = "/fixture/repo";
const EXITED = "process.exit was called";

const { writeFixtureRepo, removeFixtureRepos } = sharedConfigFixtureRepos({
  tempDirPrefix: "workspace-manifests-",
  sharedConfigPackage: SHARED_CONFIG_PACKAGE,
});

afterEach(removeFixtureRepos);

describe("finding a repository's workspaces", () => {
  it("lists every folder the root manifest's globs reach that holds a manifest, sorted", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR },
      { directory: OTHER_WORKSPACE_DIR },
    ]);
    mkdirSync(path.join(root, FOLDER_WITHOUT_MANIFEST), { recursive: true });

    expect(findWorkspaces(root)).toStrictEqual([OTHER_WORKSPACE_DIR, WORKSPACE_DIR]);
  });

  it("lists none when the globs reach nothing", async () => {
    const root = await writeFixtureRepo([]);

    expect(findWorkspaces(root)).toStrictEqual([]);
  });
});

describe("reading a workspace's manifest", () => {
  it("says the shared config is declared when a dev dependency names it", async () => {
    const root = await writeFixtureRepo([{ directory: WORKSPACE_DIR }]);

    expect(readWorkspaceManifest(path.join(root, WORKSPACE_DIR), SHARED_CONFIG)).toStrictEqual({
      optOutReason: undefined,
      declaresSharedConfig: true,
    });
  });

  it("says the shared config is declared when a runtime dependency names it", async () => {
    const root = await writeFixtureRepo([{ directory: WORKSPACE_DIR }]);
    writeFileSync(
      path.join(root, WORKSPACE_DIR, "package.json"),
      JSON.stringify({ dependencies: { [SHARED_CONFIG_PACKAGE]: "workspace:*" } }),
    );

    expect(
      readWorkspaceManifest(path.join(root, WORKSPACE_DIR), SHARED_CONFIG).declaresSharedConfig,
    ).toBe(true);
  });

  it("carries the opt-out reason, and says when nothing declares the package", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: OPT_OUT_REASON },
      },
    ]);

    expect(readWorkspaceManifest(path.join(root, WORKSPACE_DIR), SHARED_CONFIG)).toStrictEqual({
      optOutReason: OPT_OUT_REASON,
      declaresSharedConfig: false,
    });
  });

  it("refuses an opt-out whose value is not a reason", async () => {
    const root = await writeFixtureRepo([{ directory: WORKSPACE_DIR }]);
    writeFileSync(
      path.join(root, WORKSPACE_DIR, "package.json"),
      JSON.stringify({ [OPT_OUT_KEY]: true }),
    );

    expect(() => readWorkspaceManifest(path.join(root, WORKSPACE_DIR), SHARED_CONFIG)).toThrow(
      OPT_OUT_KEY,
    );
  });
});

describe("finding a workspace's config", () => {
  it("takes the first extension in the tool's order when several exist", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: { [THING_CONFIG_TS]: IMPORTING_CONFIG, [THING_CONFIG_JS]: IMPORTING_CONFIG },
      },
    ]);
    const workspaceRoot = path.join(root, WORKSPACE_DIR);

    expect([
      findConfig(workspaceRoot, THING_CONFIG),
      findConfig(workspaceRoot, THING_CONFIG_TS_FIRST),
    ]).toStrictEqual([
      path.join(workspaceRoot, THING_CONFIG_JS),
      path.join(workspaceRoot, THING_CONFIG_TS),
    ]);
  });

  it("finds none when no file carries the tool's basename", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [UNRELATED_CONFIG]: IMPORTING_CONFIG } },
    ]);

    expect(findConfig(path.join(root, WORKSPACE_DIR), THING_CONFIG)).toBeUndefined();
  });
});

describe("finding a config's import of the shared package", () => {
  async function configHolding(content: string): Promise<string> {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [THING_CONFIG_JS]: content } },
    ]);

    return path.join(root, WORKSPACE_DIR, THING_CONFIG_JS);
  }

  it("names the entry an import reaches the package through", async () => {
    expect(findSharedImport(await configHolding(IMPORTING_CONFIG), SHARED_CONFIG_PACKAGE)).toBe(
      SHARED_BASE_ENTRY,
    );
  });

  it("counts a re-export of the package itself", async () => {
    expect(findSharedImport(await configHolding(RE_EXPORTING_CONFIG), SHARED_CONFIG_PACKAGE)).toBe(
      SHARED_CONFIG_PACKAGE,
    );
  });

  it("does not count a comment naming the package", async () => {
    expect(
      findSharedImport(await configHolding(COMMENTING_CONFIG), SHARED_CONFIG_PACKAGE),
    ).toBeUndefined();
  });

  it("does not count a package whose name only begins with the shared one's", async () => {
    expect(
      findSharedImport(await configHolding(LOOKALIKE_CONFIG), SHARED_CONFIG_PACKAGE),
    ).toBeUndefined();
  });
});

describe("reading the repository root from an entry point's arguments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the root to the caller when the flag is absent", () => {
    expect(repoRootFromArgv(ARGV_HEAD)).toBeUndefined();
  });

  it("takes the directory after the flag", () => {
    expect(repoRootFromArgv([...ARGV_HEAD, ROOT_FLAG, FIXTURE_ROOT])).toBe(FIXTURE_ROOT);
  });

  it("exits as invalid arguments, saying why, when the flag has no directory after it", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error(EXITED);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => repoRootFromArgv([...ARGV_HEAD, ROOT_FLAG])).toThrow(EXITED);
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.INVALID_ARGS);
    expect(error).toHaveBeenCalledWith(`${ROOT_FLAG} needs a directory`);
  });
});
