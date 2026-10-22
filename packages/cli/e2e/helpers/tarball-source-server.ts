import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "path";

import { execa } from "execa";

/**
 * A cached remote source whose ETag moves only on `publish` (local sources are never cached).
 * Packed once per publish: gzip stamps its header, so repacking would move the ETag.
 */
export type TarballSourceServer = {
  url: string;
  publish: (sourceDir: string) => Promise<void>;
  /**
   * Answers every request with `status`, no ETag and no body, as GitHub answers for a repository
   * gone or private; `publish` serves again.
   */
  refuse: (status: number) => void;
  /** In order, as `"<METHOD> <status>"`. */
  requests: string[];
  close: () => Promise<void>;
};

// Must not end in `.json`: giget reads those as template info.
const TARBALL_NAME = "source.tar.gz";

export async function startTarballSourceServer(sourceDir: string): Promise<TarballSourceServer> {
  let body = await packDirectory(sourceDir);
  let etag = etagFor(body);
  let refusing: number | undefined;
  const requests: string[] = [];

  const server = createServer((request, response) => {
    if (refusing !== undefined) {
      requests.push(`${request.method ?? "?"} ${refusing}`);
      response.writeHead(refusing, { "content-length": "0" });
      response.end();
      return;
    }

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
    // A TCP listener's address() is always an AddressInfo.
    url: `http://localhost:${(server.address() as AddressInfo).port}/${TARBALL_NAME}`,
    requests,
    publish: async (nextSourceDir: string) => {
      body = await packDirectory(nextSourceDir);
      etag = etagFor(body);
      refusing = undefined;
    },
    refuse: (status: number) => {
      refusing = status;
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
