// Stands in for a command the local-dev helpers spawn (`bunx wrangler …`, `bun run dev`), so how
// they run a process can be tested without wrangler. It records its pid, then does what
// STAND_IN_COMMAND names. Plain JavaScript: it runs under whatever node runs the suite.
import { writeFileSync } from "node:fs"
import { request } from "node:http"
import { connect } from "node:tls"

const ANSWER_WITHIN_MS = 5_000

// Long enough to outlast an abort, short enough that a helper ignoring one cannot hang the run.
const STOPS_ITSELF_AFTER_MS = 10_000

// What wrangler asks for under an AI agent when its skills cache is a day old.
const AGENT_SKILLS_HOST = "api.github.com"
const AGENT_SKILLS_PATH = "/repos/cloudflare/skills/contents/skills"
const HTTPS_PORT = 443

const LOOPBACK = "127.0.0.1"
const PORT_FLAG = "--port"

const required = (name) => {
  const value = process.env[name]
  if (value === undefined) {
    process.stderr.write(`the stand-in command was run without ${name}\n`)
    process.exit(2)
  }
  return value
}

const behaviour = required("STAND_IN_COMMAND")
const record = required("STAND_IN_COMMAND_RECORD")
const argv = process.argv.slice(2)

const fail = (reason) => {
  process.stderr.write(`${reason}\n`)
  process.exit(1)
}

// The tunnel `HTTPS_PROXY` names, then one request through it, as wrangler's own fetch makes.
const askGitHubThroughTheProxy = () => {
  const proxy = new URL(required("HTTPS_PROXY"))
  const unanswered = setTimeout(() => {
    fail(
      `the GitHub at ${proxy.href} did not answer within ${String(ANSWER_WITHIN_MS)} ms`
    )
  }, ANSWER_WITHIN_MS)

  const tunnel = request({
    host: proxy.hostname,
    port: proxy.port,
    method: "CONNECT",
    path: `${AGENT_SKILLS_HOST}:${String(HTTPS_PORT)}`,
  })
  tunnel.on("error", (error) => fail(error.message))
  tunnel.on("connect", (response, socket) => {
    if (response.statusCode !== 200) {
      fail(`the proxy refused the tunnel: ${String(response.statusCode)}`)
    }
    // NODE_EXTRA_CA_CERTS, read at start-up, is what trusts the stand-in's certificate.
    const secure = connect({ socket, servername: AGENT_SKILLS_HOST })
    secure.on("error", (error) => fail(error.message))
    secure.once("data", () => {
      clearTimeout(unanswered)
      secure.destroy()
      process.exit(0)
    })
    secure.write(
      `GET ${AGENT_SKILLS_PATH} HTTP/1.1\r\nHost: ${AGENT_SKILLS_HOST}\r\nConnection: close\r\n\r\n`
    )
  })
  tunnel.end()
}

// Says it is ready as `wrangler dev` does, when handed a port, then runs until stopped.
const runUntilStopped = (said) => {
  if (said !== null) process.stdout.write(`Ready on ${said}\n`)
  setTimeout(() => process.exit(0), STOPS_ITSELF_AFTER_MS)
}

const portAt = argv.indexOf(PORT_FLAG)
const said = portAt === -1 ? null : `http://${LOOPBACK}:${argv[portAt + 1]}`

writeFileSync(record, JSON.stringify({ pid: process.pid, said }))

if (behaviour === "asks-github") askGitHubThroughTheProxy()
else if (behaviour === "runs-until-stopped") runUntilStopped(said)
else if (behaviour === "never-says-ready") runUntilStopped(null)
else fail(`no stand-in behaviour is called ${behaviour}`)
