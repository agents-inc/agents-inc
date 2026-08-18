import { describe, expect, it } from "vitest";

import { seedPayloadSchema } from "@workspace/matrix/seed";

/**
 * The seed contract has one home, @workspace/matrix, which the CLI bundles rather than vendors.
 * So this asserts on the imported schema itself: it is the CLI's stake in a contract it no longer
 * owns a copy of, and it fails here if that package changes the shape `init --from` decodes.
 *
 * The wire contract, pinned against literals rather than the factories: a version test that builds
 * its payload from `SEED_VERSION` follows the constant wherever it goes and can never fail.
 *
 * Only the current version is accepted. Pre-1.0 policy is to fail a stale id loudly rather than
 * migrate it, so the previous version has to be refused as firmly as a malformed body.
 */
const V5_PAYLOAD = {
  v: 5,
  matrixVersion: "1.0.0",
  stackId: null,
  skills: {
    "web-framework-react": {
      install: "eject",
      scope: "project",
      assignments: { "web-developer": "lazy" },
    },
  },
  agents: { "web-developer": { on: true, scope: "global" } },
};

/** A marketplace ref in the form `--marketplace` takes one, and not the default public catalogue. */
const MARKETPLACE_REF = "github:acme/skills";

describe("seedPayloadSchema", () => {
  it("accepts the current contract version and keeps a sub-agent's scope", () => {
    const result = seedPayloadSchema.safeParse(V5_PAYLOAD);

    expect(result.success).toBe(true);
    // The whole entry, not just the key: `z.object` strips what it does not declare, so a schema
    // that merely tolerates the field would pass an existence check while dropping the value.
    expect(result.data?.agents["web-developer"]).toStrictEqual({ on: true, scope: "global" });
  });

  it("accepts a sub-agent entry that names no scope, leaving the default to the mapper", () => {
    const result = seedPayloadSchema.safeParse({
      ...V5_PAYLOAD,
      agents: { "web-developer": { on: true } },
    });

    expect(result.success).toBe(true);
    expect(result.data?.agents["web-developer"]).toStrictEqual({ on: true });
  });

  it("keeps the marketplace a payload names, since a skill id cannot say where it is fetched from", () => {
    const result = seedPayloadSchema.safeParse({ ...V5_PAYLOAD, marketplace: MARKETPLACE_REF });

    expect(result.success).toBe(true);
    // The value, not the key: an undeclared field is stripped rather than refused, so a schema
    // that has not really grown this one would pass a key check while dropping the ref.
    expect(result.data?.marketplace).toBe(MARKETPLACE_REF);
  });

  it("leaves the marketplace absent rather than undefined when a payload names none", () => {
    const result = seedPayloadSchema.safeParse(V5_PAYLOAD);

    // Absent means the default public marketplace. An explicit `undefined` would say the same
    // thing to a reader and a different thing to `JSON.stringify`, which is what identifies a
    // configuration on both sides of this wire.
    expect(result.data).not.toHaveProperty("marketplace");
  });

  it("refuses a marketplace that is not a ref at all", () => {
    const result = seedPayloadSchema.safeParse({ ...V5_PAYLOAD, marketplace: 7 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
      "marketplace",
    ]);
  });

  it("refuses the previous contract version rather than migrating it", () => {
    const result = seedPayloadSchema.safeParse({ ...V5_PAYLOAD, v: 4 });

    expect(result.success).toBe(false);
    // The version is the only thing wrong with it — everything else in this payload is v5-shaped.
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual(["v"]);
  });

  it("refuses a scope this contract does not define", () => {
    const result = seedPayloadSchema.safeParse({
      ...V5_PAYLOAD,
      agents: { "web-developer": { on: true, scope: "workspace" } },
    });

    expect(result.success).toBe(false);
  });
});
