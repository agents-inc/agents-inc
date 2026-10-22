import { afterEach, describe, expect, it, vi } from "vitest";

/** Names the editor's address; unset, every link the CLI prints opens the live editor. */
const EDITOR_ADDRESS_VARIABLE = "AGENTS_INC_EDITOR_URL";

/** An editor served beside a local worker, as `AGENTS_INC_API_URL` points at one. */
const LOCAL_EDITOR = "http://localhost:5173/editor";

const SHARE_ID = "Ab3xY9_Q";

describe("the editor the CLI links to", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A literal: it is the address every user's printed link opens.
  it("is the live editor when no other address is set", async () => {
    vi.stubEnv(EDITOR_ADDRESS_VARIABLE, undefined);
    vi.resetModules();

    const { EDITOR_URL, editorConfigUrl } = await import("./consts.js");

    expect(EDITOR_URL).toBe("https://agentsinc.sh/editor");
    expect(editorConfigUrl(SHARE_ID)).toBe(`https://agentsinc.sh/editor/?fromId=${SHARE_ID}`);
  });

  it("is the address the variable names, shared-configuration links included", async () => {
    vi.stubEnv(EDITOR_ADDRESS_VARIABLE, LOCAL_EDITOR);
    vi.resetModules();

    const { EDITOR_URL, editorConfigUrl } = await import("./consts.js");

    expect(EDITOR_URL).toBe(LOCAL_EDITOR);
    expect(editorConfigUrl(SHARE_ID)).toBe(`${LOCAL_EDITOR}/?fromId=${SHARE_ID}`);
  });
});
