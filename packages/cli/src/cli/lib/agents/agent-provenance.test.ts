import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "../__tests__/factories/agent-factories.js";
import { cliVersion, provenanceMarker } from "./agent-provenance";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("agent provenance marker", () => {
  /** The marker is the first cacheable byte of every sub-agent prompt, so it carries no version. */
  it("spells the same bytes whatever version stamped it", async () => {
    const pkg = JSON.parse(await readFile(path.join(CLI_ROOT, "package.json"), "utf8")) as {
      version: string;
    };

    expect(await cliVersion()).toBe(pkg.version);
    expect(
      provenanceMarker(),
      "the marker names a version again — every release now rewrites the first cacheable byte of all eighteen agents",
    ).not.toContain(pkg.version);
  });

  /** Two versions render byte-identical up to `<system-reminder>`, each still carrying its own. */
  it("confines a version difference to the trailing <system-reminder> block", async () => {
    const engine = await createLiquidEngine();
    const data = createMockCompiledAgentData();

    const renderedAtV1 = await renderAgent(engine, data, "9.1.0");
    const renderedAtV2 = await renderAgent(engine, data, "9.2.0");

    const volatileBlockStart = "<system-reminder>";
    const prefix = (rendered: string) => rendered.slice(0, rendered.indexOf(volatileBlockStart));

    expect(
      prefix(renderedAtV1),
      "a version bump changed a byte above the trailing block, so it rewrites the cacheable prefix of every compiled agent again",
    ).toBe(prefix(renderedAtV2));
    expect(renderedAtV1).toContain("Compiled by 9.1.0.");
    expect(renderedAtV2).toContain("Compiled by 9.2.0.");
  });
});
