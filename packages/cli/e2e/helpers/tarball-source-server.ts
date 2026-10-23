import { createHash } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
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
  /**
   * Lets `passing` requests of `method` through, then answers the next one with `status`, no ETag
   * and no body; every request after it is served as before.
   */
  failOnce: (method: RequestMethod, status: number, passing?: number) => void;
  /**
   * Lets `passing` GETs through, then sends the next one half its body and holds it open, as a
   * download stands when its process is interrupted; every request after it is served as before.
   */
  stallOnce: (passing?: number) => void;
  /** In order, as `"<METHOD> <status>"`. */
  requests: string[];
  close: () => Promise<void>;
};

type RequestMethod = "GET" | "HEAD";

const STALL = "stall";

type OneOff = { method: RequestMethod; answer: number | typeof STALL; passing: number };

// Must not end in `.json`: giget reads those as template info.
const TARBALL_NAME = "source.tar.gz";

export async function startTarballSourceServer(sourceDir: string): Promise<TarballSourceServer> {
  let body = await packDirectory(sourceDir);
  let etag = etagFor(body);
  let refusing: number | undefined;
  let oneOff: OneOff | undefined;
  const held = new Set<ServerResponse>();
  const requests: string[] = [];

  /** How this request is answered, if it is the one `failOnce` or `stallOnce` named. */
  function oneOffFor(method: string | undefined): OneOff["answer"] | undefined {
    if (oneOff === undefined || oneOff.method !== method) return undefined;
    if (oneOff.passing > 0) {
      oneOff = { ...oneOff, passing: oneOff.passing - 1 };
      return undefined;
    }
    const { answer } = oneOff;
    oneOff = undefined;
    return answer;
  }

  function holdHalfway(response: ServerResponse): void {
    response.write(body.subarray(0, Math.floor(body.byteLength / 2)));
    held.add(response);
    response.on("close", () => held.delete(response));
  }

  const server = createServer((request, response) => {
    const answer = refusing ?? oneOffFor(request.method);
    if (typeof answer === "number") {
      requests.push(`${request.method ?? "?"} ${answer}`);
      response.writeHead(answer, { "content-length": "0" });
      response.end();
      return;
    }

    const status = statusFor(request.method, request.headers["if-none-match"], etag);
    requests.push(`${request.method ?? "?"} ${status}`);

    response.setHeader("etag", etag);
    response.setHeader("content-type", "application/gzip");
    response.setHeader("content-length", String(body.byteLength));
    response.writeHead(status);
    if (answer === STALL) {
      holdHalfway(response);
      return;
    }
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
    failOnce: (method: RequestMethod, status: number, passing = 0) => {
      oneOff = { method, answer: status, passing };
    },
    stallOnce: (passing = 0) => {
      oneOff = { method: "GET", answer: STALL, passing };
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const response of held) response.destroy();
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
