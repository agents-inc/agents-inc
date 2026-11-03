import type { Server } from "node:http";

const LOOPBACK = "127.0.0.1";
const ANY_PORT = 0;

export type LoopbackAddress = { origin: string; port: number };

/** Binds `server` to a free port on this machine, reachable by any child process a spec starts. */
export async function listenOnLoopback(server: Server): Promise<LoopbackAddress> {
  await new Promise<void>((resolve) => server.listen(ANY_PORT, LOOPBACK, resolve));

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the server did not bind to a TCP port");
  }

  return { origin: `http://${LOOPBACK}:${address.port}`, port: address.port };
}

/** Settles once the server stops listening, even when it was not listening to begin with. */
export function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
