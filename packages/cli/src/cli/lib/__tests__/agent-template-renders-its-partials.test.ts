import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { partialsRenderedBy } from "./helpers/template-partial-renders.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The shipped template a compile renders when nothing overrides it. */
const AGENT_TEMPLATE = path.join(CLI_ROOT, "src/agents/_templates/agent.liquid");

/** The directory `{% render "methodologies/…" %}` resolves against. */
const METHODOLOGIES_DIR = path.join(CLI_ROOT, "src/agents/_templates/methodologies");

const METHODOLOGY_PREFIX = "methodologies/";
const LIQUID_SUFFIX = ".liquid";

/**
 * The methodology partials `agent.liquid` renders, in the order it renders them.
 *
 * Order is part of the claim: the tags appear in the body in sequence, so this is the order every
 * compiled sub-agent reads its methodologies in.
 */
const RENDERED_METHODOLOGY_PARTIALS = [
  "investigation-requirements",
  "anti-over-engineering",
  "write-verification",
  "success-criteria",
  "context-management",
] as const;

/**
 * Partials that sit in the directory and no `{% render %}` tag names.
 *
 * A member here is a file the compile ships and never reads — lines that read as part of the
 * product to anyone opening the directory, and are in no sub-agent anywhere.
 *
 * `improvement-protocol` is one because retiring it either way is a product decision rather than
 * a tidy-up. Its subject — what an agent does when asked to edit its own configuration — is in
 * none of the five that render, so it is not a duplicate that can simply be deleted; and wiring
 * it in adds its whole body to EVERY compiled sub-agent, which is a change to shipped output.
 * Naming it here is what makes the state assertable while that decision is outstanding: the file
 * is not a gap the gate is short by, and a SECOND unrendered partial still reddens.
 */
const UNRENDERED_METHODOLOGY_PARTIALS = ["improvement-protocol"] as const;

/**
 * Every methodology partial on disk is one the shipped template renders.
 *
 * The four things that normally catch a name that no longer names anything are all inapplicable
 * to a Liquid partial at once — `tsc` does not open one, ESLint does not lint one, the engine
 * runs `strictVariables: false`, and a `{% render %}` tag that disappears leaves no residue in
 * the output, only a shorter sub-agent. So the two ends are held against each other directly:
 * the tags the template writes, and the files the directory holds.
 *
 * A roster rather than a fixture, and rather than a count. A count cannot see a swap — one
 * partial retired and another added leaves it green — and the whole subject here is WHICH file
 * is on which side.
 */
describe("the shipped agent template renders the partials beside it", () => {
  it("renders the methodology partials in the order a compiled sub-agent reads them", async () => {
    const template = await readFile(AGENT_TEMPLATE, "utf8");

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
