import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import * as vendored from "./seed-schema.js";

// The canonical contract, loaded by computed path on purpose. This package
// must not depend on the private @workspace/matrix (it ships to npm), and a
// static relative import would drag the sibling package into tsc's program,
// where it fails the rootDir check. A dynamic import is invisible to tsc and
// resolved by vitest — and the path IS the statement of which file
// seed-schema.ts is a copy of.
const CANONICAL_SEED = pathToFileURL(
  path.resolve(import.meta.dirname, "../../../../../matrix/src/seed.ts"),
).href;
const canonical = (await import(CANONICAL_SEED)) as typeof vendored;

/**
 * seed-schema.ts is a hand-kept copy of packages/matrix/src/seed.ts, and until
 * this test nothing checked they still agree — drift surfaced at decode time,
 * on a user's machine, as a shared config that would not load. The two files
 * are allowed to differ as text (comments, formatting); what must be identical
 * is the wire contract. Comparing JSON Schema projections checks exactly that
 * and nothing else.
 */
const SCHEMA_PAIRS = [
  ["seedModelSchema", vendored.seedModelSchema, canonical.seedModelSchema],
  ["seedEffortSchema", vendored.seedEffortSchema, canonical.seedEffortSchema],
  ["seedLoadStateSchema", vendored.seedLoadStateSchema, canonical.seedLoadStateSchema],
  ["seedSkillSchema", vendored.seedSkillSchema, canonical.seedSkillSchema],
  ["seedAgentSchema", vendored.seedAgentSchema, canonical.seedAgentSchema],
  ["seedPayloadSchema", vendored.seedPayloadSchema, canonical.seedPayloadSchema],
] as const;

describe("vendored seed contract matches packages/matrix", () => {
  it("agrees on the seed version", () => {
    expect(vendored.SEED_VERSION).toBe(canonical.SEED_VERSION);
  });

  it.each(SCHEMA_PAIRS.map(([name]) => name))("agrees on %s", (name) => {
    const [, ours, theirs] = SCHEMA_PAIRS.find(([pairName]) => pairName === name)!;

    expect(z.toJSONSchema(ours as z.ZodType)).toStrictEqual(z.toJSONSchema(theirs as z.ZodType));
  });
});
