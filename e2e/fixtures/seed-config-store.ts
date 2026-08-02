import http from "node:http";

import { CLI, type CLIResult } from "./cli.js";

import type { ProjectHandle } from "../pages/wizard-result.js";

/** One request the CLI made to the stub, in arrival order. */
export type SeedConfigRequest = { url: string; userAgent: string | undefined };

export type SeedConfigStore = {
  /** What the CLI must be given as `AGENTS_INC_API_URL`. */
  url: string;
  /** Requests received so far, in arrival order. Emptied by {@link SeedConfigStore.reset}. */
  readonly requests: SeedConfigRequest[];
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

  const server = http.createServer((req, res) => {
    requests.push({ url: req.url ?? "", userAgent: req.headers["user-agent"] });

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

  await new Promise<void>((resolve) => server.listen(ANY_PORT, LOOPBACK, resolve));

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("seed config store did not bind to a port");
  }

  return {
    url: `http://${LOOPBACK}:${address.port}`,
    requests,
    publish: (id, payload) => {
      stored.set(id, payload);
    },
    reset: () => {
      stored.clear();
      requests.length = 0;
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
  return CLI.run(["init", "--from", id, "--source", sourceDir], project, {
    env: { AGENTS_INC_API_URL: store.url },
  });
}

/**
 * oclif wraps error and warning text at the terminal width and prefixes each continuation with
 * ` ›  `, so a full sentence straddles line breaks in the captured output. Asserting on a short
 * fragment instead would just move the brittleness — it would pass on a message that had been
 * truncated. Undo the wrapping and assert the whole thing.
 */
export function flattenCliOutput(output: string): string {
  return output.replace(/›/g, " ").replace(/\s+/g, " ").trim();
}
