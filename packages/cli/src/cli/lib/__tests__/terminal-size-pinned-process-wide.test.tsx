import React from "react";
import { Box, Text } from "ink";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../../components/render.js";
import { SPEC_TERMINAL_COLUMNS } from "./test-constants";

const WIDE_COLUMNS = 200;
const WIDE_ROWS = 50;

function topEdgeAcross(columns: number): string {
  return `┌${"─".repeat(columns - 2)}┐\n`;
}

/** Answers each write's callback as a stream would: Ink's exit waits on one. */
function recordStdout(): string[] {
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
    written.push(String(chunk));
    rest.find((argument) => typeof argument === "function")?.();
    return true;
  });
  return written;
}

/** On a worker's piped process.stdout, as a command draws; a bordered box spans the whole width. */
async function drawABox(): Promise<string> {
  const written = recordStdout();
  const { unmount, waitUntilExit } = render(
    <Box borderStyle="single">
      <Text>drawn</Text>
    </Box>,
  );
  unmount();
  await waitUntilExit();
  return written.join("");
}

/**
 * Sizes nothing in the pinned case on purpose: the pin in vitest.setup.ts must hold without any
 * spec opting in. Headless, Ink falls back to the same 80 columns, so only a run at a wider
 * terminal reddens that case if the pin goes.
 */
describe("the terminal a spec's piped stdout is sized by", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("is the pinned size, whatever terminal the run is in", async () => {
    expect(
      await drawABox(),
      "a spec drew at the width of the terminal the run is in — the pin in vitest.setup.ts no longer holds",
    ).toContain(topEdgeAcross(SPEC_TERMINAL_COLUMNS));
  });

  /** The paired case: were Ink to size a pipe by anything else, the pin would hold nothing. */
  it("follows COLUMNS and LINES, the variables the pin sets", async () => {
    vi.stubEnv("COLUMNS", String(WIDE_COLUMNS));
    vi.stubEnv("LINES", String(WIDE_ROWS));

    expect(await drawABox()).toContain(topEdgeAcross(WIDE_COLUMNS));
  });
});
