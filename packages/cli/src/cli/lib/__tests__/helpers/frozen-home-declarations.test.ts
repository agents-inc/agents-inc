import { describe, expect, it } from "vitest";
import { frozenHomeConstantsIn } from "./frozen-home-declarations.js";

/**
 * The reader's own tests. It is held against the real `src/cli/` tree by the gate in
 * `../home-dir-read-at-call-time.test.ts`; what is proved here is that it condemns the shapes
 * that actually shipped and acquits the ones the codebase uses instead.
 *
 * **The acquittals are the half that matters.** The tree has no frozen constant left in it, so
 * the gate over the real source is an assertion of absence and would read green for a reader
 * that condemned nothing at all. Only these discriminating cases tell a working recogniser
 * apart from one that answers `[]` to everything.
 *
 * Each fixture is a declaration as it is written in source — the `export`, the semicolon, the
 * line breaks — because the punctuation is what bounds a declaration, and a fixture without it
 * would prove the reader works on a shape no module takes.
 */
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

  /**
   * The form prettier produces once the arguments no longer fit a line — the same defect one
   * reformat away from the case above, and the one a `.`-based expression would miss, because
   * `.` does not cross a newline and `[^;]` does.
   */
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

  /**
   * The bound that stops a declaration from claiming a later statement. Without it a constant
   * anywhere above an unrelated `os.homedir()` call would be reported, and the gate would name
   * innocent constants until somebody stopped believing it.
   */
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
