import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { partialsRenderedBy } from "./helpers/template-partial-renders.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Both halves: `agent.liquid` includes `agent-body.liquid`, where the render tags live. */
const AGENT_TEMPLATE_HALVES = ["agent.liquid", "agent-body.liquid"].map((half) =>
  path.join(CLI_ROOT, "src/agents/_templates", half),
);

const METHODOLOGIES_DIR = path.join(CLI_ROOT, "src/agents/_templates/methodologies");

const METHODOLOGY_PREFIX = "methodologies/";
const LIQUID_SUFFIX = ".liquid";

/** In render order, which is the order every compiled sub-agent reads them. */
const RENDERED_METHODOLOGY_PARTIALS = ["operating-principles"] as const;

/** Keep empty: a member is a file the compile ships and no sub-agent reads. */
const UNRENDERED_METHODOLOGY_PARTIALS = [] as const;

/**
 * Nothing else catches a stale `{% render %}` (no tsc, no lint, `strictVariables: false`), so the
 * template's tags and the directory's files are held against each other by name.
 */
describe("the shipped agent template renders the partials beside it", () => {
  it("renders the methodology partials in the order a compiled sub-agent reads them", async () => {
    const halves = await Promise.all(AGENT_TEMPLATE_HALVES.map((half) => readFile(half, "utf8")));
    const template = halves.join("");

    expect(
      partialsRenderedBy(template),
      "a render tag was added, removed or repointed — every compiled sub-agent's body moved with it",
    ).toStrictEqual(
      RENDERED_METHODOLOGY_PARTIALS.map((partial) => `${METHODOLOGY_PREFIX}${partial}`),
    );
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
