import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { TLSSocket } from "node:tls"

import {
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
} from "@workspace/api-mocks/fixtures"
import { HttpResponse, getResponse, http } from "msw"

import type { IncomingMessage, ServerResponse } from "node:http"
import type { Duplex } from "node:stream"
import type { RequestHandler } from "msw"

// GitHub, for a process this suite spawns rather than one it runs in.
//
// msw intercepts inside the process that installs it, and `bun run dev` is a
// tree of other processes — so the crawl it runs can only be answered from
// outside, on the network path. This is that path: an HTTPS proxy the whole
// tree is pointed at through `HTTPS_PROXY`, which opens a tunnel to GitHub's two
// hosts only and answers what arrives through it from msw handlers, resolved
// with msw's own `getResponse` — what `answerFor` in `@workspace/api-mocks`
// does, and for the same reason. (That package's root entry cannot be imported
// under this tsconfig; the TS2379 note at the top of src/crawl.test.ts says
// why.)
//
// The tunnel is real TLS. Its certificate is made for the run and trusted
// through NODE_EXTRA_CA_CERTS, which bun and Node both read, so certificate
// checking stays ON: a process told to skip it would skip it for every host,
// not only these two.
//
// Any other host is refused at the tunnel, so nothing the tree reaches for
// beyond GitHub leaves the machine either.

const GITHUB_HOSTS = [GITHUB_API_ORIGIN, GITHUB_RAW_ORIGIN].map(
  (origin) => new URL(origin).hostname
)

const LOOPBACK = "127.0.0.1"

/** One entry of a git tree, in the three fields the crawl reads. */
export type StandInTreeEntry = { path: string; type: string; size?: number }

export type StandInRepo = {
  stars: number
  defaultBranch: string
  /** The git tree, as the API reports it. */
  tree: readonly StandInTreeEntry[]
  /** Path → what raw.githubusercontent serves. A tree path absent here 404s. */
  files: Readonly<Record<string, string>>
}

export type StandInGitHub = {
  /** What a spawned process needs in its environment to reach this, not GitHub. */
  environment: Record<string, string>
  /** Every URL GitHub would have been asked for, in order. */
  requested: () => readonly string[]
  close: () => Promise<void>
}

type RepoParams = { owner: string; name: string }

const notFound = () =>
  HttpResponse.json({ message: "Not Found" }, { status: 404 })

// `/{owner}/{name}/{branch}/{path...}` minus its first three segments — read
// off the URL, as src/crawl.test.ts does and for its reason.
const fileRequestedBy = (url: string) =>
  new URL(url).pathname.split("/").slice(4).join("/")

/** GitHub's three answers the crawl reads, for the repositories given. */
export const githubServing = (
  repos: Readonly<Record<string, StandInRepo>>
): RequestHandler[] => {
  const repoAt = ({ owner, name }: RepoParams) => repos[`${owner}/${name}`]

  return [
    http.get<RepoParams>(
      `${GITHUB_API_ORIGIN}/repos/:owner/:name`,
      ({ params }) => {
        const repo = repoAt(params)
        if (repo === undefined) return notFound()
        return HttpResponse.json({
          stargazers_count: repo.stars,
          default_branch: repo.defaultBranch,
        })
      }
    ),
    http.get<RepoParams & { branch: string }>(
      `${GITHUB_API_ORIGIN}/repos/:owner/:name/git/trees/:branch`,
      ({ params }) => {
        const repo = repoAt(params)
        if (repo?.defaultBranch !== params.branch) return notFound()
        return HttpResponse.json({ truncated: false, tree: repo.tree })
      }
    ),
    http.get<RepoParams>(
      `${GITHUB_RAW_ORIGIN}/:owner/:name/:branch/*`,
      ({ params, request }) => {
        const file = repoAt(params)?.files[fileRequestedBy(request.url)]
        return file === undefined ? notFound() : HttpResponse.text(file)
      }
    ),
  ]
}

const makeCertificate = (directory: string) => {
  const keyPath = join(directory, "stand-in-github.key.pem")
  const certPath = join(directory, "stand-in-github.cert.pem")
  const made = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=stand-in GitHub",
      "-addext",
      `subjectAltName=${GITHUB_HOSTS.map((host) => `DNS:${host}`).join(",")}`,
    ],
    { encoding: "utf8" }
  )
  if (made.status !== 0) {
    throw new Error(
      `openssl could not make the stand-in GitHub's certificate: ${made.error?.message ?? made.stderr}`
    )
  }
  return { certPath, cert: readFileSync(certPath), key: readFileSync(keyPath) }
}

const headersOf = (incoming: IncomingMessage): [string, string][] =>
  Object.entries(incoming.headers).flatMap(([name, value]) =>
    typeof value === "string" && name !== "host" ? [[name, value]] : []
  )

const answerWith =
  (handlers: RequestHandler[], requested: string[]) =>
  async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const url = `https://${incoming.headers.host ?? ""}${incoming.url ?? "/"}`
    requested.push(url)
    const response = await getResponse(
      handlers,
      new Request(url, {
        method: incoming.method ?? "GET",
        headers: headersOf(incoming),
      })
    )
    if (response === undefined) {
      outgoing
        .writeHead(501)
        .end(`The stand-in GitHub has no answer for ${url}`)
      return
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  }

const listenOnLoopback = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, LOOPBACK, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        reject(new Error("the stand-in GitHub's proxy has no port"))
        return
      }
      resolve(address.port)
    })
  })

/** Starts the proxy. `directory` holds its certificate for the run. */
export const startStandInGitHub = async (
  directory: string,
  handlers: RequestHandler[]
): Promise<StandInGitHub> => {
  const { certPath, cert, key } = makeCertificate(directory)
  const requested: string[] = []
  const tunnels = new Set<Duplex>()

  const github = createServer((incoming, outgoing) => {
    void answerWith(handlers, requested)(incoming, outgoing)
  })

  const proxy = createServer((_incoming, outgoing) => {
    outgoing.writeHead(403).end("Only HTTPS to GitHub goes through here")
  })
  proxy.on("connect", (request: IncomingMessage, socket: Duplex) => {
    socket.on("error", () => undefined)
    const host = (request.url ?? "").replace(/:\d+$/, "")
    if (!GITHUB_HOSTS.includes(host)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n")
      return
    }
    tunnels.add(socket)
    socket.once("close", () => tunnels.delete(socket))
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
    const secure = new TLSSocket(socket, { isServer: true, cert, key })
    secure.on("error", () => undefined)
    github.emit("connection", secure)
  })

  const port = await listenOnLoopback(proxy)
  const address = `http://${LOOPBACK}:${String(port)}`

  return {
    environment: {
      HTTPS_PROXY: address,
      https_proxy: address,
      NO_PROXY: `localhost,${LOOPBACK}`,
      no_proxy: `localhost,${LOOPBACK}`,
      NODE_EXTRA_CA_CERTS: certPath,
    },
    requested: () => [...requested],
    close: async () => {
      for (const tunnel of tunnels) tunnel.destroy()
      github.closeAllConnections()
      proxy.closeAllConnections()
      await Promise.all(
        [github, proxy].map(
          (server) =>
            new Promise<void>((resolve) => {
              server.close(() => resolve())
            })
        )
      )
    },
  }
}
