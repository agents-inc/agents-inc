import { existsSync, readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { sharedConfigFixtureRepos } from "./shared-config-fixture-repos.js";

const SHARED_CONFIG_PACKAGE = "@workspace/thing-config";
const OPT_OUT_KEY = "//no-shared-thing-config";
const OPT_OUT_REASON = "nothing here is checked by the thing";

const WORKSPACE_DIR = "packages/thing";
const OTHER_WORKSPACE_DIR = "packages/other";

const CONFIG_FILE = "thing.config.js";
const NESTED_CONFIG_FILE = "configs/thing.app.json";
const SOURCE_FILE = "src/deep/thing.ts";

const CONFIG_CONTENT = "export default {};\n";
const NESTED_CONFIG_CONTENT = "{}\n";
const SOURCE_CONTENT = "export const thing = 1;\n";

const { writeFixtureRepo, removeFixtureRepos } = sharedConfigFixtureRepos({
  tempDirPrefix: "shared-config-fixture-repos-",
  sharedConfigPackage: SHARED_CONFIG_PACKAGE,
});

afterEach(removeFixtureRepos);

describe("a fixture repository", () => {
  it("names its workspaces under packages/ in the root manifest", async () => {
    const root = await writeFixtureRepo([]);

    expect(JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"))).toStrictEqual({
      workspaces: ["packages/*"],
    });
  });

  it("gives every workspace a manifest declaring the shared config package", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR },
      { directory: OTHER_WORKSPACE_DIR },
    ]);

    expect(
      JSON.parse(readFileSync(path.join(root, OTHER_WORKSPACE_DIR, "package.json"), "utf-8")),
    ).toStrictEqual({
      name: OTHER_WORKSPACE_DIR,
      devDependencies: { [SHARED_CONFIG_PACKAGE]: "workspace:*" },
    });
  });

  it("leaves the package undeclared and adds the extra keys when the workspace asks", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: OPT_OUT_REASON },
      },
    ]);

    expect(
      JSON.parse(readFileSync(path.join(root, WORKSPACE_DIR, "package.json"), "utf-8")),
    ).toStrictEqual({ name: WORKSPACE_DIR, [OPT_OUT_KEY]: OPT_OUT_REASON });
  });

  it("writes configs and sources at their paths, creating the folders they sit in", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: { [CONFIG_FILE]: CONFIG_CONTENT, [NESTED_CONFIG_FILE]: NESTED_CONFIG_CONTENT },
        sources: { [SOURCE_FILE]: SOURCE_CONTENT },
      },
    ]);
    const workspaceRoot = path.join(root, WORKSPACE_DIR);

    expect([
      readFileSync(path.join(workspaceRoot, CONFIG_FILE), "utf-8"),
      readFileSync(path.join(workspaceRoot, NESTED_CONFIG_FILE), "utf-8"),
      readFileSync(path.join(workspaceRoot, SOURCE_FILE), "utf-8"),
    ]).toStrictEqual([CONFIG_CONTENT, NESTED_CONFIG_CONTENT, SOURCE_CONTENT]);
  });
});

describe("removing the fixture repositories", () => {
  it("deletes every repository written since the last removal", async () => {
    const first = await writeFixtureRepo([{ directory: WORKSPACE_DIR }]);
    const second = await writeFixtureRepo([]);

    await removeFixtureRepos();

    expect([existsSync(first), existsSync(second)]).toStrictEqual([false, false]);
  });
});
