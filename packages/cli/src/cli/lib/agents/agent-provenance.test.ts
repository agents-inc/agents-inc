import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  cliVersion,
  hasProvenanceMarker,
  provenanceMarker,
  stampProvenanceMarker,
} from "./agent-provenance";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Two versions rather than one: the marker carries a version, so "does not stack" and
 * "does not accumulate across releases" are different claims and each needs its own pair.
 */
const VERSION = "1.2.3";
const LATER_VERSION = "1.3.0";

/** The shape the Liquid template renders: frontmatter, a blank line, then the body. */
const COMPILED_AGENT = [
  "---",
  "name: web-developer",
  "description: A test agent",
  "---",
  "",
  "# Web Developer Agent",
  "",
  "body",
].join("\n");

/** The same shape with no marker — what a user's own agent file looks like. */
const HAND_WRITTEN_AGENT = ["---", "name: my-custom-agent", "---", "", "# Mine"].join("\n");

const BODY_WITHOUT_FRONTMATTER = ["# Mine", "", "body"].join("\n");

describe("agent provenance marker", () => {
  it("carries this package's own version", async () => {
    const pkg = JSON.parse(await readFile(path.join(CLI_ROOT, "package.json"), "utf8")) as {
      version: string;
    };

    expect(await cliVersion()).toBe(pkg.version);
    expect(provenanceMarker(await cliVersion())).toContain(`v${pkg.version}`);
  });

  it("goes on the first line after the frontmatter", () => {
    expect(stampProvenanceMarker(COMPILED_AGENT, VERSION)).toBe(
      [
        "---",
        "name: web-developer",
        "description: A test agent",
        "---",
        provenanceMarker(VERSION),
        "",
        "# Web Developer Agent",
        "",
        "body",
      ].join("\n"),
    );
  });

  it("goes on the first line when there is no frontmatter to follow", () => {
    expect(stampProvenanceMarker(BODY_WITHOUT_FRONTMATTER, VERSION)).toBe(
      [provenanceMarker(VERSION), ...BODY_WITHOUT_FRONTMATTER.split("\n")].join("\n"),
    );
  });

  it("is a fixed point — stamping already-stamped content changes nothing", () => {
    const stamped = stampProvenanceMarker(COMPILED_AGENT, VERSION);

    expect(stampProvenanceMarker(stamped, VERSION)).toBe(stamped);
  });

  it("replaces an earlier version's marker instead of stacking a second one", () => {
    const stampedByOldRelease = stampProvenanceMarker(COMPILED_AGENT, VERSION);

    expect(stampProvenanceMarker(stampedByOldRelease, LATER_VERSION)).toBe(
      stampProvenanceMarker(COMPILED_AGENT, LATER_VERSION),
    );
  });

  it("recognises the marker it emits, at any version", () => {
    expect(hasProvenanceMarker(stampProvenanceMarker(COMPILED_AGENT, VERSION))).toBe(true);
    expect(hasProvenanceMarker(stampProvenanceMarker(COMPILED_AGENT, LATER_VERSION))).toBe(true);
  });

  it("does not recognise an agent nothing stamped", () => {
    expect(hasProvenanceMarker(HAND_WRITTEN_AGENT)).toBe(false);
    expect(hasProvenanceMarker(BODY_WITHOUT_FRONTMATTER)).toBe(false);
  });

  /**
   * The marker's position is its contract — an agent that merely quotes the line further
   * down (a prompt about this very feature, say) was not compiled by this CLI, and a sweep
   * that read it as provenance would delete a file the user wrote.
   */
  it("does not recognise the marker quoted inside the body", () => {
    const quoting = [
      "---",
      "name: my-custom-agent",
      "---",
      "",
      "# Mine",
      "",
      `Compiled agents open with: ${provenanceMarker(VERSION)}`,
    ].join("\n");

    expect(hasProvenanceMarker(quoting)).toBe(false);
  });
});
