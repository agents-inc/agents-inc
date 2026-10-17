import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// A scripted OpenAI Responses API, so the real pinned Codex binary runs offline with only the model's
// turns scripted. Every POST is kept, in order, on `requests`.

export type ResponsesRequestBody = { input?: unknown[] } & Record<string, unknown>;

export type RecordedRequest = { path: string; body: ResponsesRequestBody };

export type ResponseEvent = { type: string } & Record<string, unknown>;

/** `requestNumber` is 1-based across every request the mock has received. */
export type Scenario = (request: ResponsesRequestBody, requestNumber: number) => ResponseEvent[];

export type CodexResponsesMock = {
  /** The server's origin plus `/v1`. */
  baseUrl: string;
  requests: readonly RecordedRequest[];
  close: () => Promise<void>;
};

const RESPONSES_PATH = "/responses";
const API_PREFIX = "/v1";
const LOOPBACK = "127.0.0.1";

// Answers the `/models` probe Codex opens with.
const EMPTY_MODEL_LISTING = JSON.stringify({ object: "list", data: [], models: [] });

export async function startCodexResponsesMock(scenario: Scenario): Promise<CodexResponsesMock> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    void answer(request, response, scenario, requests);
  });

  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  // A TCP listener reports AddressInfo; only a pipe or closed server reports otherwise.
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://${LOOPBACK}:${port}${API_PREFIX}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  scenario: Scenario,
  requests: RecordedRequest[],
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(200, { "content-type": "application/json" }).end(EMPTY_MODEL_LISTING);
    return;
  }

  const path = request.url ?? "";
  const body = parseBody(await readBody(request));
  requests.push({ path, body });

  if (!path.endsWith(RESPONSES_PATH)) {
    response.writeHead(404).end();
    return;
  }

  const payload = streamOf(scenario(body, requests.length));
  response
    .writeHead(200, {
      "content-type": "text/event-stream",
      "content-length": Buffer.byteLength(payload),
    })
    .end(payload);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  // The stream yields `any`; without setEncoding each chunk is bytes.
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));

  return Buffer.concat(chunks).toString("utf-8");
}

// A non-object body is kept whole under `_raw`.
function parseBody(raw: string): ResponsesRequestBody {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : { _raw: raw };
  } catch (error) {
    return { _raw: raw, _parseError: error instanceof Error ? error.message : String(error) };
  }
}

function isRecord(value: unknown): value is ResponsesRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function streamOf(events: readonly ResponseEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

export function respondWith(
  requestNumber: number,
  items: (responseId: string) => ResponseEvent[],
): ResponseEvent[] {
  const responseId = `resp-${requestNumber}`;

  return [responseCreated(responseId), ...items(responseId), responseCompleted(responseId)];
}

export function responseCreated(responseId: string): ResponseEvent {
  return { type: "response.created", response: { id: responseId } };
}

export function responseCompleted(responseId: string): ResponseEvent {
  return {
    type: "response.completed",
    response: {
      id: responseId,
      usage: {
        input_tokens: 0,
        input_tokens_details: null,
        output_tokens: 0,
        output_tokens_details: null,
        total_tokens: 0,
      },
    },
  };
}

export function assistantMessage(responseId: string, text: string): ResponseEvent {
  return outputItem({
    type: "message",
    role: "assistant",
    id: `${responseId}-msg`,
    content: [{ type: "output_text", text }],
  });
}

export function applyPatchCall(callId: string, patch: string): ResponseEvent {
  return outputItem({
    type: "custom_tool_call",
    name: "apply_patch",
    input: patch,
    call_id: callId,
  });
}

/** `namespace` groups multi-agent tools (e.g. `collaboration`). */
export function functionCall(
  callId: string,
  name: string,
  args: Record<string, unknown>,
  namespace?: string,
): ResponseEvent {
  return outputItem({
    type: "function_call",
    call_id: callId,
    name,
    arguments: JSON.stringify(args),
    ...(namespace !== undefined && { namespace }),
  });
}

function outputItem(item: Record<string, unknown>): ResponseEvent {
  return { type: "response.output_item.done", item };
}

export function toolOutputsIn(body: ResponsesRequestBody): Record<string, unknown>[] {
  return (body.input ?? [])
    .filter(isRecord)
    .filter(
      (item) => item.type === "function_call_output" || item.type === "custom_tool_call_output",
    );
}

export function userTextsIn(body: ResponsesRequestBody): string[] {
  return (body.input ?? [])
    .filter(isRecord)
    .filter((item) => item.role === "user")
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter(isRecord)
    .flatMap((part) => (typeof part.text === "string" && part.text !== "" ? [part.text] : []));
}

// `-c` overrides pointing one run at `mock`, so nothing naming it is persisted:
// `["exec", ...mockProviderConfig(mock), prompt]`. Outside a git repo `exec` also needs
// `--skip-git-repo-check`.
export function mockProviderConfig(mock: Pick<CodexResponsesMock, "baseUrl">): string[] {
  return [
    'model_provider="mock"',
    'model_providers.mock.name="mock"',
    `model_providers.mock.base_url="${mock.baseUrl}"`,
    'model_providers.mock.wire_api="responses"',
    "model_providers.mock.requires_openai_auth=false",
    "model_providers.mock.supports_websockets=false",
    'sandbox_mode="workspace-write"',
    'approval_policy="never"',
  ].flatMap((override) => ["-c", override]);
}

export function everyRequestOf(mock: CodexResponsesMock): string {
  return JSON.stringify(mock.requests);
}

const SPAWNED_TASK = "probe";
const SPAWNED_TASK_PATH = `/root/${SPAWNED_TASK}`;

const WAIT_FOR_SUBAGENT_MS = 60_000;

// Root spawns `agentType`, waits on it, and both finish in one `codex exec`. On 0.155.1 `spawn_agent`
// is namespaced `collaboration`, and without `wait_agent` the sub-agent is torn down before it stops.
// The sub-agent's turn is recognised by its message `recipient`, as its content is encrypted.
export function codexDelegationScenario(agentType: string): Scenario {
  return (request, requestNumber) => {
    const input = itemsOf(request);

    if (input.some(isMessageToTheSubagent)) {
      return respondWith(requestNumber, (responseId) => [
        assistantMessage(responseId, "the sub-agent is done"),
      ]);
    }
    if (!input.some(calls("spawn_agent"))) {
      return respondWith(requestNumber, () => [
        functionCall(
          "call-spawn",
          "spawn_agent",
          {
            agent_type: agentType,
            message: "make the change you were asked for",
            task_name: SPAWNED_TASK,
            fork_turns: "none",
          },
          "collaboration",
        ),
      ]);
    }
    if (!input.some(calls("wait_agent"))) {
      return respondWith(requestNumber, () => [
        functionCall(
          "call-wait",
          "wait_agent",
          { timeout_ms: WAIT_FOR_SUBAGENT_MS },
          "collaboration",
        ),
      ]);
    }
    return respondWith(requestNumber, (responseId) => [
      assistantMessage(responseId, "the root is done"),
    ]);
  };
}

function itemsOf(request: ResponsesRequestBody): Record<string, unknown>[] {
  return (request.input ?? []).filter(isRecord);
}

function isMessageToTheSubagent(item: Record<string, unknown>): boolean {
  return item.type === "agent_message" && item.recipient === SPAWNED_TASK_PATH;
}

function calls(name: string) {
  return (item: Record<string, unknown>): boolean =>
    item.type === "function_call" && item.name === name;
}
