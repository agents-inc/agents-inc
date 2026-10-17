import type { Readable } from "node:stream";

/** Async iteration rather than `readFileSync("/dev/stdin")`, which is not portable. */
export async function readAllOf(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf-8");
}
