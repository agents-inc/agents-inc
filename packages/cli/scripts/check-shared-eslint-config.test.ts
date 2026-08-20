/**
 * Contract for `scripts/check-shared-eslint-config.ts` — the cross-workspace check that every
 * workspace holding an ESLint config either extends `@workspace/eslint-config` or records why it
 * does not.
 *
 * Two halves, like both of its siblings. The first drives the check against fixture repositories,
 * because the shapes that matter (a config composing typescript-eslint by hand, a re-export, a
 * config that names the shared package only in the comment explaining itself, an opt-out) cannot
 * all exist in this repository at once. The second runs it against this repository, which is the
 * assertion that actually holds the rule.
 */
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  MISSING_DEPENDENCY,
  NO_SHARED_IMPORT,
  NO_WORKSPACES,
  OPT_OUT_KEY,
  SHARED_CONFIG_PACKAGE,
  UNDECLARED_CONFIG_LESS,
} from "./check-shared-eslint-config.js";

const RUNNER = path.resolve(import.meta.dirname, "run-check-shared-eslint-config.ts");
const ROOT_FLAG = "--root";

const WORKSPACE_GLOBS = ["packages/*"];
const WORKSPACE_DIR = "packages/thing";
const SHARED_BASE_ENTRY = `${SHARED_CONFIG_PACKAGE}/base`;

const ESLINT_CONFIG_JS = "eslint.config.js";
const ESLINT_CONFIG_MJS = "eslint.config.mjs";
const ESLINT_CONFIG_TS = "eslint.config.ts";

const DECLARED_VERSION = "workspace:*";
const OPT_OUT_REASON =
  "an Astro-only workspace — the shared base matches nothing here, and .astro needs a parser the shared package does not ship";

const EXTENDING_CONFIG = [
  `import { baseConfig, typeCheckedConfig } from "${SHARED_BASE_ENTRY}"`,
  `import { defineConfig } from "eslint/config"`,
  ``,
  `export default defineConfig([...baseConfig, ...typeCheckedConfig(import.meta.dirname)])`,
].join("\n");

const RE_EXPORTING_CONFIG = `export { baseConfig as default } from "${SHARED_BASE_ENTRY}"\n`;

/** What packages/cli carried until CLI-427: the shared set composed by hand, one addition short. */
const RESTATING_CONFIG = [
  `import js from "@eslint/js"`,
  `import tseslint from "typescript-eslint"`,
  `import { defineConfig } from "eslint/config"`,
  ``,
  `export default defineConfig([`,
  `  { files: ["src/**/*.ts"], extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked] },`,
  `])`,
].join("\n");

const CONFIG_NAMING_THE_SHARED_PACKAGE_IN_A_COMMENT = [
  `import { defineConfig } from "eslint/config"`,
  ``,
  `// Standalone rather than ${SHARED_BASE_ENTRY}: nothing here is TypeScript.`,
  `export default defineConfig([{ files: ["**/*.js"] }])`,
].join("\n");

/** What a config-less workspace has to hold for its missing config to need declaring. */
const TYPESCRIPT_SOURCE = "src/thing.ts";
const DECLARATION_FILE = "node.d.ts";
const PLAIN_JAVASCRIPT = "node.js";

const TYPESCRIPT_CONTENT = `export const thing = 1\n`;
const JAVASCRIPT_CONTENT = `export const thing = 1\n`;

const CONFIG_LESS_OPT_OUT_REASON =
  "the only TypeScript here is a hand-written declaration file — read by scripts/check-shared-eslint-config.ts";

/** One workspace to write into a fixture repository. */
type FixtureWorkspace = {
  directory: string;
  declaresSharedConfig?: boolean;
  manifestExtras?: Record<string, string>;
  configs?: Record<string, string>;
  sources?: Record<string, string>;
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureRepo(workspaces: FixtureWorkspace[]): Promise<string> {
  const root = await createTempDir("shared-eslint-config-");
  roots.push(root);

  writeJson(path.join(root, "package.json"), { workspaces: WORKSPACE_GLOBS });

  for (const workspace of workspaces) {
    const workspaceRoot = path.join(root, workspace.directory);
    mkdirSync(workspaceRoot, { recursive: true });

    writeJson(path.join(workspaceRoot, "package.json"), {
      name: workspace.directory,
      ...(workspace.declaresSharedConfig === false
        ? {}
        : { devDependencies: { [SHARED_CONFIG_PACKAGE]: DECLARED_VERSION } }),
      ...workspace.manifestExtras,
    });

    for (const [file, content] of Object.entries(workspace.configs ?? {})) {
      writeFileSync(path.join(workspaceRoot, file), content);
    }

    for (const [file, content] of Object.entries(workspace.sources ?? {})) {
      const sourcePath = path.join(workspaceRoot, file);
      mkdirSync(path.dirname(sourcePath), { recursive: true });
      writeFileSync(sourcePath, content);
    }
  }

  return root;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("a workspace whose eslint config stands alone", () => {
  it("is reported when it composes the shared set by hand, and the check is not clean", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_JS]: RESTATING_CONFIG } },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_IMPORT] }],
    });
  });

  it("is reported when it only names the shared package in a comment", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: { [ESLINT_CONFIG_JS]: CONFIG_NAMING_THE_SHARED_PACKAGE_IN_A_COMMENT },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_IMPORT] },
    ]);
  });

  it("is reported when it extends the shared config without declaring the package", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { [ESLINT_CONFIG_JS]: EXTENDING_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [MISSING_DEPENDENCY] },
    ]);
  });

  it("reports both problems when the config and the manifest have each drifted", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { [ESLINT_CONFIG_JS]: RESTATING_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      {
        workspace: WORKSPACE_DIR,
        outcome: "diverged",
        problems: [NO_SHARED_IMPORT, MISSING_DEPENDENCY],
      },
    ]);
  });
});

describe("a workspace whose eslint config reaches the shared one", () => {
  it("is bound when it spreads the shared config into its own", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_JS]: EXTENDING_CONFIG } },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_BASE_ENTRY }],
    });
  });

  it("is bound when its whole config is a re-export of the shared one", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_JS]: RE_EXPORTING_CONFIG } },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_BASE_ENTRY },
    ]);
  });

  it("is bound when the config carries one of eslint's other extensions", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_MJS]: EXTENDING_CONFIG } },
      { directory: "packages/other", configs: { [ESLINT_CONFIG_TS]: EXTENDING_CONFIG } },
    ]);

    // Sorted, as `findWorkspaces` returns them: "other" before "thing".
    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: "packages/other", outcome: "bound", via: SHARED_BASE_ENTRY },
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_BASE_ENTRY },
    ]);
  });
});

describe("a workspace that holds no eslint config at all", () => {
  it("is not judged, and is not asked to declare a package it would never import", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, declaresSharedConfig: false },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "no-config" }],
    });
  });

  it("is still not judged when the only files it holds are JavaScript", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        sources: { [PLAIN_JAVASCRIPT]: JAVASCRIPT_CONTENT },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "no-config" },
    ]);
  });
});

/**
 * The config-less set stopped being uninteresting on 2026-08-08, when the root `lint-staged` block
 * began naming it as a literal glob. ESLint fails a whole invocation when it cannot resolve a config
 * for ONE of the files it was handed, so a config-less `.ts` file takes down every staged file
 * beside it — which makes "which workspaces have no config" a fact something depends on, and a
 * silent skip the wrong answer for a workspace ESLint could actually be handed a file from.
 */
describe("a workspace that holds TypeScript and no eslint config", () => {
  it("is reported, because a config-less .ts file fails every invocation it is handed to", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        sources: { [TYPESCRIPT_SOURCE]: TYPESCRIPT_CONTENT },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [
        { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [UNDECLARED_CONFIG_LESS] },
      ],
    });
  });

  it("is reported when the only TypeScript is a declaration file", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        sources: { [DECLARATION_FILE]: TYPESCRIPT_CONTENT, [PLAIN_JAVASCRIPT]: JAVASCRIPT_CONTENT },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [UNDECLARED_CONFIG_LESS] },
    ]);
  });

  it("is excused once it records why, and its reason is carried through", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: CONFIG_LESS_OPT_OUT_REASON },
        sources: { [DECLARATION_FILE]: TYPESCRIPT_CONTENT },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [
        { workspace: WORKSPACE_DIR, outcome: "opted-out", reason: CONFIG_LESS_OPT_OUT_REASON },
      ],
    });
  });
});

describe("a workspace that records why it stands alone", () => {
  it("is excused, and its reason is carried through", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: OPT_OUT_REASON },
        configs: { [ESLINT_CONFIG_JS]: RESTATING_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "opted-out", reason: OPT_OUT_REASON }],
    });
  });
});

describe("the entry point", () => {
  // Spawned rather than imported: the exit code is the thing under test, and the runner sets it at
  // module scope. `bun` is what runs every script in this package and what CI installs, so it is
  // available wherever this suite is.
  it("exits non-zero and names the workspace when one has diverged", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_JS]: RESTATING_CONFIG } },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(WORKSPACE_DIR);
    expect(result.stderr).toContain(NO_SHARED_IMPORT);
    expect(result.stderr, "the message must say how to record a deliberate divergence").toContain(
      OPT_OUT_KEY,
    );
  });

  it("exits zero when every workspace is bound", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [ESLINT_CONFIG_JS]: EXTENDING_CONFIG } },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(SHARED_CONFIG_PACKAGE);
  });

  // The floor that makes this test possible lives in `check()` rather than in this file, so every
  // caller inherits it. With it here only, all three runners printed `✓ 0 workspaces` and exited 0
  // against a root whose globs match nothing — and `bun run deps:check` is what CI and both hooks
  // run, so the gate a fixture-less root reached was a green one.
  it("exits non-zero on a root matching no workspace, rather than reporting zero of them clean", async () => {
    const root = await writeFixtureRepo([]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(NO_WORKSPACES);
  });
});

describe("this repository", () => {
  it("binds every workspace that holds an eslint config, the CLI included", () => {
    const bound = check()
      .verdicts.filter((verdict) => verdict.outcome === "bound")
      .map((verdict) => verdict.workspace);

    expect(bound).toContain("apps/editor");
    expect(bound).toContain("apps/server");
    expect(bound).toContain("apps/www");
    expect(bound).toContain("packages/api-mocks");
    expect(bound).toContain("packages/matrix");
    expect(bound).toContain("packages/ui");
    expect(
      bound,
      "composing the shared set by hand is what left one of its rules unconfigured here",
    ).toContain("packages/cli");
  });

  it("does not judge the config packages, which hold no eslint config and no TypeScript", () => {
    const unjudged = check()
      .verdicts.filter((verdict) => verdict.outcome === "no-config")
      .map((verdict) => verdict.workspace);

    // Named rather than counted. A list pinned to today's membership is a limit that breaks the
    // next time the repository grows a workspace, which says nothing about this rule.
    expect(unjudged).toContain("packages/eslint-config");
    expect(unjudged).toContain("packages/prettier-config");
    expect(unjudged).toContain("packages/typescript-config");
  });

  it("makes the one config-less workspace holding TypeScript say so", () => {
    const excused = check()
      .verdicts.filter((verdict) => verdict.outcome === "opted-out")
      .map((verdict) => verdict.workspace);

    // The set of config-less workspaces is load-bearing: the root package.json's lint-staged block
    // routes around this one by name. Silence would leave that literal with nothing to check
    // against, which is why a config-less workspace holding TypeScript is judged and its three
    // siblings are not.
    expect(
      excused,
      "the workspace the root lint-staged glob excludes must declare why it has no eslint config",
    ).toContain("packages/vitest-config");
  });

  it("has no workspace whose eslint config extends nothing and says nothing about it", () => {
    const { clean, verdicts } = check();

    expect(
      verdicts.filter((verdict) => verdict.outcome === "diverged"),
      "every eslint config must extend the shared config or record why it does not",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
