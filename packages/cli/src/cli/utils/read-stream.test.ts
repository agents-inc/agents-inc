import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { readAllOf } from "./read-stream.js";

/**
 * Reading a pipe to its end, which is the one part of `share --stdin` that is about the stream
 * rather than about the payload.
 */
describe("readAllOf", () => {
  it("joins every chunk in order", async () => {
    const stream = Readable.from(['{"v":', '5,"skills"', ":{}}"]);

    expect(await readAllOf(stream)).toBe('{"v":5,"skills":{}}');
  });

  /** An empty pipe is a legal stream, not an error — the caller decides what emptiness means. */
  it("answers the empty string for a stream that carries nothing", async () => {
    expect(await readAllOf(Readable.from([]))).toBe("");
  });

  /**
   * Chunks arrive as Buffers from a real pipe, and a multi-byte character can be SPLIT across two
   * of them. Decoding per chunk corrupts it; concatenating first is why this reads the whole
   * buffer before it decodes.
   *
   * **The split offset is the assertion.** `é` occupies bytes 1–2 of this string, so the stream
   * is cut at byte 2 — between the two bytes of one character. An earlier draft cut at byte 5,
   * which lands on a character BOUNDARY, and a per-chunk decode passes that happily: the test was
   * green against the defect it was written for. Mutation-proved at this offset, both ways.
   */
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
