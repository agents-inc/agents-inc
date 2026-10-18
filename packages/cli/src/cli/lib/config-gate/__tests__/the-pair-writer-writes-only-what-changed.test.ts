import path from "path";
import { readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/logger")>()),
  verbose: vi.fn(),
}));

import {
  ensureBlankPair,
  globalPairPaths,
  typesPathFor,
  writeGlobalPair,
  writeGlobalTypesHalf,
} from "../pair-writer";
import { GlobalPairWriteViolation, withGateToken } from "../gate-token";
import { verbose } from "../../../utils/logger";
import { buildProjectConfig } from "../../__tests__/factories/config-factories";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories";
import { useFakeHome } from "../../__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils";
import { SKILLS } from "../../__tests__/test-fixtures";

const MATRIX = createMockMatrix(SKILLS.react);
const NO_AGENTS = {};
const CONFIG = buildProjectConfig({ name: "global" });
const REDESCRIBED = buildProjectConfig({ name: "global", description: "Said differently" });

describe("the global pair writer", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-pair-writer-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  const configPath = () => globalPairPaths("claude").configPath;
  const gated = <T>(write: () => Promise<T>) => withGateToken(write);

  it("writes the pair once, and reports nothing written for identical bytes", async () => {
    await gated(() => ensureBlankPair("claude"));

    expect(await gated(() => writeGlobalPair(CONFIG, configPath(), MATRIX, NO_AGENTS))).toBe(true);
    expect(await gated(() => writeGlobalPair(CONFIG, configPath(), MATRIX, NO_AGENTS))).toBe(false);
  });

  it("reports a write that changed the config half alone", async () => {
    await gated(() => ensureBlankPair("claude"));
    await gated(() => writeGlobalPair(CONFIG, configPath(), MATRIX, NO_AGENTS));
    const typesBefore = await readFile(typesPathFor(configPath()), "utf-8");

    expect(await gated(() => writeGlobalPair(REDESCRIBED, configPath(), MATRIX, NO_AGENTS))).toBe(
      true,
    );
    expect(await readFile(typesPathFor(configPath()), "utf-8"), "only the config moved").toBe(
      typesBefore,
    );
  });

  it("refuses a write outside config-gate even when the bytes would not change", async () => {
    await gated(() => ensureBlankPair("claude"));
    await gated(() => writeGlobalPair(CONFIG, configPath(), MATRIX, NO_AGENTS));

    await expect(writeGlobalTypesHalf(CONFIG, configPath(), MATRIX, NO_AGENTS)).rejects.toThrow(
      new GlobalPairWriteViolation(typesPathFor(configPath())),
    );
  });

  it("creates a blank pair where none exists, and says where", async () => {
    expect(await gated(() => ensureBlankPair("claude"))).toBe(true);

    expect(verbose).toHaveBeenCalledWith(
      `Created blank global config at ${path.dirname(configPath())}`,
    );
  });

  it("leaves an existing global config as it is, and says so", async () => {
    await gated(() => ensureBlankPair("claude"));
    await gated(() => writeGlobalPair(REDESCRIBED, configPath(), MATRIX, NO_AGENTS));
    const written = await readFile(configPath(), "utf-8");
    vi.mocked(verbose).mockClear();

    expect(await gated(() => ensureBlankPair("claude"))).toBe(false);

    expect(await readFile(configPath(), "utf-8")).toBe(written);
    expect(verbose).toHaveBeenCalledExactlyOnceWith(
      "Global config already exists, skipping blank creation",
    );
  });
});

describe("GlobalPairWriteViolation", () => {
  it("names itself and the file it refused", () => {
    expect(new GlobalPairWriteViolation("/home/someone/config.ts")).toMatchObject({
      name: "GlobalPairWriteViolation",
      message:
        "/home/someone/config.ts may only be written through config-gate — see src/cli/lib/config-gate/index.ts",
    });
  });
});
