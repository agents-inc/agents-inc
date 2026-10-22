import { createHash } from "node:crypto";
import http from "node:http";

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

const LOOPBACK = "127.0.0.1";
const ANY_PORT = 0;
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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

// Serves stored bytes as-is, unlike api-mocks' `storedConfigHandlerFor`, which JSON-encodes a value.
const heldBytesHandler = (id: string, bytes: string): RequestHandler =>
  route.get(
    `${CONFIGS_URL}/${id}`,
    () => new HttpResponse(bytes, { headers: { "content-type": "application/json" } }),
  );

const isMint = (req: http.IncomingMessage): boolean => req.method === "POST";

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

  // An uninstallable body is left unfiled, so `configHandlers` answers it with the worker's 400.
  const isInstallable = (body: string): boolean => {
    try {
      return installableSeedPayloadSchema.safeParse(JSON.parse(body)).success;
    } catch {
      return false;
    }
  };

  const file = (body: string): string => {
    const id = contentAddress(body);
    held.set(id, body);
    minted.push(id);
    return id;
  };

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

    const mintedId = isMint(req) && !mintsLimited && isInstallable(body) ? file(body) : undefined;
    const answer = await answerFor(handlersNow(mintedId), workerRequestFrom(req, body));

    if (!answer.served) {
      sendNotModelled(res, req, answer.reason);
      return;
    }

    sendAnswer(res, answer);
  }

  const server = http.createServer((req, res) => {
    // A throw here would leave the spawned CLI waiting on an open socket until the spec times out.
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
    limitMints: () => {
      mintsLimited = true;
    },
    reset: () => {
      held.clear();
      requests.length = 0;
      minted.length = 0;
      mintsLimited = false;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
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
