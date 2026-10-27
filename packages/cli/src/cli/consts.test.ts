import { cp, mkdir, realpath, symlink } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STANDARD_FILES } from "./consts.js";
import { cleanupTempDir, createTempDir } from "./lib/__tests__/test-fs-utils.js";

/** The worker the CLI reads shared configurations from; where it runs decides the editor. */
const WORKER_ADDRESS_VARIABLE = "AGENTS_INC_API_URL";

/** The editor's dev server, the one a worker running on this machine lets in. */
const LOCAL_EDITOR = "http://localhost:5173/editor";

const LIVE_EDITOR = "https://agentsinc.sh/editor";

const SHARE_ID = "Ab3xY9_Q";

async function constsBeside(workerAddress: string | undefined) {
  vi.stubEnv(WORKER_ADDRESS_VARIABLE, workerAddress);
  vi.resetModules();
  return import("./consts.js");
}

describe("the editor the CLI links to", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A literal: it is the address every user's printed link opens.
  it("is the live editor when no worker address is set", async () => {
    const { EDITOR_URL, editorConfigUrl } = await constsBeside(undefined);

    expect(EDITOR_URL).toBe(LIVE_EDITOR);
    expect(editorConfigUrl(SHARE_ID)).toBe(`${LIVE_EDITOR}/?fromId=${SHARE_ID}`);
  });

  it.each(["https://api.agentsinc.sh", "https://localhost.example.com", "http://127.example.com"])(
    "is the live editor beside a worker at %s, which is not this machine",
    async (workerAddress) => {
      const { EDITOR_URL, editorConfigUrl } = await constsBeside(workerAddress);

      expect(EDITOR_URL).toBe(LIVE_EDITOR);
      expect(editorConfigUrl(SHARE_ID)).toBe(`${LIVE_EDITOR}/?fromId=${SHARE_ID}`);
    },
  );

  it.each([
    "http://localhost:8787",
    "http://LOCALHOST:8787",
    "http://127.0.0.1:8787",
    "http://127.0.0.2:1",
    "http://[::1]:8787",
  ])(
    "is the local editor, shared-configuration links included, beside a worker at %s",
    async (workerAddress) => {
      const { EDITOR_URL, editorConfigUrl } = await constsBeside(workerAddress);

      expect(EDITOR_URL).toBe(LOCAL_EDITOR);
      expect(editorConfigUrl(SHARE_ID)).toBe(`${LOCAL_EDITOR}/?fromId=${SHARE_ID}`);
    },
  );
});

describe("the editor the help text names", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, "agentsinc.sh/editor"],
    ["https://api.agentsinc.sh", "agentsinc.sh/editor"],
    ["http://localhost:8787", "localhost:5173/editor"],
    ["http://[::1]:8787", "localhost:5173/editor"],
  ])("beside a worker at %s, is %s", async (workerAddress, address) => {
    const { EDITOR_ADDRESS } = await constsBeside(workerAddress);

    expect(EDITOR_ADDRESS).toBe(address);
  });
});

/** This package as a contributor checks it out: `src/` and `package.json` sit here. */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The workspace's installed dependencies, which a copied package links rather than reinstalls. */
const WORKSPACE_DEPENDENCIES = path.resolve(PACKAGE_ROOT, "../../node_modules");

const SOURCE_FOLDER = "src";

const BUILD_FOLDER = "dist";

const DEPENDENCIES_FOLDER = "node_modules";

const PACKAGE_FOLDER = "agents-inc";

const CONSTS_SOURCE = "src/cli/consts.ts";

/** Where the build puts this module: tsup bundles it into a chunk at the top of `dist/`. */
const CONSTS_BUILT = "dist/consts.ts";

/** `<parent>/agents-inc`, holding `package.json` and a link to the workspace's dependencies. */
async function packageFolderUnder(parent: string): Promise<string> {
  const packageFolder = path.join(parent, PACKAGE_FOLDER);
  await mkdir(packageFolder, { recursive: true });
  await cp(
    path.join(PACKAGE_ROOT, STANDARD_FILES.PACKAGE_JSON),
    path.join(packageFolder, STANDARD_FILES.PACKAGE_JSON),
  );
  await symlink(WORKSPACE_DEPENDENCIES, path.join(packageFolder, DEPENDENCIES_FOLDER));
  return packageFolder;
}

/**
 * This package's source copied in as real files. A symlinked checkout would not do: the module
 * runner resolves a link to the folder it points at, outside `parent`.
 */
async function checkOutUnder(parent: string): Promise<string> {
  const checkout = await packageFolderUnder(parent);
  await cp(path.join(PACKAGE_ROOT, SOURCE_FOLDER), path.join(checkout, SOURCE_FOLDER), {
    recursive: true,
  });
  return checkout;
}

/** This package as the build lays it out, with this module where the bundle puts it. */
async function buildUnder(parent: string): Promise<string> {
  const built = await packageFolderUnder(parent);
  await mkdir(path.join(built, BUILD_FOLDER));
  await cp(path.join(PACKAGE_ROOT, CONSTS_SOURCE), path.join(built, CONSTS_BUILT));
  return built;
}

async function projectRootRunFrom(moduleFile: string): Promise<string> {
  // Parse boundary: a dynamic import of a computed specifier carries no static type.
  const consts = (await import(pathToFileURL(moduleFile).href)) as { PROJECT_ROOT: string };
  return consts.PROJECT_ROOT;
}

describe("the package root the CLI reads its own files from", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await realpath(await createTempDir("package-root-"));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("run from a source checkout under folders none of whose names starts with dist, is the checkout", async () => {
    const checkout = await checkOutUnder(path.join(tempDir, "projects"));

    expect(await projectRootRunFrom(path.join(checkout, CONSTS_SOURCE))).toBe(checkout);
  });

  it.each(["dist", "distributions"])(
    "run from a source checkout under a folder named %s, is the checkout",
    async (folder) => {
      const checkout = await checkOutUnder(path.join(tempDir, folder));

      expect(
        await projectRootRunFrom(path.join(checkout, CONSTS_SOURCE)),
        "a folder above a source checkout is not the build folder, so the root is not one level up from src/cli/",
      ).toBe(checkout);
    },
  );

  it.each(["projects", "dist"])(
    "run from the build under a folder named %s, is the folder dist/ sits in",
    async (folder) => {
      const built = await buildUnder(path.join(tempDir, folder));

      expect(await projectRootRunFrom(path.join(built, CONSTS_BUILT))).toBe(built);
    },
  );
});
