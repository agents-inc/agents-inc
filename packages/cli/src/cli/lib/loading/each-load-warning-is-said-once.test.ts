import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STANDARD_FILES } from "../../consts";
import { renderUnparseableSkillMd } from "../__tests__/content-generators";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  type TestDirs,
} from "../__tests__/fixtures/create-test-source";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { DEFAULT_TEST_SKILLS } from "../__tests__/mock-data/mock-skills";
import { loadSource, sayCapturedWarnings } from "../operations/source/load-source";
import { loadSkillsMatrixFromSource } from "./source-loader";

/** A run says each catalogue-load warning once, however many times it loads the same files. */

type BrokenMarketplace = { dirs: TestDirs; brokenSkillMd: string };

async function marketplaceShippingAnUnreadableSkillMd(): Promise<BrokenMarketplace> {
  const skills = inTestMarketplace(DEFAULT_TEST_SKILLS);
  const broken = firstElement(skills);
  const healthy = skills.slice(1);

  const dirs = await createTestSource({
    skills: [{ ...broken, content: renderUnparseableSkillMd(broken.id) }, ...healthy],
  });
  return {
    dirs,
    brokenSkillMd: path.join(dirs.skillsDir, broken.category, broken.id, STANDARD_FILES.SKILL_MD),
  };
}

function loadFrom({ dirs }: BrokenMarketplace): Promise<unknown> {
  return loadSkillsMatrixFromSource({ sourceFlag: dirs.sourceDir, projectDir: dirs.projectDir });
}

describe("a catalogue load's warnings, across one run", () => {
  const created: TestDirs[] = [];

  async function marketplace(): Promise<BrokenMarketplace> {
    const made = await marketplaceShippingAnUnreadableSkillMd();
    created.push(made.dirs);
    return made;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(created.splice(0).map(cleanupTestSource));
  });

  it("two loads of one marketplace say its unreadable file once", async () => {
    const shipped = await marketplace();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadFrom(shipped);
    await loadFrom(shipped);

    expect(said.mock.calls).toStrictEqual([[expect.stringContaining(shipped.brokenSkillMd)]]);
  });

  it("another marketplace's unreadable file is still said, once", async () => {
    const first = await marketplace();
    const second = await marketplace();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await loadFrom(first);
    await loadFrom(first);
    await loadFrom(second);
    await loadFrom(second);

    expect(said.mock.calls).toStrictEqual([
      [expect.stringContaining(first.brokenSkillMd)],
      [expect.stringContaining(second.brokenSkillMd)],
    ]);
  });

  it("a later load does not repeat what an earlier, captured load's warnings already said", async () => {
    const shipped = await marketplace();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { startupMessages } = await loadSource({
      sourceFlag: shipped.dirs.sourceDir,
      projectDir: shipped.dirs.projectDir,
      captureStartupMessages: true,
    });
    expect(said, "a captured load says nothing until its warnings are said").not.toHaveBeenCalled();
    sayCapturedWarnings(startupMessages);
    await loadFrom(shipped);

    expect(said.mock.calls).toStrictEqual([[expect.stringContaining(shipped.brokenSkillMd)]]);
  });
});
