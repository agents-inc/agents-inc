import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A scripted stand-in for the OpenAI Responses API, for driving the REAL pinned Codex binary
 * offline: the binary runs its real tools and real hooks, and only the model's turns are scripted.
 *
 * A TypeScript port of the critic's rig from the Codex target research (`mock_responses.py`), which
 * is where every runtime claim in `todo/plans/CLI-codex-target-plan.md` marked [CV] was measured.
 * What was ported is the mechanism — the SSE framing, the event shapes Codex 0.155.1 accepts, the
 * `/models` probe it makes first, the refusal of any POST that is not `/responses`, and the two
 * readers a scenario decides with. What was NOT ported is the rig's own scenarios: each encoded one
 * probe (a marker string in the prompt, a variable naming the spawn arguments), so a scenario here
 * is the caller's function instead, built from the exported event builders.
 *
 * Every request is kept, in order, on {@link CodexResponsesMock.requests}; the rig wrote each to a
 * file, which a spec would only read back.
 */

/** A Responses API request body, as far as a scenario reads it. */
export type ResponsesRequestBody = { input?: unknown[] } & Record<string, unknown>;

/** One POST the mock received. */
export type RecordedRequest = { path: string; body: ResponsesRequestBody };

/** One server-sent event of a streamed response. */
export type ResponseEvent = { type: string } & Record<string, unknown>;

/**
 * Decides one response: given the request and its 1-based position among every request this mock
 * has received, the events to stream back — {@link respondWith} frames them as a whole response.
 */
export type Scenario = (request: ResponsesRequestBody, requestNumber: number) => ResponseEvent[];

export type CodexResponsesMock = {
  /** The base URL a Codex model provider points at — the server's origin plus `/v1`. */
  baseUrl: string;
  /** Every POST received, in arrival order. */
  requests: readonly RecordedRequest[];
  close: () => Promise<void>;
};

/** The one API route the mock answers, under {@link API_PREFIX}. */
const RESPONSES_PATH = "/responses";
const API_PREFIX = "/v1";
const LOOPBACK = "127.0.0.1";

/** What the `/models` probe Codex opens with is answered: an empty listing, which it accepts. */
const EMPTY_MODEL_LISTING = JSON.stringify({ object: "list", data: [], models: [] });

/** Starts the mock on an ephemeral loopback port and answers every `/responses` POST with `scenario`. */
export async function startCodexResponsesMock(scenario: Scenario): Promise<CodexResponsesMock> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    void answer(request, response, scenario, requests);
  });

  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
  // A server listening on a TCP port reports an AddressInfo; only a pipe or a closed server reports
  // anything else, and neither is reachable here.
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
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));

  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * The body as a scenario reads it. A body that is not a JSON object is kept whole under `_raw`, as
 * the rig did — the request is still recorded, and a scenario that expected JSON finds no `input`.
 */
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

/** Server-sent-event framing, one frame per event, named by the event's type. */
function streamOf(events: readonly ResponseEvent[]): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

/**
 * A whole response for request `requestNumber`: opened, then the output items `items` builds for
 * its response id, then completed — the frame the rig sent every response in.
 */
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

/** Completion carrying a zero usage block, as the rig sent it. */
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

/** The model saying `text` and ending its turn. */
export function assistantMessage(responseId: string, text: string): ResponseEvent {
  return outputItem({
    type: "message",
    role: "assistant",
    id: `${responseId}-msg`,
    content: [{ type: "output_text", text }],
  });
}

/** The model calling Codex's `apply_patch` tool with a patch in Codex's own patch grammar. */
export function applyPatchCall(callId: string, patch: string): ResponseEvent {
  return outputItem({
    type: "custom_tool_call",
    name: "apply_patch",
    input: patch,
    call_id: callId,
  });
}

/**
 * The model calling a function tool — `exec_command`, `spawn_agent`, `wait_agent` and the rest.
 * `namespace` is the tool namespace Codex groups multi-agent tools under, when one is asked for.
 */
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

/** The tool results Codex sent back in this request — how a scenario knows which call it is on. */
export function toolOutputsIn(body: ResponsesRequestBody): Record<string, unknown>[] {
  return (body.input ?? [])
    .filter(isRecord)
    .filter(
      (item) => item.type === "function_call_output" || item.type === "custom_tool_call_output",
    );
}

/** Every text the user's messages in this request carry, in order. */
export function userTextsIn(body: ResponsesRequestBody): string[] {
  return (body.input ?? [])
    .filter(isRecord)
    .filter((item) => item.role === "user")
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter(isRecord)
    .flatMap((part) => (typeof part.text === "string" && part.text !== "" ? [part.text] : []));
}

/**
 * The `-c` overrides that point one Codex run at `mock` instead of OpenAI — the provider block the
 * critic's rig wrote into `config.toml`, as flags, so a run carries its own configuration and
 * nothing that names the mock is persisted. They follow the subcommand:
 * `["exec", ...mockProviderConfig(mock), prompt]`.
 *
 * `sandbox_mode = "workspace-write"` is the rig's, and it is not only about the sandbox: under it,
 * `exec` records the directory it runs in as trusted, as a `[projects."<cwd>"]` table in
 * `$CODEX_HOME/config.toml` — observed on 0.155.1, and the one write these overrides lead to.
 * `approval_policy = "never"` stops a non-interactive run waiting on a prompt. Outside a git
 * repository `exec` also needs `--skip-git-repo-check`; an empty `.git` directory does not satisfy
 * it.
 */
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

/**
 * Everything the binary put on the wire across a whole run, as one string to assert against.
 *
 * A string rather than a structure, and deliberately: the house rule is to assert on rendered
 * output rather than to pick it apart, and every claim a spec makes about a request body is "this
 * text reached the model" or "it did not".
 */
export function everyRequestOf(mock: CodexResponsesMock): string {
  return JSON.stringify(mock.requests);
}

/** The canonical task name Codex gives the agent {@link codexDelegationScenario} spawns. */
const SPAWNED_TASK = "probe";
const SPAWNED_TASK_PATH = `/root/${SPAWNED_TASK}`;

/** How long the root waits for its sub-agent before giving up, in the units `wait_agent` takes. */
const WAIT_FOR_SUBAGENT_MS = 60_000;

/**
 * A run in which the root agent delegates to `agentType`, waits for it, and the sub-agent finishes
 * inside one `codex exec`.
 *
 * Shaped by two facts, each measured against the pinned `@openai/codex` 0.155.1 on 2026-09-22:
 *
 * 1. **`spawn_agent` is namespaced `collaboration`**, not `multi_agent_v1`, on this release. A call
 *    sent under the wrong namespace is refused with `unsupported call: <namespace><name>` and the
 *    turn carries on as though the model had said nothing.
 * 2. **The root must WAIT.** Without a `wait_agent` call the root's turn completes, `exec` exits
 *    and the sub-agent is torn down before its stop is dispatched.
 *
 * The sub-agent's messages arrive as `encrypted_content`, so its turn cannot be recognised by
 * reading the task text; it is recognised by the `agent_message` item's `recipient`, which is the
 * canonical task name Codex assigns. Each branch is decided by what Codex sent back, never by a
 * request counter.
 */
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

/** A turn is the sub-agent's when the request carries a message addressed to its canonical name. */
function isMessageToTheSubagent(item: Record<string, unknown>): boolean {
  return item.type === "agent_message" && item.recipient === SPAWNED_TASK_PATH;
}

function calls(name: string) {
  return (item: Record<string, unknown>): boolean =>
    item.type === "function_call" && item.name === name;
}
