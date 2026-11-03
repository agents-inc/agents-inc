import { createReadStream, existsSync, readdirSync, statSync } from "node:fs"
import { createServer } from "node:http"
import type { IncomingMessage, Server } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import type { Page } from "playwright"

export const DIST = fileURLToPath(new URL("../dist/", import.meta.url))

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
}

export function createDistServer(): Server {
  return createServer((request, response) => {
    const file = distFileOf(requestPath(request))
    if (file === null) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, { "content-type": contentTypeOf(file) })
    createReadStream(file).pipe(response)
  })
}

export function listening(server: Server, port: number): Promise<Server> {
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

export async function visit(
  page: Page,
  port: number,
  path: string
): Promise<void> {
  await page.goto(`http://localhost:${port}${path}`, {
    waitUntil: "networkidle",
  })
}

export function requestPath(request: IncomingMessage): string {
  return (request.url ?? "/").split("?")[0] ?? "/"
}

/** A directory answers with its index.html; null when dist/ has nothing there. */
export function distFileOf(path: string): string | null {
  const candidate = join(DIST, normalize(decodeURI(path)))
  const file =
    existsSync(candidate) && statSync(candidate).isDirectory()
      ? join(candidate, "index.html")
      : candidate
  return existsSync(file) ? file : null
}

export function contentTypeOf(file: string): string {
  return MIME[extname(file)] ?? "application/octet-stream"
}

/** Relative to `directory`, at any depth. */
export function htmlFilesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" }).filter(
    (entry) => entry.endsWith(".html")
  )
}
