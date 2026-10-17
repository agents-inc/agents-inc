import { describe, expect, it } from "vitest";
import { frozenHomeConstantsIn } from "./frozen-home-declarations.js";

describe("reading the constants that freeze the home directory", () => {
  it("condemns a constant assigned the home directory outright", () => {
    expect(frozenHomeConstantsIn("export const GLOBAL_INSTALL_ROOT = os.homedir();")).toStrictEqual(
      ["GLOBAL_INSTALL_ROOT"],
    );
  });

  it("condemns one derived from the home through a path join", () => {
    expect(
      frozenHomeConstantsIn(
        'export const CACHE_DIR = path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME);',
      ),
    ).toStrictEqual(["CACHE_DIR"]);
  });

  it("condemns it across the line breaks a reformat would introduce", () => {
    expect(
      frozenHomeConstantsIn(
        [
          "export const CACHE_DIR = path.join(",
          "  os.homedir(),",
          '  ".cache",',
          "  DEFAULT_PLUGIN_NAME,",
          ");",
        ].join("\n"),
      ),
    ).toStrictEqual(["CACHE_DIR"]);
  });

  it("names every one a module declares", () => {
    expect(
      frozenHomeConstantsIn(
        [
          "export const GLOBAL_INSTALL_ROOT = os.homedir();",
          "",
          'export const CACHE_DIR = path.join(os.homedir(), ".cache");',
        ].join("\n"),
      ),
    ).toStrictEqual(["GLOBAL_INSTALL_ROOT", "CACHE_DIR"]);
  });

  it("acquits a declared function, which reads the home when it is called", () => {
    expect(
      frozenHomeConstantsIn(
        ["export function globalInstallRoot(): string {", "  return os.homedir();", "}"].join("\n"),
      ),
    ).toStrictEqual([]);
  });

  it("acquits an arrow function for the same reason", () => {
    expect(
      frozenHomeConstantsIn("export const globalPairPaths = () => path.join(os.homedir(), DIR);"),
    ).toStrictEqual([]);
  });

  it("acquits a constant whose own declaration ends before the call", () => {
    expect(
      frozenHomeConstantsIn(
        [
          'export const CACHE_LEAF = ".cache";',
          "",
          "function root() {",
          "  return os.homedir();",
          "}",
        ].join("\n"),
      ),
    ).toStrictEqual([]);
  });

  it("acquits a module-private constant, which reaches no other module", () => {
    expect(frozenHomeConstantsIn("const realHomedir = os.homedir();")).toStrictEqual([]);
  });

  it("acquits a commented-out declaration, which declares nothing", () => {
    expect(frozenHomeConstantsIn("// export const CACHE_DIR = os.homedir();")).toStrictEqual([]);
  });

  it("acquits prose in a doc comment that describes the shape", () => {
    expect(
      frozenHomeConstantsIn(" * `export const CACHE_DIR = os.homedir()` was the frozen form."),
    ).toStrictEqual([]);
  });
});
