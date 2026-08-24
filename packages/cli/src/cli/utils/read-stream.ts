import type { Readable } from "node:stream";

/**
 * Every chunk of a readable, as text.
 *
 * A stream rather than `readFileSync("/dev/stdin")`: that path does not exist on every platform
 * this CLI runs on, and it reads a pipe the operating system may still be filling. Async
 * iteration is the one form that is correct on all of them.
 */
export async function readAllOf(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString("utf-8");
}
