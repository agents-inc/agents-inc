import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Liquid } from "liquidjs";
import { describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "./factories/agent-factories.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const METHODOLOGIES = "methodologies";

const METHODOLOGIES_DIR = path.join(CLI_ROOT, "src/agents/_templates", METHODOLOGIES);

const LIQUID_SUFFIX = ".liquid";

/** In render order, which is the order every compiled sub-agent reads them. */
const RENDERED_METHODOLOGY_PARTIALS = ["operating-principles"] as const;

/** Keep empty: a member is a file the compile ships and no sub-agent reads. */
const UNRENDERED_METHODOLOGY_PARTIALS = [] as const;

const RENDER_VERSION = "0.0.0-methodologies";

/** What a compiled sub-agent carries of a partial: its own render, with the engine's globals. */
async function renderedPartial(engine: Liquid, partial: string): Promise<string> {
  const rendered: unknown = await engine.renderFile(`${METHODOLOGIES}/${partial}`);
  if (typeof rendered !== "string") throw new Error(`${partial} rendered to no text`);

  return rendered.trim();
}

/** Nothing type-checks a template, so the directory is held against what a compile carries. */
describe("a compiled sub-agent carries the methodology partials beside its template", () => {
  it("carries exactly the rendered roster, in the order a compiled sub-agent reads them", async () => {
    const engine = await createLiquidEngine();
    const compiled = await renderAgent(engine, createMockCompiledAgentData(), RENDER_VERSION);
    const renders = await Promise.all(
      (await readdir(METHODOLOGIES_DIR)).map(async (file) => {
        const partial = path.basename(file, LIQUID_SUFFIX);
        return { partial, render: await renderedPartial(engine, partial) };
      }),
    );

    // Subject guard: an empty render is found at position 0 of any compiled body.
    expect(
      renders.filter(({ render }) => render === "").map(({ partial }) => partial),
      "a methodology partial renders to nothing, so finding it in the compiled body proves nothing",
    ).toStrictEqual([]);

    const carried = renders
      .map(({ partial, render }) => ({ partial, position: compiled.indexOf(render) }))
      .filter(({ position }) => position !== -1)
      .sort((left, right) => left.position - right.position)
      .map(({ partial }) => partial);

    expect(
      carried,
      "the compiled sub-agent carries another set or order of methodology partials than the rendered roster — a render tag was added, removed or repointed",
    ).toStrictEqual(RENDERED_METHODOLOGY_PARTIALS);
  });

  it("accounts for every partial in the methodologies directory", async () => {
    const onDisk = (await readdir(METHODOLOGIES_DIR)).sort();

    expect(
      onDisk,
      "a methodology partial is in the directory and on neither roster — wire it into agent.liquid, or name it above as one nothing renders",
    ).toStrictEqual(
      [...RENDERED_METHODOLOGY_PARTIALS, ...UNRENDERED_METHODOLOGY_PARTIALS]
        .map((partial) => `${partial}${LIQUID_SUFFIX}`)
        .sort(),
    );
  });
});
