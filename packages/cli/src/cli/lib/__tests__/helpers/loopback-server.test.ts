import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { closeServer, listenOnLoopback } from "./loopback-server.js";

const ANSWER = "answered from this machine";

function answeringServer(): Server {
  return createServer((_request, response) => response.end(ANSWER));
}

describe("listenOnLoopback", () => {
  let server: Server;

  afterEach(async () => {
    await closeServer(server);
  });

  it("answers at the origin it reports, on the loopback address", async () => {
    server = answeringServer();

    const { origin } = await listenOnLoopback(server);

    expect(new URL(origin).hostname).toBe("127.0.0.1");
    expect(await (await fetch(origin)).text()).toBe(ANSWER);
  });

  it("reports the port the origin names, picked free rather than fixed", async () => {
    server = answeringServer();
    const other = answeringServer();

    const { origin, port } = await listenOnLoopback(server);
    const otherAddress = await listenOnLoopback(other);
    await closeServer(other);

    expect(new URL(origin).port).toBe(String(port));
    expect(port).not.toBe(0);
    expect(otherAddress.port).not.toBe(port);
  });
});

describe("closeServer", () => {
  it("stops the server answering", async () => {
    const server = answeringServer();
    const { origin } = await listenOnLoopback(server);

    await closeServer(server);

    expect(server.listening).toBe(false);
    await expect(fetch(origin)).rejects.toThrow();
  });

  it("settles for a server that was never listening", async () => {
    await expect(closeServer(answeringServer())).resolves.toBeUndefined();
  });
});
