/**
 * Contract for `scripts/generate-compile-package.ts` — the CLI-side generator that vendors the
 * agent template corpus into `packages/compile` as string data.
 *
 * A browser has no `src/agents/`, so the editor's output preview cannot read the partials and
 * templates a compile is assembled from. Vendoring them is what lets one renderer serve both
 * sides; the acceptance criterion is that the vendored copy renders the SAME BYTES the disk copy
 * does, which is the last spec in this file and the only one that says the vendoring is faithful.
 *
 * The shape is its sibling's — `generate-matrix-package.ts` — for the reasons that file's tests
 * record: roots are parameters so the suite can drive the generator against a fixture checkout,
 * importing the module writes nothing, `check` compares in memory and reports a file it emits
 * that is not committed at all, and the emission order is a comparator's rather than the
 * collation of whichever machine ran it.
 *
 * Nothing here writes a count. `find src/agents -name '*.md'` and `find src/agents -name
 * '*.liquid'` are what the corpus is measured against, run at assertion time on both sides.
 */

import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CorpusAgentPartials } from "@workspace/compile/corpus";
import { AGENT_CORPUS, CORPUS_CLI_VERSION, CORPUS_TEMPLATES } from "@workspace/compile/corpus";
import { createEngineFromTemplates } from "@workspace/compile/engine";
import { renderAgent } from "@workspace/compile/agent-source";

import { cliVersion } from "../src/cli/lib/agents/agent-provenance.js";
import {
  buildAgentTemplateContext,
  compileAgentForPlugin,
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

/** Emitted paths are relative to the compile package root, POSIX-separated. */
const CORPUS_FILE = "src/generated/corpus.ts";

const DRIFTED_CONTENT = "// hand-edited after generation\n";

/** The sub-agent the fidelity spec renders. Any real one does; this one ships every optional partial. */
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

// -- Module shape ------------------------------------------------------------

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

// -- Generating against the repository ---------------------------------------

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

    // Both rosters are read off disk at assertion time rather than written down.
    // A count here could not see a swap, and a number would go stale the first
    // time a partial is added.
    expect(markdown.length, "src/agents holds no markdown partials at all").toBeGreaterThan(0);
    expect(liquid.length, "src/agents holds no Liquid templates at all").toBeGreaterThan(0);

    // The markdown half is held by CONTENT rather than by key. The corpus is
    // keyed by the id an agent's own metadata declares, disk keys by
    // `<role>/<directory>/<partial>.md`, and reconstructing either from the
    // other here would be a second copy of the generator's own walk — which
    // would then agree with it about whatever it got wrong.
    //
    // Only this direction needs asserting. A corpus entry with no file behind
    // it is what `check` already catches: it regenerates and byte-compares, so
    // a deleted partial shrinks the fresh corpus and the committed one stops
    // matching. What regenerating CANNOT see is a partial the generator never
    // reads — both sides agree, the gate stays clean, and the browser renders a
    // sub-agent assembled from fewer files than the disk render uses.
    // Read through the DECLARED shape rather than the generated literal. The corpus is emitted
    // `as const satisfies Record<AgentName, CorpusAgentPartials>`, so every partial's type is the
    // string it happens to hold; `typedValues` binds one `V` across the whole record and would
    // fix it to whichever agent sorts first. The widening is what the `satisfies` already proved.
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

  /**
   * `readAgentFiles` falls back to `<flavor>/output.md` when the agent's own directory has none.
   *
   * The gap is that NO SHIPPED AGENT takes that branch — every one of the eighteen carries its
   * own `output.md`, which this asserts rather than leaves implied. So the generator's fallback
   * is untested by the corpus itself, and the day an agent is added without one, this spec is
   * what says the fallback has acquired a subject and needs covering.
   */
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

// -- Determinism -------------------------------------------------------------

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

// -- Check mode --------------------------------------------------------------

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

    // `git diff` cannot see this case, which is the reason the sibling generator
    // compares in memory rather than regenerating and diffing.
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

// -- Wiring ------------------------------------------------------------------

describe("the gate is wired where its sibling is", () => {
  const manifest = JSON.parse(readFileSync(path.join(CLI_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  it("declares generate:compile and generate:compile:check", () => {
    expect(manifest.scripts["generate:compile"]).toBe(
      "bun scripts/run-generate-compile-package.ts",
    );
    expect(manifest.scripts["generate:compile:check"]).toBe(
      "bun scripts/run-generate-compile-package.ts --check",
    );
  });

  it("puts generate:compile in the generate chain", () => {
    expect(
      manifest.scripts["generate"],
      "a marketplace or agent change that skips this leaves the vendored corpus stale",
    ).toContain("generate:compile");
  });

  it("runs the check in CI beside the matrix one", () => {
    const workflow = readFileSync(path.resolve(CLI_ROOT, "../../.github/workflows/ci.yml"), "utf8");

    expect(
      workflow,
      "the corpus is guarded by nothing until CI runs its check — every input is in this repository, so the runner can regenerate",
    ).toContain("bun run generate:compile:check");
  });
});

// -- Fidelity ----------------------------------------------------------------

/**
 * The one assertion that says the vendoring is faithful.
 *
 * Everything above proves the corpus matches the files on disk as TEXT. None of it proves the
 * engine built over a plain record resolves a `{% render %}` the way the engine rooted on a
 * directory does — partial lookup, extension handling and the layered-root order are all the
 * engine's, and a mismatch there produces a preview that is wrong in exactly the way this whole
 * phase exists to prevent: plausible, and different from the file the CLI writes.
 *
 * The two renders are handed the same `CompiledAgentData` and the same version, so the only
 * variable left between them is where the bytes came from.
 */
describe("a browser render of a vendored sub-agent", () => {
  it("is byte-identical to the render the CLI writes from disk", async () => {
    // Neither skill carries a `source`, so `compileAgentForPlugin`'s per-skill
    // `pluginRef` mapping is the identity and the corpus render needs no mapping
    // to match it. One preloaded and one lazy, because the split is order-preserving
    // and a single-skill agent would exercise neither side of it.
    const skills = [
      createMockSkillEntry(SKILLS.react.id, true),
      createMockSkillEntry(SKILLS.tailwind.id, false),
    ];
    const agent = createMockAgentConfig(FIDELITY_AGENT, skills, { path: FIDELITY_AGENT_PATH });
    const version = await cliVersion();

    const fromDisk = await compileAgentForPlugin(
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

    // Subject guard: an empty render on both sides would satisfy the comparison
    // for free, and a Liquid engine that resolves no template renders empty.
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
