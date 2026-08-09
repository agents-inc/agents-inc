import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "path";

import { execa } from "execa";

/**
 * A remote skills source the test controls: one gzipped tarball of a source
 * directory, served over HTTP with an ETag the test decides when to move.
 *
 * A local path is not a substitute. Local sources are read live and never
 * cached, so the whole question this exists to ask — does a load notice that the
 * remote it cached moved on — cannot be asked of one.
 *
 * The served bytes are packed once per {@link TarballSourceServer.publish} and
 * held, so the ETag stays put between publishes. Packing per request would move
 * it on every run (gzip stamps its own header), and every load would look like a
 * change.
 */
export type TarballSourceServer = {
  /** The source value naming this server — an `init --source` value or a stored config source. */
  url: string;
  /** Serve `sourceDir` from now on, under a new ETag — the source moving on. */
  publish: (sourceDir: string) => Promise<void>;
  /** Every request the CLI made, in order, as `"<METHOD> <status>"`. */
  requests: string[];
  /** Stop serving. Further loads see a refused connection. Safe to call twice. */
  close: () => Promise<void>;
};

/** Tarball name in the served URL. Must not end in `.json` — giget reads those as template info. */
const TARBALL_NAME = "source.tar.gz";

/**
 * Serves `sourceDir` as a tarball at `http://localhost:<port>/source.tar.gz`.
 *
 * The archive wraps the directory in one top-level entry, the shape a git host's
 * tarball has and the one giget strips on extract.
 */
export async function startTarballSourceServer(sourceDir: string): Promise<TarballSourceServer> {
  let body = await packDirectory(sourceDir);
  let etag = etagFor(body);
  const requests: string[] = [];

  const server = createServer((request, response) => {
    const status = statusFor(request.method, request.headers["if-none-match"], etag);
    requests.push(`${request.method ?? "?"} ${status}`);

    response.setHeader("etag", etag);
    response.setHeader("content-type", "application/gzip");
    response.setHeader("content-length", String(body.byteLength));
    response.writeHead(status);
    response.end(status === 200 && request.method === "GET" ? body : undefined);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/${TARBALL_NAME}`,
    requests,
    publish: async (nextSourceDir: string) => {
      body = await packDirectory(nextSourceDir);
      etag = etagFor(body);
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const NOT_MODIFIED = 304;
const OK = 200;

function statusFor(method: string | undefined, ifNoneMatch: string | undefined, etag: string) {
  if (ifNoneMatch === etag) return NOT_MODIFIED;
  return OK;
}

function etagFor(body: Uint8Array): string {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

async function packDirectory(dir: string): Promise<Uint8Array> {
  const { stdout } = await execa(
    "tar",
    ["-czf", "-", "-C", path.dirname(dir), path.basename(dir)],
    { encoding: "buffer" },
  );
  return stdout;
}
