import { describe, expect, it } from "vitest";

import { buildMarketplacePluginRef, parseMarketplacePluginRef } from "./plugin-ref.js";

describe("marketplace plugin refs", () => {
  it("joins an id and its marketplace with @, and reads the id back", () => {
    const ref = buildMarketplacePluginRef("web-framework-react", "acme");

    expect(ref).toBe("web-framework-react@acme");
    expect(parseMarketplacePluginRef(ref)).toBe("web-framework-react");
  });

  it("reads a one-letter id back whole", () => {
    expect(parseMarketplacePluginRef("a@acme")).toBe("a");
  });

  it("reads a bare id, which names no marketplace, as itself", () => {
    expect(parseMarketplacePluginRef("web-framework-react")).toBe("web-framework-react");
  });
});
