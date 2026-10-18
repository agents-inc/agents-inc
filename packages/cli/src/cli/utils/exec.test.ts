import { describe, expect, it } from "vitest";

import {
  execCommand,
  validateMarketplaceSource,
  validatePluginName,
  validatePluginPath,
} from "./exec.js";

/** A shell metacharacter between two safe runs, so neither end alone decides the verdict. */
const SHELL_IN_THE_MIDDLE = "web$evil";

/** The longest plugin name allowed, written out rather than read off the product. */
const LONGEST_PLUGIN_NAME = "p".repeat(256);

describe("validatePluginName", () => {
  it("takes a scoped, versioned name", () => {
    expect(() => validatePluginName("@acme/web-framework-react.v2")).not.toThrow();
  });

  it("refuses a shell character inside a name, saying what a name may contain", () => {
    expect(() => validatePluginName(SHELL_IN_THE_MIDDLE)).toThrow(
      'Plugin name contains invalid characters: "web$evil"\nNames may only contain alphanumeric characters, dashes, underscores, dots, @, and slashes.',
    );
  });

  it("takes a name exactly as long as the limit and refuses one longer", () => {
    expect(() => validatePluginName(LONGEST_PLUGIN_NAME)).not.toThrow();
    expect(() => validatePluginName(`${LONGEST_PLUGIN_NAME}p`)).toThrow(
      "Plugin name is too long (257 characters, max 256).",
    );
  });
});

describe("validatePluginPath", () => {
  it("takes a home-relative path with a version after a colon", () => {
    expect(() => validatePluginPath("~/.claude/plugins/cache/acme:1.0.0")).not.toThrow();
  });

  it("refuses a shell character inside a path, saying what a path may contain", () => {
    expect(() => validatePluginPath(SHELL_IN_THE_MIDDLE)).toThrow(
      'Plugin path contains invalid characters: "web$evil"\nPlugin paths may only contain alphanumeric characters, dashes, underscores, dots, slashes, @, and colons.',
    );
  });
});

describe("validateMarketplaceSource", () => {
  it("refuses a source of nothing but spaces as empty", () => {
    expect(() => validateMarketplaceSource("   ")).toThrow("Marketplace must not be empty.");
  });

  it("refuses a shell character inside a remote source, saying what one may contain", () => {
    expect(() => validateMarketplaceSource(SHELL_IN_THE_MIDDLE)).toThrow(
      'Marketplace contains invalid characters: "web$evil"\nMarketplaces may only contain alphanumeric characters, dashes, underscores, dots, slashes, @, and colons.',
    );
  });

  it.each(["./my marketplace", "../shared marketplace", "/home/me/My Marketplace"])(
    "takes a directory on this machine whatever its name holds: %s",
    (source) => {
      expect(() => validateMarketplaceSource(source)).not.toThrow();
    },
  );

  it("does not read a './' inside a remote source as a directory", () => {
    expect(() => validateMarketplaceSource("acme/./my skills")).toThrow(
      "Marketplace contains invalid characters",
    );
  });
});

describe("execCommand", () => {
  it("gives the child no input, so one that reads it to the end finishes", async () => {
    const result = await execCommand(process.execPath, [
      "-e",
      "process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write('read to the end'); });",
    ]);

    expect(result).toStrictEqual({ stdout: "read to the end", stderr: "", exitCode: 0 });
  });
});
