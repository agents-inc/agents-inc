import { createHash } from "node:crypto";
import http from "node:http";

import { CLI, type CLIResult } from "./cli.js";

import type { ProjectHandle } from "../pages/wizard-result.js";

/** One request the CLI made to the stub, in arrival order. */
export type SeedConfigRequest = {
  url: string;
  userAgent: string | undefined;
  method: string | undefined;
  /** The request body, for the POST half; empty for a GET. */
  body: string;
};

export type SeedConfigStore = {
  /** What the CLI must be given as `AGENTS_INC_API_URL`. */
  url: string;
  /** Requests received so far, in arrival order. Emptied by {@link SeedConfigStore.reset}. */
  readonly requests: SeedConfigRequest[];
  /** Ids minted for posted configurations, in arrival order. Emptied by `reset`. */
  readonly minted: string[];
  /**
   * Serve `payload` under `id`. A string is served verbatim so a spec can pin a body the
   * schema must refuse; anything else is JSON-encoded.
   */
  publish(id: string, payload: unknown): void;
  /** Forget every published id and every recorded request. */
  reset(): void;
  close(): Promise<void>;
};

const CONFIGS_PATH = "/configs/";
const LOOPBACK = "127.0.0.1";
const ANY_PORT = 0;
/** The worker truncates its content address to this many base64url characters. */
const ID_LENGTH = 8;

/**
 * The id a posted body gets, derived exactly as the worker derives it: the SHA-256 of the body,
 * base64url, truncated. Content-addressing is what makes a re-share of the same configuration
 * return the same id, so a spec that asserts it can only do so against the same rule.
 */
function contentAddress(body: string): string {
  return createHash("sha256")
    .update(body)
    .digest("base64url")
    .replaceAll("=", "")
    .slice(0, ID_LENGTH);
}

/** The whole request body as text. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/**
 * A local stand-in for the agentsinc.sh config store: `GET /configs/<id>` returns the payload
 * published under that id and 404s an id that was never published, exactly as the worker does.
 *
 * A real server rather than a module mock, because the specs that use it exist to cover the whole
 * path — argument parsing, network, decode, mapping, and the same write/install/compile pipeline
 * the wizard uses. A mocked fetch would skip the two seams most likely to break: the flag reaching
 * the command, and the payload surviving the wire.
 */
export async function startSeedConfigStore(): Promise<SeedConfigStore> {
  const stored = new Map<string, unknown>();
  const requests: SeedConfigRequest[] = [];
  const minted: string[] = [];

  const server = http.createServer((req, res) => {
    const isPost = req.method === "POST";

    void readBody(req).then((body) => {
      requests.push({
        url: req.url ?? "",
        userAgent: req.headers["user-agent"],
        method: req.method,
        body,
      });

      if (isPost) {
        const id = contentAddress(body);
        stored.set(id, body);
        minted.push(id);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ id }));
        return;
      }

      const id = decodeURIComponent((req.url ?? "").replace(CONFIGS_PATH, ""));
      const payload = stored.get(id);

      if (payload === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("No config under this id");
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
  });

  await new Promise<void>((resolve) => server.listen(ANY_PORT, LOOPBACK, resolve));

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("seed config store did not bind to a port");
  }

  return {
    url: `http://${LOOPBACK}:${address.port}`,
    requests,
    minted,
    publish: (id, payload) => {
      stored.set(id, payload);
    },
    reset: () => {
      stored.clear();
      requests.length = 0;
      minted.length = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Runs `init --from <id>` against `store`, with the source the spec built. */
export function runInitFrom(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  sourceDir: string,
): Promise<CLIResult> {
  return CLI.run(["init", "--from", id, "--marketplace", sourceDir], project, {
    env: { AGENTS_INC_API_URL: store.url },
  });
}

/** Runs `share` against `store`, minting an id for whatever `project` has installed. */
export function runShare(store: SeedConfigStore, project: ProjectHandle): Promise<CLIResult> {
  return CLI.run(["share"], project, { env: { AGENTS_INC_API_URL: store.url } });
}

/**
 * Runs `edit --ui` against `store`: the same mint, handed to the editor rather than reported.
 * The spawned process has no TTY, so no browser is launched and the link is only printed —
 * which is exactly the environment this flag has to stay usable in.
 */
export function runEditUi(store: SeedConfigStore, project: ProjectHandle): Promise<CLIResult> {
  return CLI.run(["edit", "--ui"], project, { env: { AGENTS_INC_API_URL: store.url } });
}

/**
 * Runs `edit --from <id>` against `store` in a spawned process, which has no TTY.
 *
 * That is the whole point of this runner rather than a limitation of it: the command applies a
 * shared configuration destructively, so it refuses where there is nobody to confirm the
 * removals. The approving half needs a real terminal and runs under the PTY harness instead.
 */
export function runEditFrom(
  store: SeedConfigStore,
  id: string,
  project: ProjectHandle,
  extraArgs: string[] = [],
): Promise<CLIResult> {
  return CLI.run(["edit", "--from", id, ...extraArgs], project, {
    env: { AGENTS_INC_API_URL: store.url },
  });
}
