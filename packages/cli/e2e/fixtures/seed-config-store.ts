import { createHash } from "node:crypto";
import http from "node:http";

import { CONFIGS_URL, answerFor, configHandlers, workerRequestFrom } from "@workspace/api-mocks";
import { HttpResponse, http as route } from "msw";

import { CLI, type CLIResult } from "./cli.js";

import type { ProjectHandle } from "../pages/wizard-result.js";
import type { MockedAnswer } from "@workspace/api-mocks";
import type { RequestHandler } from "msw";

/** What a handler said, as opposed to why it said nothing. */
type ServedAnswer = Extract<MockedAnswer, { served: true }>;

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

const LOOPBACK = "127.0.0.1";
const ANY_PORT = 0;
/** The worker truncates its content address to this many base64url characters. */
const ID_LENGTH = 8;
const CREATED = 201;
/**
 * A route these handlers do not describe. Loud on purpose: answering 404 would make a request this
 * store has nothing to say about indistinguishable from an id it really does not hold.
 */
const NOT_MODELLED = 501;
/** The resolver itself failed — this store's own bug, reported as one rather than as a hang. */
const RESOLVER_FAILED = 500;

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
 * One id this store holds, answering with the bytes it was given.
 *
 * `storedConfigHandlerFor` in `@workspace/api-mocks` is the same idea and is deliberately not used
 * here: it is handed a VALUE and JSON-encodes it, where a store holds BYTES — which is what KV
 * holds, what a POST arrives as, and what lets `publish` serve a string verbatim so a spec can pin
 * a body the schema must refuse.
 */
const heldBytesHandler = (id: string, bytes: string): RequestHandler =>
  route.get(
    `${CONFIGS_URL}/${id}`,
    () => new HttpResponse(bytes, { headers: { "content-type": "application/json" } }),
  );

/** The mint — the one request that changes what this store holds. */
const isMint = (req: http.IncomingMessage): boolean => req.method === "POST";

/** Hands the caller what a handler said, headers and all. */
function sendAnswer(res: http.ServerResponse, answer: ServedAnswer): void {
  res.writeHead(answer.status, answer.headers);
  res.end(Buffer.from(answer.body));
}

/**
 * Hands the caller a refusal naming the request no handler claimed, and why.
 *
 * Loud rather than a 404, because the two are not the same thing: a 404 says this store does not
 * hold that id, and this says nobody has described the route at all.
 */
function sendNotModelled(
  res: http.ServerResponse,
  req: http.IncomingMessage,
  reason: string,
): void {
  res.writeHead(NOT_MODELLED, { "content-type": "text/plain" });
  res.end(`No mocked answer for ${req.method ?? "GET"} ${req.url ?? "/"} (${reason})`);
}

/**
 * The mint, which is the one route `@workspace/api-mocks` cannot answer for this store.
 *
 * `configHandlers` answers `POST /configs` with one fixed id, because that package describes what
 * the worker SAYS and deliberately stores nothing. A store has to hand back the id it filed the
 * body under, and this one files it where the worker does — under the body's own hash.
 */
const mintedHandler = (id: string): RequestHandler =>
  route.post(CONFIGS_URL, () => HttpResponse.json({ id }, { status: CREATED }));

/**
 * A local stand-in for the agentsinc.sh config store: `GET /configs/<id>` returns the payload
 * published under that id and 404s an id that was never published, exactly as the worker does.
 *
 * A real server rather than a module mock, because the specs that use it exist to cover the whole
 * path — argument parsing, network, decode, mapping, and the same write/install/compile pipeline
 * the wizard uses. A mocked fetch would skip the two seams most likely to break: the flag reaching
 * the command, and the payload surviving the wire. It also could not be one: the e2e suite spawns
 * `bin/run.js`, and nothing in this process can intercept a child's network.
 *
 * What it ANSWERS with comes from `@workspace/api-mocks` all the same, resolved through `answerFor`
 * — so the worker's words are stated once for this suite and the editor's alike. They had already
 * diverged where they were written twice: the 404 body here read `"No config under this id"` and
 * the CLI's own unit fixture for the same response read `"no config"`.
 */
export async function startSeedConfigStore(): Promise<SeedConfigStore> {
  const held = new Map<string, string>();
  const requests: SeedConfigRequest[] = [];
  const minted: string[] = [];

  /**
   * What this store answers with right now. Rebuilt per request because its contents move, and
   * ordered as `use()` orders handlers: the ids it holds claim their own routes first, then the
   * mint for the id this request is filing, and `configHandlers` answers everything else — which
   * is where an id nobody published gets the worker's own 404.
   */
  const handlersNow = (mintedId: string | undefined): RequestHandler[] => [
    ...[...held].map(([id, bytes]) => heldBytesHandler(id, bytes)),
    ...(mintedId === undefined ? [] : [mintedHandler(mintedId)]),
    ...configHandlers,
  ];

  /** Files a posted body under its content address, and reports the id it was filed under. */
  const file = (body: string): string => {
    const id = contentAddress(body);
    held.set(id, body);
    minted.push(id);
    return id;
  };

  /** Notes one request in the terms a spec reads them back in. */
  const record = (req: http.IncomingMessage, body: string): void => {
    requests.push({
      url: req.url ?? "",
      userAgent: req.headers["user-agent"],
      method: req.method,
      body,
    });
  };

  async function serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readBody(req);
    record(req, body);

    const mintedId = isMint(req) ? file(body) : undefined;
    const answer = await answerFor(handlersNow(mintedId), workerRequestFrom(req, body));

    if (!answer.served) {
      sendNotModelled(res, req, answer.reason);
      return;
    }

    sendAnswer(res, answer);
  }

  const server = http.createServer((req, res) => {
    // Answered rather than left to an unhandled rejection: a throw in here would leave the socket
    // open and the spawned CLI waiting on it, which reaches a spec as a 45-second timeout naming
    // nothing at all.
    void serve(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.writeHead(RESOLVER_FAILED, { "content-type": "text/plain" });
      res.end(String(error));
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
      held.set(id, typeof payload === "string" ? payload : JSON.stringify(payload));
    },
    reset: () => {
      held.clear();
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
