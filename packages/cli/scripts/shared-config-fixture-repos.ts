/** Throwaway repositories for the specs of the shared-config checkers `bun run deps:check` runs. */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { typedEntries } from "../src/cli/utils/typed-object.js";

const WORKSPACE_GLOBS = ["packages/*"];
const DECLARED_VERSION = "workspace:*";

/** Declares the shared config package unless `declaresSharedConfig` is `false`. */
export type FixtureWorkspace = {
  directory: string;
  declaresSharedConfig?: boolean;
  manifestExtras?: Record<string, string>;
  configs?: Record<string, string>;
  sources?: Record<string, string>;
};

export type SharedConfigFixtureRepos = {
  writeFixtureRepo: (workspaces: FixtureWorkspace[]) => Promise<string>;
  removeFixtureRepos: () => Promise<void>;
};

export function sharedConfigFixtureRepos({
  tempDirPrefix,
  sharedConfigPackage,
}: {
  tempDirPrefix: string;
  sharedConfigPackage: string;
}): SharedConfigFixtureRepos {
  const roots: string[] = [];

  return {
    writeFixtureRepo: async (workspaces) => {
      const root = await createTempDir(tempDirPrefix);
      roots.push(root);

      writeJson(path.join(root, "package.json"), { workspaces: WORKSPACE_GLOBS });
      for (const workspace of workspaces) {
        writeWorkspace(path.join(root, workspace.directory), workspace, sharedConfigPackage);
      }

      return root;
    },
    removeFixtureRepos: async () => {
      await Promise.all(roots.splice(0).map(cleanupTempDir));
    },
  };
}

function writeWorkspace(
  workspaceRoot: string,
  workspace: FixtureWorkspace,
  sharedConfigPackage: string,
): void {
  mkdirSync(workspaceRoot, { recursive: true });

  writeJson(path.join(workspaceRoot, "package.json"), {
    name: workspace.directory,
    ...(workspace.declaresSharedConfig === false
      ? {}
      : { devDependencies: { [sharedConfigPackage]: DECLARED_VERSION } }),
    ...workspace.manifestExtras,
  });

  for (const [file, content] of typedEntries({ ...workspace.configs, ...workspace.sources })) {
    const filePath = path.join(workspaceRoot, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

export function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
