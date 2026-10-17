import { describe, expect, it } from "vitest";

import {
  exportedCallablesIn,
  invokedNamesIn,
  isTestSupportModule,
} from "./test-only-invocations.js";

const MODULE_FILE = "installer.ts";
const COMPONENT_FILE = "wizard.tsx";

const EVERY_EXPORT_SHAPE = [
  `export function installEject(): void {}`,
  `export const installPluginConfig = async (): Promise<void> => {};`,
  `export const buildEjectSkillsMap = function (): void {};`,
  ``,
  `function notExported(): void {}`,
  `export default function main(): void {}`,
  `export const EJECT_SOURCE = "eject";`,
  `export type InstallMode = "plugin" | "eject";`,
  ``,
].join("\n");

const BARREL_REEXPORT = [
  `export { installEject } from "./local-installer.js";`,
  `export { installPluginConfig as installConfig } from "./plugin-installer.js";`,
  ``,
].join("\n");

const DOC_COMMENT_LINK = [
  `/**`,
  ` * The plugin path. See {@link installEject} for the eject entry point.`,
  ` */`,
  `export function installPluginConfig(): void {}`,
  ``,
].join("\n");

const BARE_REFERENCE = [
  `import { isSnakeCase } from "./source-validator.js";`,
  ``,
  `export function snakeKeys(keys: string[]): string[] {`,
  `  return keys.filter(isSnakeCase);`,
  `}`,
  ``,
].join("\n");

const DIRECT_CALL = [
  `import { installEject } from "./local-installer.js";`,
  ``,
  `export async function run(): Promise<void> {`,
  `  await installEject();`,
  `}`,
  ``,
].join("\n");

const IMPORT_WITHOUT_USE = [`import { installEject } from "./local-installer.js";`, ``].join("\n");

const KEYS_AND_SHORTHAND = [
  `const modes = { installEject: 1 };`,
  `const reached = plugin.installEject;`,
  `const forwarded = { installPluginConfig };`,
  ``,
].join("\n");

const TYPE_POSITION = [
  `import type { installEject } from "./local-installer.js";`,
  ``,
  `let handler: typeof installEject;`,
  `type Handlers = Array<installEject>;`,
  ``,
].join("\n");

const DYNAMIC_IMPORT = [
  `export async function gate(): Promise<void> {`,
  `  const { loadAgentDefs } = await import("../operations/project/load-agent-defs.js");`,
  `  await loadAgentDefs();`,
  `}`,
  ``,
].join("\n");

const JSX_ELEMENT = [
  `import { Wizard } from "./wizard-layout.js";`,
  `import { onSelectSkill } from "./handlers.js";`,
  ``,
  `export const Screen = (): JSX.Element => <Wizard onSelect={onSelectSkill} />;`,
  ``,
].join("\n");

const SHIPPED_MODULES = [
  "src/cli/lib/installation/local-installer.ts",
  "src/cli/commands/init.tsx",
  "src/cli/lib/testing/dist-staleness.ts",
  "scripts/check-enumeration-drift.ts",
  "tsup.config.ts",
];

const TEST_SUPPORT_MODULES = [
  "src/cli/lib/installation/local-installer.test.ts",
  "src/cli/components/common/summary-panel.test.tsx",
  "src/cli/lib/__tests__/helpers/test-only-invocations.ts",
  "src/cli/lib/__mocks__/logger.ts",
  "e2e/pages/dashboard-session.ts",
  "scripts/check-enumeration-drift.test.ts",
  "vitest.global-setup.ts",
];

describe("the callables a module offers", () => {
  it("names each function-valued export and nothing else it declares", () => {
    expect(exportedCallablesIn(EVERY_EXPORT_SHAPE, MODULE_FILE)).toStrictEqual([
      "installEject",
      "installPluginConfig",
      "buildEjectSkillsMap",
    ]);
  });

  it("finds nothing in a barrel, which declares nothing of its own", () => {
    expect(exportedCallablesIn(BARREL_REEXPORT, MODULE_FILE)).toStrictEqual([]);
  });
});

describe("the names a file invokes", () => {
  it("reads a direct call", () => {
    expect(invokedNamesIn(DIRECT_CALL, MODULE_FILE)).toContain("installEject");
  });

  it("reads a bare name handed to a higher-order function", () => {
    expect(
      invokedNamesIn(BARE_REFERENCE, MODULE_FILE),
      "a reader keying on `name(` condemns every function passed rather than called",
    ).toContain("isSnakeCase");
  });

  it("reads a name a lazily-loaded module was destructured out of", () => {
    expect(invokedNamesIn(DYNAMIC_IMPORT, MODULE_FILE)).toContain("loadAgentDefs");
  });

  it("reads a rendered component and a handed-over callback, and not the attribute naming it", () => {
    expect(invokedNamesIn(JSX_ELEMENT, COMPONENT_FILE)).toStrictEqual(["Wizard", "onSelectSkill"]);
  });

  it("reads object shorthand, which names a key and reaches a binding at once", () => {
    expect(invokedNamesIn(KEYS_AND_SHORTHAND, MODULE_FILE)).toStrictEqual([
      "plugin",
      "installPluginConfig",
    ]);
  });

  it("leaves a barrel re-export alone, in both spellings", () => {
    expect(
      invokedNamesIn(BARREL_REEXPORT, MODULE_FILE),
      "a re-export forwards a name and calls nothing, which is how two dead symbols read as reached",
    ).toStrictEqual([]);
  });

  it("leaves a name that appears only in a doc comment alone", () => {
    expect(invokedNamesIn(DOC_COMMENT_LINK, MODULE_FILE)).toStrictEqual([]);
  });

  it("leaves an import nothing goes on to use alone", () => {
    expect(invokedNamesIn(IMPORT_WITHOUT_USE, MODULE_FILE)).toStrictEqual([]);
  });

  it("leaves a name in a type position alone", () => {
    expect(invokedNamesIn(TYPE_POSITION, MODULE_FILE)).toStrictEqual([]);
  });
});

describe("whether a path is test support", () => {
  it("calls a shipped module, a script and a build config production", () => {
    expect(SHIPPED_MODULES.filter(isTestSupportModule)).toStrictEqual([]);
  });

  it("calls a spec, the machinery directories, the harness and the runner test support", () => {
    expect(
      TEST_SUPPORT_MODULES.filter((file) => !isTestSupportModule(file)),
      "a test-support module read as production keeps every symbol it touches out of the roster",
    ).toStrictEqual([]);
  });
});
