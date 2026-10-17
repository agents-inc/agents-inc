import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_PAYLOAD,
  MARKETPLACE_REF,
  PRIVATE_MARKETPLACE_PAYLOAD,
} from "@workspace/api-mocks";

import { isLocalSource } from "../configuration/config.js";

/** Whether the marketplace ref the editor mints is one the CLI routes remotely. */
describe("the marketplace ref crossing", () => {
  it("mints a ref the CLI routes remotely rather than as a local directory", () => {
    expect(isLocalSource(MARKETPLACE_PAYLOAD.marketplace ?? "")).toBe(false);
  });

  it("holds for the private marketplace too, which is where the token flow starts", () => {
    expect(isLocalSource(PRIVATE_MARKETPLACE_PAYLOAD.marketplace ?? "")).toBe(false);
  });

  // The control: the bare form the dialog accepts is a local path to this CLI.
  it("still reads the bare form the dialog accepts as a local directory", () => {
    expect(isLocalSource(MARKETPLACE_REF)).toBe(true);
  });

  it("carries the canonical ref the fixture file documents as the minted form", () => {
    expect(MARKETPLACE_PAYLOAD.marketplace).toBe(MARKETPLACE_CANONICAL_REF);
  });
});
