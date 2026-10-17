import { readFileSync } from "node:fs"

// Every core colour token must declare a dark value, or it silently keeps its light one.
type Node = {
  $type?: string
  $value?: unknown
  $extensions?: { mode?: { dark?: unknown } }
  [child: string]: unknown
}

type Token = { name: string; node: Node }

// Carries the nearest group `$type` down: DTCG lets a group type its members. Nodes are cast
// because tokens.json is DTCG-shaped by contract.
const colorTokens = (
  node: Node,
  inherited: string | undefined,
  path: readonly string[]
): Token[] => {
  const $type = node.$type ?? inherited
  if (node.$value !== undefined) {
    return $type === "color" ? [{ name: path.join("-"), node }] : []
  }
  return Object.entries(node)
    .filter(([name]) => !name.startsWith("$"))
    .flatMap(([name, child]) =>
      colorTokens(child as Node, $type, [...path, name])
    )
}

const tokens = colorTokens(
  JSON.parse(readFileSync("tokens/tokens.json", "utf8")) as Node,
  undefined,
  []
)

const missing = tokens
  .filter(({ node }) => node.$extensions?.mode?.dark === undefined)
  .map(({ name }) => name)

if (missing.length > 0) {
  console.error(
    `✗ ${missing.length} core colour token(s) have no dark value: ${missing.join(", ")}`
  )
  process.exit(1)
}

console.log(`✓ all ${tokens.length} core colour tokens declare a dark value`)
