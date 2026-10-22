import { spawnSync } from "child_process";
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CorpusAgentPartials } from "@workspace/compile/corpus";
import { AGENT_CORPUS, CORPUS_CLI_VERSION, CORPUS_TEMPLATES } from "@workspace/compile/corpus";
import { createEngineFromTemplates } from "@workspace/compile/engine";
import { renderAgent } from "@workspace/compile/agent-source";

import { cliVersion } from "../src/cli/lib/agents/agent-provenance.js";
import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import {
  buildAgentTemplateContext,
  compileAgentForHost,
  createLiquidEngine,
} from "../src/cli/lib/compiler.js";
import { createMockAgentConfig } from "../src/cli/lib/__tests__/factories/agent-factories.js";
import { createMockSkillEntry } from "../src/cli/lib/__tests__/factories/skill-factories.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { SKILLS } from "../src/cli/lib/__tests__/test-fixtures.js";
import type { AgentName } from "../src/cli/types/agents.js";
import { AGENT_NAMES } from "../src/cli/types/agents.js";
import { PROJECT_ROOT } from "../src/cli/consts.js";
import { typedValues } from "../src/cli/utils/typed-object.js";

import { check, generate } from "./generate-compile-package.js";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const COMPILE_ROOT = path.resolve(CLI_ROOT, "../compile");
const COMPILE_SRC = path.join(COMPILE_ROOT, "src");
const AGENTS_DIR = path.join(CLI_ROOT, "src/agents");

const CORPUS_FILE = "src/generated/corpus.ts";
const COMMITTED_CORPUS = path.join(COMPILE_ROOT, CORPUS_FILE);

/** Lets the suite drive the entry point's branches against a directory outside the tree. */
const COMPILE_ROOT_FLAG = "--compile-root";

const DRIFTED_CONTENT = "// hand-edited after generation\n";

/** Ships every optional partial. */
const FIDELITY_AGENT = "web-developer";
const FIDELITY_AGENT_PATH = "developer/web-developer";

const listFilesRecursive = (root: string, extension: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();

const modifiedAt = (filePath: string): bigint => statSync(filePath, { bigint: true }).mtimeNs;

const readEmitted = (root: string, relativePaths: string[]): Record<string, string> =>
  Object.fromEntries(
    relativePaths.map((rel) => [rel, readFileSync(path.join(root, rel), "utf-8")]),
  );

describe("generate-compile-package module", () => {
  it("exports generate and check, and importing it writes nothing", async () => {
    const committedFiles = listFilesRecursive(COMPILE_SRC, ".ts").map((rel) =>
      path.join(COMPILE_SRC, rel),
    );
    const modifiedBefore = committedFiles.map(modifiedAt);

    vi.resetModules();
    const reimported = await import("./generate-compile-package.js");

    expect(typeof reimported.generate).toBe("function");
    expect(typeof reimported.check).toBe("function");
    expect(
      committedFiles.map(modifiedAt),
      "importing the generator must not touch any file in packages/compile",
    ).toStrictEqual(modifiedBefore);
  });
});

describe("generating against the repository", () => {
  let outputRoot: string;
  let written: string[];
  let corpusContent: string;

  beforeAll(async () => {
    outputRoot = await createTempDir("compile-generate-");
    written = generate({ compileRoot: outputRoot }).written;
    corpusContent = readFileSync(path.join(outputRoot, CORPUS_FILE), "utf-8");
  });

  afterAll(async () => {
    await cleanupTempDir(outputRoot);
  });

  it("emits the corpus file", () => {
    expect(written).toContain(CORPUS_FILE);
  });

  it("carries an entry for every sub-agent the CLI declares", () => {
    for (const name of AGENT_NAMES) {
      expect(corpusContent, `the corpus must carry an entry for ${name}`).toContain(
        `\n  "${name}": {\n`,
      );
    }
  });

  it("vendors every markdown partial and every Liquid template under src/agents", () => {
    const markdown = listFilesRecursive(AGENTS_DIR, ".md");
    const liquid = listFilesRecursive(AGENTS_DIR, ".liquid");

    expect(markdown.length, "src/agents holds no markdown partials at all").toBeGreaterThan(0);
    expect(liquid.length, "src/agents holds no Liquid templates at all").toBeGreaterThan(0);

    // Matched by content, since corpus keys are metadata ids. Widened to the declared shape so
    // `typedValues` does not fix `V` to the first agent's literal types.
    const corpus: Record<AgentName, CorpusAgentPartials> = AGENT_CORPUS;
    const vendored = new Set(typedValues(corpus).flatMap(typedValues));

    expect(
      markdown.filter((rel) => !vendored.has(readFileSync(path.join(AGENTS_DIR, rel), "utf-8"))),
      "a markdown partial under src/agents never reached the corpus, so the generator's read set no longer covers the tree",
    ).toStrictEqual([]);

    expect(
      Object.keys(CORPUS_TEMPLATES).sort(),
      "every Liquid template the compile can render has to travel, keyed the way the engine resolves it",
    ).toStrictEqual(liquid.map((rel) => rel.replace(/^_templates\//, "")));
  });

  it("carries the two files readAgentFiles reads non-optionally, for every sub-agent", () => {
    for (const name of AGENT_NAMES) {
      const entry = AGENT_CORPUS[name];

      expect(entry, `the corpus has no entry for ${name}`).toBeDefined();
      expect(entry.identity, `${name}'s identity.md is empty in the corpus`).not.toBe("");
      expect(entry.playbook, `${name}'s playbook.md is empty in the corpus`).not.toBe("");
    }
  });

  /** No shipped agent uses the `<flavor>/output.md` fallback, so the corpus leaves it untested. */
  it("names the read-set fallback as having no subject in the shipped tree", () => {
    const agentsWithoutOwnOutput = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter((flavor) => flavor.isDirectory() && !flavor.name.startsWith("_"))
      .flatMap((flavor) =>
        readdirSync(path.join(AGENTS_DIR, flavor.name), { withFileTypes: true })
          .filter((agent) => agent.isDirectory())
          .filter(
            (agent) => !existsSync(path.join(AGENTS_DIR, flavor.name, agent.name, "output.md")),
          )
          .map((agent) => `${flavor.name}/${agent.name}`),
      );

    expect(
      agentsWithoutOwnOutput,
      "an agent now relies on readAgentFiles' category-directory fallback, so the generator's copy of that fallback needs a spec of its own",
    ).toStrictEqual([]);
  });

  it("names the CLI version the corpus was generated from", async () => {
    expect(corpusContent).toContain("export const CORPUS_CLI_VERSION");
    expect(
      CORPUS_CLI_VERSION,
      "the committed corpus was generated by a different release than the one in package.json — the preview would stamp a provenance marker the CLI does not write",
    ).toBe(await cliVersion());
  });

  it("reproduces every file committed to packages/compile byte for byte", () => {
    expect(written.length).toBeGreaterThan(0);

    for (const relativePath of written) {
      expect(
        readFileSync(path.join(outputRoot, relativePath), "utf-8"),
        `${relativePath} must be identical to the file committed in packages/compile`,
      ).toBe(readFileSync(path.join(COMPILE_ROOT, relativePath), "utf-8"));
    }
  });
});

describe("regenerating into the same output root", () => {
  let outputRoot: string;

  beforeAll(async () => {
    outputRoot = await createTempDir("compile-rerun-");
  });

  afterAll(async () => {
    await cleanupTempDir(outputRoot);
  });

  it("produces identical bytes on two consecutive runs", () => {
    const firstRun = generate({ compileRoot: outputRoot });
    const firstBytes = readEmitted(outputRoot, firstRun.written);

    const secondRun = generate({ compileRoot: outputRoot });

    expect(secondRun.written).toStrictEqual(firstRun.written);
    expect(readEmitted(outputRoot, secondRun.written)).toStrictEqual(firstBytes);
  });
});

describe("check mode", () => {
  it("reports no drift against the committed compile package", () => {
    expect(check({ compileRoot: COMPILE_ROOT })).toStrictEqual({ clean: true, drifted: [] });
  });

  it("reports a hand-edited corpus and leaves it exactly as it found it", async () => {
    const copyRoot = await createTempDir("compile-check-");
    cpSync(COMPILE_SRC, path.join(copyRoot, "src"), { recursive: true });
    writeFileSync(path.join(copyRoot, CORPUS_FILE), DRIFTED_CONTENT);
    const filesBefore = listFilesRecursive(copyRoot, ".ts");

    const result = check({ compileRoot: copyRoot });

    expect(result).toStrictEqual({ clean: false, drifted: [CORPUS_FILE] });
    expect(
      readFileSync(path.join(copyRoot, CORPUS_FILE), "utf-8"),
      "check must not rewrite the file it reports as drifted",
    ).toBe(DRIFTED_CONTENT);
    expect(listFilesRecursive(copyRoot, ".ts")).toStrictEqual(filesBefore);

    await cleanupTempDir(copyRoot);
  });

  it("reports a file it emits that the target does not hold at all", async () => {
    const emptyRoot = await createTempDir("compile-check-empty-");

    expect(check({ compileRoot: emptyRoot })).toStrictEqual({
      clean: false,
      drifted: [CORPUS_FILE],
    });

    await cleanupTempDir(emptyRoot);
  });

  it("reports drift after one vendored partial changes on disk", async () => {
    const fixtureCliRoot = await createTempDir("compile-fixture-cli-");
    cpSync(path.join(CLI_ROOT, "src/agents"), path.join(fixtureCliRoot, "src/agents"), {
      recursive: true,
    });
    const outputRoot = await createTempDir("compile-fixture-out-");
    generate({ compileRoot: outputRoot, cliRoot: fixtureCliRoot });

    expect(
      check({ compileRoot: outputRoot, cliRoot: fixtureCliRoot }),
      "a corpus just generated from this root cannot already be drifted from it",
    ).toStrictEqual({ clean: true, drifted: [] });

    writeFileSync(
      path.join(fixtureCliRoot, "src/agents", FIDELITY_AGENT_PATH, "identity.md"),
      "# edited after the corpus was vendored\n",
    );

    expect(
      check({ compileRoot: outputRoot, cliRoot: fixtureCliRoot }),
      "editing a partial the corpus carries has to redden the gate — otherwise the preview draws bytes the compile stopped writing",
    ).toStrictEqual({ clean: false, drifted: [CORPUS_FILE] });

    await Promise.all([cleanupTempDir(fixtureCliRoot), cleanupTempDir(outputRoot)]);
  });
});

describe("bun run generate:compile and generate:compile:check, given --compile-root <dir>", () => {
  let scratchRoot: string;
  let committedCorpusBefore: string;
  let committedModifiedBefore: bigint;

  beforeEach(async () => {
    scratchRoot = await createTempDir("compile-root-flag-");
    committedCorpusBefore = readFileSync(COMMITTED_CORPUS, "utf-8");
    committedModifiedBefore = modifiedAt(COMMITTED_CORPUS);
  });

  afterEach(async () => {
    // A runner that ignores the option rewrites the tracked corpus: the spec has failed by then, and
    // putting the corpus back keeps that failure from leaving the tree changed.
    if (readFileSync(COMMITTED_CORPUS, "utf-8") !== committedCorpusBefore) {
      writeFileSync(COMMITTED_CORPUS, committedCorpusBefore);
    }
    await cleanupTempDir(scratchRoot);
  });

  it("writes into the directory it names the bytes committed to packages/compile, says where, and leaves packages/compile as it was", () => {
    const result = spawnSync("bun", ["run", "generate:compile", COMPILE_ROOT_FLAG, scratchRoot], {
      cwd: CLI_ROOT,
      encoding: "utf-8",
    });
    const written = listFilesRecursive(scratchRoot, ".ts");

    expect(written).toContain(CORPUS_FILE);
    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      `  ✓ wrote ${written.length} files to ${scratchRoot}\n`,
    ]);
    expect(
      readEmitted(scratchRoot, written),
      "generate:compile must write what generate:compile:check holds packages/compile to",
    ).toStrictEqual(readEmitted(COMPILE_ROOT, written));
    expect(modifiedAt(COMMITTED_CORPUS)).toBe(committedModifiedBefore);
  });

  it("checks the directory it names rather than packages/compile, and writes nothing there", () => {
    const result = spawnSync(
      "bun",
      ["run", "generate:compile:check", COMPILE_ROOT_FLAG, scratchRoot],
      { cwd: CLI_ROOT, encoding: "utf-8" },
    );

    expect([result.status, result.stdout]).toStrictEqual([EXIT_CODES.ERROR, ""]);
    expect(result.stderr).toContain(`${scratchRoot} is out of date:\n  ${CORPUS_FILE}\n\n`);
    expect(listFilesRecursive(scratchRoot, ".ts")).toStrictEqual([]);
  });

  it("refuses the option with no directory after it, naming it, rather than write packages/compile", () => {
    const result = spawnSync("bun", ["run", "generate:compile", COMPILE_ROOT_FLAG], {
      cwd: CLI_ROOT,
      encoding: "utf-8",
    });

    expect([result.status, result.stdout]).toStrictEqual([EXIT_CODES.INVALID_ARGS, ""]);
    expect(result.stderr).toContain(`${COMPILE_ROOT_FLAG} needs a directory`);
    expect(modifiedAt(COMMITTED_CORPUS)).toBe(committedModifiedBefore);
  });
});

describe("the gate is wired where its sibling is", () => {
  // Parse boundary, typed to the one script read: a package.json without it throws in the spec.
  const manifest = JSON.parse(readFileSync(path.join(CLI_ROOT, "package.json"), "utf8")) as {
    scripts: { generate: string };
  };

  it("passes generate:compile:check on the committed corpus", () => {
    const checked = spawnSync("bun", ["run", "generate:compile:check"], {
      cwd: CLI_ROOT,
      encoding: "utf-8",
    });

    expect([checked.status, checked.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      "  ✓ packages/compile matches what the generator emits\n",
    ]);
  });

  it("puts generate:compile in the generate chain", () => {
    expect(
      manifest.scripts.generate.split(" && "),
      "a marketplace or agent change that skips this leaves the vendored corpus stale",
    ).toContain("bun run generate:compile");
  });

  it("runs the check in CI beside the matrix one", () => {
    const workflow = readFileSync(path.resolve(CLI_ROOT, "../../.github/workflows/ci.yml"), "utf8");

    expect(
      workflow,
      "the corpus is guarded by nothing until CI runs its check — every input is in this repository, so the runner can regenerate",
    ).toContain("bun run generate:compile:check");
  });
});

/** Same context and version on both sides, so only the template source differs. */
describe("a browser render of a vendored sub-agent", () => {
  it("is byte-identical to the render the CLI writes from disk", async () => {
    // One preloaded and one lazy skill, to exercise both sides of the split.
    const skills = [
      createMockSkillEntry(SKILLS.react.id, true),
      createMockSkillEntry(SKILLS.tailwind.id, false),
    ];
    const agent = createMockAgentConfig(FIDELITY_AGENT, skills, { path: FIDELITY_AGENT_PATH });
    const version = await cliVersion();

    const fromDisk = await compileAgentForHost(
      "claude",
      FIDELITY_AGENT,
      agent,
      PROJECT_ROOT,
      await createLiquidEngine(),
    );

    const fromCorpus = await renderAgent(
      createEngineFromTemplates(CORPUS_TEMPLATES),
      buildAgentTemplateContext(FIDELITY_AGENT, agent, AGENT_CORPUS[FIDELITY_AGENT]),
      version,
    );

    expect(
      fromDisk.length,
      "the disk render produced nothing, so the comparison below has no subject",
    ).toBeGreaterThan(0);

    expect(
      fromCorpus,
      "the vendored corpus renders a different sub-agent than the disk copy does, so the preview would draw bytes no install writes",
    ).toStrictEqual(fromDisk);
  });
});
