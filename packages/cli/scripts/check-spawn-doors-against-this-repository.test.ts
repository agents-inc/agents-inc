import { describe, expect, it } from "vitest";

import { check, type DoorVerdict, GUARD_CONSTANTS } from "./check-spawn-doors.js";

const DOORS_ON_DISK: DoorVerdict[] = [
  { file: "e2e/fixtures/cli.ts", spawnedBy: "execa", outcome: "guarded" },
  { file: "e2e/helpers/terminal-session.ts", spawnedBy: "pty.spawn", outcome: "guarded" },
  { file: "e2e/helpers/test-utils.ts", spawnedBy: "execa", outcome: "guarded" },
];

describe("this repository", () => {
  it("starts the binary from exactly these doors, each carrying the guard", () => {
    expect(
      check().doors,
      `a door here missing one of ${GUARD_CONSTANTS.join(", ")} either lets oclif's update plugin detach a child into a fixture's fake HOME, or lets a run reach the live seed API`,
    ).toStrictEqual(DOORS_ON_DISK);
  });

  it("has no unguarded door", () => {
    expect(check().clean).toBe(true);
  });
});
