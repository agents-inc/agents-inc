import { readFileSync } from "node:fs"

/**
 * Every core colour token must declare a dark value.
 *
 * The standing rule (owner, 2026-08-29) is that a token added from now on
 * carries its dark complement. Terrazzo makes forgetting hard — both values sit
 * on the same token — but not impossible, since `$extensions.mode.dark` is
 * optional and a token without one silently keeps its light value on a dark
 * ground. That is the failure this exists to catch: not an error, just a colour
 * that is wrong in one theme and looks deliberate.
 */
type Node = {
  $type?: string
  $value?: unknown
  $extensions?: { mode?: { dark?: unknown } }
  [child: string]: unknown
}

type Token = { name: string; node: Node }

/**
 * DTCG lets any group declare `$type` for everything beneath it, so a colour
 * token need not carry one of its own — and Terrazzo builds those tokens like
 * any other. A check that reads `$type` only off the token itself is therefore
 * blind to exactly the tokens it is for: reproduced by giving a group `$type:
 * "color"` and a member no dark value, which Terrazzo emitted and this file
 * passed. Hence the walk carries the nearest declared type down with it.
 *
 * Recursion rather than a fixed group/token pair because DTCG nests to any
 * depth, and `$value` is what separates a token from a group at every level.
 */
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
