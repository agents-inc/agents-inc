import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_PAYLOAD,
  MARKETPLACE_REF,
  PRIVATE_MARKETPLACE_PAYLOAD,
} from "@workspace/api-mocks";

import { isLocalSource } from "../configuration/config.js";

/**
 * The one thing the two suites' shared fixture cannot say about itself: whether the marketplace
 * ref the EDITOR mints is a ref the CLI routes remotely.
 *
 * `seedPayloadSchema` types `marketplace` as a string and stops there, correctly — a bare
 * `owner/repo`, a `github:owner/repo` and an absolute directory are all legal refs. So the schema
 * both sides share, which holds every other field of the payload honest, is structurally unable to
 * catch the one disagreement that has actually shipped: EDITOR-49, where every custom-marketplace
 * id the editor minted was uninstallable, with both suites green the whole time because each
 * pinned a value legal on its own terms.
 *
 * This is the crossing held at the only seam a suite can reach without a browser and a PTY in one
 * process. It needs no network: `isLocalSource` is the router, and what it answers decides whether
 * a receiver fetches a repository or looks for `<cwd>/acme/skills` — a miss that "fails in the
 * worst way available: by resolving to something rather than to nothing", as the fixture's own
 * comment puts it.
 *
 * Read this beside `loading/source-fetcher.test.ts`, which pins the router's two branches over
 * written-out strings. That file proves the CLI routes `github:` remotely; this one proves the
 * string the editor actually mints is one of them. Neither claim implies the other, and it was the
 * second that went unheld.
 */
describe("the marketplace ref crossing", () => {
  it("mints a ref the CLI routes remotely rather than as a local directory", () => {
    expect(isLocalSource(MARKETPLACE_PAYLOAD.marketplace ?? "")).toBe(false);
  });

  it("holds for the private marketplace too, which is where the token flow starts", () => {
    expect(isLocalSource(PRIVATE_MARKETPLACE_PAYLOAD.marketplace ?? "")).toBe(false);
  });

  // The control, and the row above means nothing without it: the bare form is what a person types
  // into the dialog and it IS a local path to this CLI. If this ever went false the assertions
  // above would hold for a router that had stopped distinguishing anything.
  it("still reads the bare form the dialog accepts as a local directory", () => {
    expect(isLocalSource(MARKETPLACE_REF)).toBe(true);
  });

  // What the payload carries is the canonical constant rather than merely something remote-looking
  // — so a fixture repointed at a third spelling fails here rather than passing on a technicality.
  it("carries the canonical ref the fixture file documents as the minted form", () => {
    expect(MARKETPLACE_PAYLOAD.marketplace).toBe(MARKETPLACE_CANONICAL_REF);
  });
});
