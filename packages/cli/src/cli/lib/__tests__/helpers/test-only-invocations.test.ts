/**
 * Contract for `test-only-invocations.ts` — the two readers that say which callables a module
 * OFFERS and which names a file INVOKES.
 *
 * Every fixture below is a shape that was measured rather than imagined. Three of them killed the
 * census that preceded this reader: a barrel's re-export and a doc comment's link tag both
 * read as production references and hid two dead symbols, and a bare `.filter(name)` reference
 * read as no invocation at all and condemned a live one. The reader is driven against source text
 * so all three can be planted — a scan whose only input is a tree with nothing wrong in it has
 * never been shown to report anything.
 */
import { describe, expect, it } from "vitest";

import {
  exportedCallablesIn,
  invokedNamesIn,
  isTestSupportModule,
} from "./test-only-invocations.js";

/** What the fixtures are parsed as, one per script kind the package holds. */
const MODULE_FILE = "installer.ts";
const COMPONENT_FILE = "wizard.tsx";

/**
 * A module's export list: a function declaration, both function-valued const forms, and four
 * shapes that are exported and are not a callable this reader can name.
 */
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

/**
 * A barrel, in both spellings. It declares nothing of its own and keeps nothing alive, and the
 * one in `installation/index.ts` is why the census reported `installEject` as reached.
 */
const BARREL_REEXPORT = [
  `export { installEject } from "./local-installer.js";`,
  `export { installPluginConfig as installConfig } from "./plugin-installer.js";`,
  ``,
].join("\n");

/**
 * A doc comment naming the symbol, which is the other half of that miss. A comment contributes
 * no identifier to the syntax tree, so this fixture proves the reader is reading the tree.
 */
const DOC_COMMENT_LINK = [
  `/**`,
  ` * The plugin path. See {@link installEject} for the eject entry point.`,
  ` */`,
  `export function installPluginConfig(): void {}`,
  ``,
].join("\n");

/**
 * A bare name handed to a higher-order function — `isSnakeCase` is passed exactly this way in
 * `source-validator.ts`, and was reported dead by a reader keying on `name(`.
 */
const BARE_REFERENCE = [
  `import { isSnakeCase } from "./source-validator.js";`,
  ``,
  `export function snakeKeys(keys: string[]): string[] {`,
  `  return keys.filter(isSnakeCase);`,
  `}`,
  ``,
].join("\n");

/** The ordinary shape, so the fixtures above are read against one that plainly does invoke. */
const DIRECT_CALL = [
  `import { installEject } from "./local-installer.js";`,
  ``,
  `export async function run(): Promise<void> {`,
  `  await installEject();`,
  `}`,
  ``,
].join("\n");

/** An import nothing goes on to use. Lint sees this one; the roster must not read it as a call. */
const IMPORT_WITHOUT_USE = [`import { installEject } from "./local-installer.js";`, ``].join("\n");

/**
 * The three places a name is a KEY rather than a binding, and the one place it is both. Object
 * shorthand writes a property's name and reads the binding of that name in one token.
 */
const KEYS_AND_SHORTHAND = [
  `const modes = { installEject: 1 };`,
  `const reached = plugin.installEject;`,
  `const forwarded = { installPluginConfig };`,
  ``,
].join("\n");

/** A name in a type position, which is erased and calls nothing. */
const TYPE_POSITION = [
  `import type { installEject } from "./local-installer.js";`,
  ``,
  `let handler: typeof installEject;`,
  `type Handlers = Array<installEject>;`,
  ``,
].join("\n");

/**
 * A lazily-loaded module, which is how `config-gate/index.ts` reaches its loaders. The
 * destructured binding is a declaration; the call under it is the invocation.
 */
const DYNAMIC_IMPORT = [
  `export async function gate(): Promise<void> {`,
  `  const { loadAgentDefs } = await import("../operations/project/load-agent-defs.js");`,
  `  await loadAgentDefs();`,
  `}`,
  ``,
].join("\n");

/** A rendered component and a handed-over callback, beside an attribute name that is neither. */
const JSX_ELEMENT = [
  `import { Wizard } from "./wizard-layout.js";`,
  `import { onSelectSkill } from "./handlers.js";`,
  ``,
  `export const Screen = (): JSX.Element => <Wizard onSelect={onSelectSkill} />;`,
  ``,
].join("\n");

/** Paths a module reaches this package's users through. */
const SHIPPED_MODULES = [
  "src/cli/lib/installation/local-installer.ts",
  "src/cli/commands/init.tsx",
  "src/cli/lib/testing/dist-staleness.ts",
  "scripts/check-enumeration-drift.ts",
  "tsup.config.ts",
];

/** Paths that exist for the suite: specs, the machinery directories, the harness, the runner. */
const TEST_SUPPORT_MODULES = [
  "src/cli/lib/installation/local-installer.test.ts",
  "src/cli/components/wizard/source-grid.test.tsx",
  "src/cli/lib/__tests__/helpers/test-only-invocations.ts",
  "src/cli/lib/__mocks__/logger.ts",
  "e2e/pages/steps/build-step.ts",
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
