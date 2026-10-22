import { afterEach, describe, expect, it, vi } from "vitest";

/** The worker the CLI reads shared configurations from; where it runs decides the editor. */
const WORKER_ADDRESS_VARIABLE = "AGENTS_INC_API_URL";

/** The editor's dev server, the one a worker running on this machine lets in. */
const LOCAL_EDITOR = "http://localhost:5173/editor";

const LIVE_EDITOR = "https://agentsinc.sh/editor";

const SHARE_ID = "Ab3xY9_Q";

async function constsBeside(workerAddress: string | undefined) {
  vi.stubEnv(WORKER_ADDRESS_VARIABLE, workerAddress);
  vi.resetModules();
  return import("./consts.js");
}

describe("the editor the CLI links to", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A literal: it is the address every user's printed link opens.
  it("is the live editor when no worker address is set", async () => {
    const { EDITOR_URL, editorConfigUrl } = await constsBeside(undefined);

    expect(EDITOR_URL).toBe(LIVE_EDITOR);
    expect(editorConfigUrl(SHARE_ID)).toBe(`${LIVE_EDITOR}/?fromId=${SHARE_ID}`);
  });

  it.each(["https://api.agentsinc.sh", "https://localhost.example.com", "http://127.example.com"])(
    "is the live editor beside a worker at %s, which is not this machine",
    async (workerAddress) => {
      const { EDITOR_URL, editorConfigUrl } = await constsBeside(workerAddress);

      expect(EDITOR_URL).toBe(LIVE_EDITOR);
      expect(editorConfigUrl(SHARE_ID)).toBe(`${LIVE_EDITOR}/?fromId=${SHARE_ID}`);
    },
  );

  it.each([
    "http://localhost:8787",
    "http://LOCALHOST:8787",
    "http://127.0.0.1:8787",
    "http://127.0.0.2:1",
    "http://[::1]:8787",
  ])(
    "is the local editor, shared-configuration links included, beside a worker at %s",
    async (workerAddress) => {
      const { EDITOR_URL, editorConfigUrl } = await constsBeside(workerAddress);

      expect(EDITOR_URL).toBe(LOCAL_EDITOR);
      expect(editorConfigUrl(SHARE_ID)).toBe(`${LOCAL_EDITOR}/?fromId=${SHARE_ID}`);
    },
  );
});

describe("the editor the help text names", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, "agentsinc.sh/editor"],
    ["https://api.agentsinc.sh", "agentsinc.sh/editor"],
    ["http://localhost:8787", "localhost:5173/editor"],
    ["http://[::1]:8787", "localhost:5173/editor"],
  ])("beside a worker at %s, is %s", async (workerAddress, address) => {
    const { EDITOR_ADDRESS } = await constsBeside(workerAddress);

    expect(EDITOR_ADDRESS).toBe(address);
  });
});
