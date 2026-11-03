import { createHash } from "node:crypto";
import http from "node:http";
import { buffer } from "node:stream/consumers";

import {
  CONFIGS_URL,
  answerFor,
  configHandlers,
  configRateLimitedHandler,
  workerRequestFrom,
} from "@workspace/api-mocks";
import { installableSeedPayloadSchema } from "@workspace/matrix/seed";
import { HttpResponse, http as route } from "msw";

import { CLI, type CLIResult } from "./cli.js";
import {
  closeServer,
  listenOnLoopback,
} from "../../src/cli/lib/__tests__/helpers/loopback-server.js";

import type { ProjectHandle } from "./project-handle.js";
import type { MockedAnswer } from "@workspace/api-mocks";
import type { RequestHandler } from "msw";

type ServedAnswer = Extract<MockedAnswer, { served: true }>;

export type SeedConfigRequest = {
  url: string;
  userAgent: string | undefined;
  method: string | undefined;
  body: string;
};

export type SeedConfigStore = {
  /** Passed to the CLI as `AGENTS_INC_API_URL`. */
  url: string;
  readonly requests: SeedConfigRequest[];
  readonly minted: string[];
  /** A string is served verbatim (to pin a body the schema refuses); anything else is JSON-encoded. */
  publish(id: string, payload: unknown): void;
  /** Answers every mint with the worker's 429 until `reset`, filing nothing. */
  limitMints(): void;
  reset(): void;
  close(): Promise<void>;
};

const ID_LENGTH = 8;
const CREATED = 201;
// Not 404, which would read as "id not held" rather than "route not described".
const NOT_MODELLED = 501;
const RESOLVER_FAILED = 500;

// As the worker derives it, so a re-share of the same configuration returns the same id.
function contentAddress(body: string): string {
  return createHash("sha256")
    .update(body)
    .digest("base64url")
    .replaceAll("=", "")
    .slice(0, ID_LENGTH);
}

// Serves stored bytes as-is, unlike api-mocks' `storedConfigHandlerFor`, which JSON-encodes a value.
const heldBytesHandler = (id: string, bytes: string): RequestHandler =>
  route.get(
    `${CONFIGS_URL}/${id}`,
    () => new HttpResponse(bytes, { headers: { "content-type": "application/json" } }),
  );

const isMint = (req: http.IncomingMessage): boolean => req.method === "POST";

// An uninstallable body is left unfiled, so `configHandlers` answers it with the worker's 400.
function isInstallable(body: string): boolean {
  try {
    return installableSeedPayloadSchema.safeParse(JSON.parse(body)).success;
  } catch {
    return false;
  }
}

function requestRecordOf(req: http.IncomingMessage, body: string): SeedConfigRequest {
  return { url: req.url ?? "", userAgent: req.headers["user-agent"], method: req.method, body };
}

function sendAnswer(res: http.ServerResponse, answer: ServedAnswer): void {
  res.writeHead(answer.status, answer.headers);
  res.end(Buffer.from(answer.body));
}

function sendNotModelled(
  res: http.ServerResponse,
  req: http.IncomingMessage,
  reason: string,
): void {
  res.writeHead(NOT_MODELLED, { "content-type": "text/plain" });
  res.end(`No mocked answer for ${req.method ?? "GET"} ${req.url ?? "/"} (${reason})`);
}

// Unanswered, the spawned CLI would wait on an open socket until the spec times out.
function sendResolverFailure(res: http.ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(RESOLVER_FAILED, { "content-type": "text/plain" });
  res.end(String(error));
}

// `configHandlers` mints one fixed id; a store must return the id it filed the body under.
const mintedHandler = (id: string): RequestHandler =>
  route.post(CONFIGS_URL, () => HttpResponse.json({ id }, { status: CREATED }));

// A real HTTP server, since specs spawn bin/run.js and no in-process mock reaches a child's network.
// Answers come from `@workspace/api-mocks`, so the worker's responses are stated once.
export async function startSeedConfigStore(): Promise<SeedConfigStore> {
  const held = new Map<string, string>();
  const requests: SeedConfigRequest[] = [];
  const minted: string[] = [];
  let mintsLimited = false;

  // Rebuilt per request; held ids first, then the mint, then `configHandlers` for 404s and 400s.
  const handlersNow = (mintedId: string | undefined): RequestHandler[] => [
    ...[...held].map(([id, bytes]) => heldBytesHandler(id, bytes)),
    ...(mintsLimited ? [configRateLimitedHandler] : []),
    ...(mintedId === undefined ? [] : [mintedHandler(mintedId)]),
    ...configHandlers,
  ];

  const file = (body: string): string => {
    const id = contentAddress(body);
    held.set(id, body);
    minted.push(id);
    return id;
  };

  async function serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = (await buffer(req)).toString("utf8");
    requests.push(requestRecordOf(req, body));

    const mintedId = isMint(req) && !mintsLimited && isInstallable(body) ? file(body) : undefined;
    const answer = await answerFor(handlersNow(mintedId), workerRequestFrom(req, body));

    if (!answer.served) {
      sendNotModelled(res, req, answer.reason);
      return;
    }

    sendAnswer(res, answer);
  }

  const server = http.createServer((req, res) => {
    void serve(req, res).catch((error: unknown) => sendResolverFailure(res, error));
  });
  const { origin } = await listenOnLoopback(server);

  return {
    url: origin,
    requests,
    minted,
    publish: (id, payload) => {
      held.set(id, typeof payload === "string" ? payload : JSON.stringify(payload));
    },
    limitMints: () => {
      mintsLimited = true;
    },
    reset: () => {
      held.clear();
      requests.length = 0;
      minted.length = 0;
      mintsLimited = false;
    },
    close: () => closeServer(server),
  };
}

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

export function runShare(store: SeedConfigStore, project: ProjectHandle): Promise<CLIResult> {
  return CLI.run(["share"], project, { env: { AGENTS_INC_API_URL: store.url } });
}

// No TTY in the spawned process, so the editor link is printed rather than opened.
export function runEditUi(store: SeedConfigStore, project: ProjectHandle): Promise<CLIResult> {
  return CLI.run(["edit", "--ui"], project, { env: { AGENTS_INC_API_URL: store.url } });
}

// No TTY, so the command refuses its destructive apply; the approving half runs under the PTY harness.
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
