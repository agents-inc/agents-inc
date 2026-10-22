import { describe, expect, it } from "vitest";

import { seedPayloadSchema } from "@workspace/matrix/seed";

// Pinned against literals: a payload built from `SEED_VERSION` would follow the constant.
const V7_PAYLOAD = {
  v: 7,
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

const MARKETPLACE_REF = "github:acme/skills";

describe("seedPayloadSchema", () => {
  it("accepts the current contract version and keeps a sub-agent's scope", () => {
    const result = seedPayloadSchema.safeParse(V7_PAYLOAD);

    expect(result.success).toBe(true);
    // The whole entry: `z.object` strips what it does not declare.
    expect(result.data?.agents["web-developer"]).toStrictEqual({ on: true, scope: "global" });
  });

  it("accepts a sub-agent entry that names no scope, leaving the default to the mapper", () => {
    const result = seedPayloadSchema.safeParse({
      ...V7_PAYLOAD,
      agents: { "web-developer": { on: true } },
    });

    expect(result.success).toBe(true);
    expect(result.data?.agents["web-developer"]).toStrictEqual({ on: true });
  });

  it("keeps the marketplace a payload names, since a skill id cannot say where it is fetched from", () => {
    const result = seedPayloadSchema.safeParse({ ...V7_PAYLOAD, marketplace: MARKETPLACE_REF });

    expect(result.success).toBe(true);
    expect(result.data?.marketplace).toBe(MARKETPLACE_REF);
  });

  it("leaves the marketplace absent rather than undefined when a payload names none", () => {
    const result = seedPayloadSchema.safeParse(V7_PAYLOAD);

    // Absent, not `undefined`: the id is the hash of the JSON, which has no `undefined`.
    expect(result.data).not.toHaveProperty("marketplace");
  });

  it("refuses a marketplace that is not a ref at all", () => {
    const result = seedPayloadSchema.safeParse({ ...V7_PAYLOAD, marketplace: 7 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual([
      "marketplace",
    ]);
  });

  it("refuses the previous contract version rather than migrating it", () => {
    const result = seedPayloadSchema.safeParse({ ...V7_PAYLOAD, v: 5 });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toStrictEqual(["v"]);
  });

  it("refuses a scope this contract does not define", () => {
    const result = seedPayloadSchema.safeParse({
      ...V7_PAYLOAD,
      agents: { "web-developer": { on: true, scope: "workspace" } },
    });

    expect(result.success).toBe(false);
  });
});
