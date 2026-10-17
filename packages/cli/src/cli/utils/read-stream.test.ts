import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { readAllOf } from "./read-stream.js";

describe("readAllOf", () => {
  it("joins every chunk in order", async () => {
    const stream = Readable.from(['{"v":', '6,"skills"', ":{}}"]);

    expect(await readAllOf(stream)).toBe('{"v":6,"skills":{}}');
  });

  it("answers the empty string for a stream that carries nothing", async () => {
    expect(await readAllOf(Readable.from([]))).toBe("");
  });

  // `é` occupies bytes 1–2, so the cut at byte 2 splits it across chunks.
  it("survives a multi-byte character split down the middle", async () => {
    const encoded = Buffer.from("héllo — wörld", "utf-8");
    const midCharacter = 2;
    const stream = Readable.from([
      encoded.subarray(0, midCharacter),
      encoded.subarray(midCharacter),
    ]);

    expect(await readAllOf(stream)).toBe("héllo — wörld");
  });
});
