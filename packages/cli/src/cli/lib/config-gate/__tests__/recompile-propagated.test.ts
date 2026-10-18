import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../operations/project/recompile-project-agents.js", () => ({
  recompilePropagatedProjectAgents: vi.fn(),
}));

import { recompilePropagated } from "../recompile";
import { recompilePropagatedProjectAgents } from "../../operations/project/recompile-project-agents.js";

const mockRecompile = vi.mocked(recompilePropagatedProjectAgents);

const ONE_PROJECT_REWRITTEN = {
  rewrittenCount: 1,
  unchangedCount: 0,
  failedCount: 0,
  warnings: [],
};

describe("recompilePropagated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecompile.mockResolvedValue(ONE_PROJECT_REWRITTEN);
  });

  it("answers nothing recompiled for no projects, without reaching the recompile", async () => {
    expect(await recompilePropagated([])).toStrictEqual({
      rewrittenCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      warnings: [],
    });
    expect(mockRecompile).not.toHaveBeenCalled();
  });

  it("hands every project to the recompile and answers its summary", async () => {
    expect(await recompilePropagated(["/a", "/b"])).toStrictEqual(ONE_PROJECT_REWRITTEN);
    expect(mockRecompile).toHaveBeenCalledExactlyOnceWith(["/a", "/b"]);
  });
});
