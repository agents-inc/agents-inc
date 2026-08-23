import { describe, expect, it } from "vitest";

import { callSiteLines, callSiteOwners, constantMembersNamed } from "./source-call-sites.js";

/**
 * The readers a roster gate is built on. Each is exercised on the shape that would make a gate
 * silently green: a second call sharing one line, and a constant reference naming no member.
 */
describe("callSiteLines", () => {
  it("returns one trimmed entry per call, in source order", () => {
    const source = ["  this.warn(a);", "const x = 1;", "    this.warn(b);"].join("\n");

    expect(callSiteLines(source, "this.warn(")).toStrictEqual(["this.warn(a);", "this.warn(b);"]);
  });

  it("counts two calls on one line twice rather than collapsing them", () => {
    const source = "if (x) this.warn(a); else this.warn(b);";

    expect(callSiteLines(source, "this.warn(")).toStrictEqual([source, source]);
  });

  it("answers with nothing for a source that never makes the call", () => {
    expect(callSiteLines("this.log(a);\n", "this.warn(")).toStrictEqual([]);
  });
});

describe("constantMembersNamed", () => {
  it("names every member referenced, keeping repeats and source order", () => {
    const source = ["RECOVERY.B;", "RECOVERY.A;", "RECOVERY.B;"].join("\n");

    expect(constantMembersNamed(source, "RECOVERY")).toStrictEqual({
      members: ["B", "A", "B"],
      unreadable: 0,
    });
  });

  it("reports a reference that names no member instead of dropping it", () => {
    const source = ["import { RECOVERY } from './x.js';", "RECOVERY.A;"].join("\n");

    expect(constantMembersNamed(source, "RECOVERY")).toStrictEqual({
      members: ["A"],
      unreadable: 1,
    });
  });
});

describe("callSiteOwners", () => {
  it("attributes each call to the class member it sits inside, in source order", () => {
    const source = [
      "export class Step {",
      "  async first(): Promise<void> {",
      "    await this.pressSpace();",
      "  }",
      "",
      "  private async second(label: string): Promise<void> {",
      "    await this.pressSpace();",
      "  }",
      "}",
    ].join("\n");

    expect(callSiteOwners(source, "this.pressSpace(")).toStrictEqual({
      owners: ["first", "second"],
      unattributed: 0,
    });
  });

  it("keeps two calls in one member as two entries", () => {
    const source = [
      "class Step {",
      "  async walk(): Promise<void> {",
      "    for (const item of items) {",
      "      await this.pressSpace();",
      "    }",
      "    await this.pressSpace();",
      "  }",
      "}",
    ].join("\n");

    expect(callSiteOwners(source, "this.pressSpace(")).toStrictEqual({
      owners: ["walk", "walk"],
      unattributed: 0,
    });
  });

  it("never attributes a call to a control-flow keyword standing at member indent", () => {
    const source = [
      "export function loop(): void {",
      "  if (ready) {",
      "    this.pressSpace();",
      "  }",
      "}",
    ].join("\n");

    // Nothing on the way to the call declares a member, so the call is
    // reported as unattributed rather than filed under `if`. A reader that
    // took the nearest parenthesised line would name a keyword, and a roster
    // naming `if` reads like a real owner.
    expect(callSiteOwners(source, "this.pressSpace(")).toStrictEqual({
      owners: [],
      unattributed: 1,
    });
  });

  it("reports a call that precedes every declaration instead of dropping it", () => {
    expect(callSiteOwners("this.pressSpace();\n", "this.pressSpace(")).toStrictEqual({
      owners: [],
      unattributed: 1,
    });
  });
});
