/**
 * The one style the two files an install writes are emitted in.
 *
 * Owner ruling, 2026-08-26: `.claude-src/config.ts` and `.claude-src/config-types.ts`
 * land ALREADY FORMATTED, so running prettier over them changes nothing. The
 * settings they are a fixed point of are a USER's rather than this repository's
 * — `parser: "typescript", semi: false, singleQuote: true, printWidth: 100,
 * trailingComma: "all"` — and they match neither of ours on purpose: the bytes
 * land in somebody else's project, and this repository's own copy is named in
 * `.prettierignore` so nothing here ever formats them.
 *
 * PRETTIER IS DELIBERATELY ABSENT FROM THIS MODULE. It is a devDependency, tsup
 * bundles devDependencies, and calling it from here would inline the TypeScript
 * parser into the published CLI and into the editor's lazily-loaded preview
 * chunk. So what is below reproduces what prettier does to these narrow shapes,
 * and prettier appears only in `contract/emission-scenarios.test.ts`, which runs
 * it over every emitter's output and demands it come back unchanged.
 *
 * The rules were measured against prettier 3.9 rather than reasoned about, and
 * every one of them is the same rule: a construct is flat while its whole line
 * fits in {@link PRINT_WIDTH} counting whatever precedes and follows it, and
 * breaks the moment it does not. Two behaviours are relied on and neither is
 * derivable from that: a `//` line cannot be folded back onto one line, so an
 * array carrying one always breaks; and an object literal whose source has a
 * newline after its `{` stays broken however short it is, which is what lets
 * the `export default` table of contents keep its shape.
 */

/** The column an emitted line may reach — `printWidth` in the settings above. */
export const PRINT_WIDTH = 100

/** One level of indentation — `tabWidth` in the settings above. */
export const INDENT_STEP = 2

/** The quote `singleQuote: true` asks for, and the one it falls back to. */
const PREFERRED_QUOTE = "'"
const FALLBACK_QUOTE = '"'

/** A key `quoteProps: "as-needed"` leaves unquoted: a plain identifier. */
const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** The one form an array and a record with nothing in them can take. */
const EMPTY_ARRAY = "[]"
const EMPTY_RECORD = "{}"

/** A JSON object, as distinct from an array, a null or a scalar. */
export function isKeyedRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * A string as a TypeScript literal, in the quote prettier would pick: the
 * preferred one, unless the value holds more of it than of the other and
 * swapping would save escapes. A tie keeps the preferred quote.
 */
export function quoteText(value: string): string {
  const preferred = occurrences(value, PREFERRED_QUOTE)
  const fallback = occurrences(value, FALLBACK_QUOTE)
  const quote = preferred > fallback ? FALLBACK_QUOTE : PREFERRED_QUOTE

  return `${quote}${escapedFor(value, quote)}${quote}`
}

/** An object key, quoted only where it has to be. */
export function renderKey(key: string): string {
  return BARE_KEY.test(key) ? key : quoteText(key)
}

/**
 * What can sit inside an emitted array.
 *
 * A comment is an entry rather than something a caller splices in around the
 * printer, because a `//` line is what forces the array to break — a
 * hand-assembled array with a section comment and one short entry would
 * otherwise be folded back onto one line and lose the comment's position.
 */
export type ArrayEntry =
  | { kind: "value"; value: unknown }
  | { kind: "source"; source: string }
  | { kind: "comment"; text: string }

/** Plain values as array entries. */
export function valueEntries(values: readonly unknown[]): ArrayEntry[] {
  return values.map((value) => ({ kind: "value", value }))
}

/** A `//` line between an array's entries. */
export function commentEntry(text: string): ArrayEntry {
  return { kind: "comment", text }
}

/** An expression written into an array as it stands, such as a spread. */
export function sourceEntry(source: string): ArrayEntry {
  return { kind: "source", source }
}

/**
 * Where a value sits, which is the whole of what decides whether it stays flat.
 */
export type LinePosition = {
  /** Columns of indentation the line starts at, and its closing line returns to. */
  indent: number
  /** What precedes the value on its first line, after the indentation. */
  prefix: string
  /** What follows the value on its last line. */
  suffix: string
}

/** `<indent><prefix><value><suffix>`, broken across lines when it does not fit. */
export function renderValueLine(
  value: unknown,
  position: LinePosition
): string {
  return line(
    renderValue(value, position),
    movesBelowItsPrefix(value),
    position
  )
}

/** The same, for an array whose entries may be comments or written-out source. */
export function renderArrayLine(
  entries: readonly ArrayEntry[],
  position: LinePosition
): string {
  return line(renderArray(entries, position), entries.length === 0, position)
}

/** Which of the three shapes prettier gives a union where it sits. */
export type UnionLayout = "inline" | "indented" | "stacked"

/** A union that has already left the line it was introduced on. */
export type BrokenUnionLayout = Exclude<UnionLayout, "inline">

/** Where a union sits, which is what decides which shape it takes. */
export type UnionPosition = {
  /** Columns before the union on the line it would sit inline on. */
  headWidth: number
  /** Columns after it on that same line. */
  tailWidth: number
  /** Indentation the union's own lines take once it leaves that line. */
  bodyIndent: number
}

/**
 * The shape a union takes, which prettier decides in exactly this order:
 * inline while the whole line fits, then its own indented line while THAT
 * fits, and one member per line under a leading `|` only when neither does.
 */
export function unionLayout(
  members: readonly string[],
  position: UnionPosition
): UnionLayout {
  const flat = flatUnion(members)
  const inlineWidth = position.headWidth + flat.length + position.tailWidth

  return inlineWidth <= PRINT_WIDTH
    ? "inline"
    : brokenUnionLayout(members, position.bodyIndent)
}

/**
 * The same decision for a union that cannot be inline whatever its width — the
 * sectioned ones, whose `// Custom` heading has already broken the line.
 */
export function brokenUnionLayout(
  members: readonly string[],
  bodyIndent: number
): BrokenUnionLayout {
  return bodyIndent + flatUnion(members).length <= PRINT_WIDTH
    ? "indented"
    : "stacked"
}

/** A union's members as their own indented lines, in the shape `layout` names. */
export function renderUnionBody(
  members: readonly string[],
  layout: BrokenUnionLayout,
  bodyIndent: number
): string {
  const padding = spaces(bodyIndent)

  return layout === "indented"
    ? `${padding}${flatUnion(members)}`
    : members.map((member) => `${padding}| ${member}`).join("\n")
}

/** A union's members joined on one line. */
export function flatUnion(members: readonly string[]): string {
  return members.join(" | ")
}

/**
 * `import type { … } from '…'`, one specifier per line once the single-line
 * form no longer fits.
 */
export function renderTypeImportLine(
  specifiers: readonly string[],
  modulePath: string
): string {
  const from = ` from ${quoteText(modulePath)}`
  const inline = `import type { ${specifiers.join(", ")} }${from}`
  if (inline.length <= PRINT_WIDTH) return inline

  const lines = specifiers.map(
    (specifier) => `${spaces(INDENT_STEP)}${specifier},`
  )
  return ["import type {", ...lines, `}${from}`].join("\n")
}

/**
 * The finished line, with the value moved below the `key:` or `= ` that
 * introduces it when it is too wide to stay beside it.
 *
 * A value with a prefix of `""` is an array element, which has nothing above it
 * to move under and stays where it is however wide it runs.
 */
function line(
  rendered: string,
  mayMoveBelowPrefix: boolean,
  position: LinePosition
): string {
  const prefix = position.prefix.trimEnd()
  if (!mayMoveBelowPrefix || prefix === "" || fits(rendered, position)) {
    return asLine(rendered, position)
  }

  const body = `${spaces(position.indent + INDENT_STEP)}${rendered}${position.suffix}`
  return `${spaces(position.indent)}${prefix}\n${body}`
}

/**
 * Whether prettier moves a value below its prefix rather than leaving it past
 * the print width.
 *
 * Nothing in this set can break INSIDE itself, so moving down is the only
 * shortening available to any of them — and the membership was measured
 * against prettier 3.9 rather than reasoned about, because it is not the set a
 * reader would predict: a string, a `null`, an empty array and an empty record
 * all move, while a number and a boolean stay on the line however far past the
 * width they run.
 */
function movesBelowItsPrefix(value: unknown): boolean {
  if (typeof value === "string" || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  return isKeyedRecord(value) && Object.keys(value).length === 0
}

function asLine(rendered: string, position: LinePosition): string {
  return `${spaces(position.indent)}${position.prefix}${rendered}${position.suffix}`
}

/** A value's own text — continuation lines indented, prefix and suffix excluded. */
function renderValue(value: unknown, position: LinePosition): string {
  if (Array.isArray(value)) return renderArray(valueEntries(value), position)
  if (isKeyedRecord(value)) return renderRecord(value, position)
  return renderScalar(value)
}

function renderArray(
  entries: readonly ArrayEntry[],
  position: LinePosition
): string {
  const flat = flatArray(entries)
  if (flat !== undefined && fits(flat, position)) return flat

  const inner = position.indent + INDENT_STEP
  const lines = entries.map((entry) => renderEntryLine(entry, inner))
  return ["[", ...lines, `${spaces(position.indent)}]`].join("\n")
}

function renderEntryLine(entry: ArrayEntry, indent: number): string {
  if (entry.kind === "comment") return `${spaces(indent)}// ${entry.text}`
  if (entry.kind === "source") return `${spaces(indent)}${entry.source},`
  return renderValueLine(entry.value, { indent, prefix: "", suffix: "," })
}

function renderRecord(
  record: Record<string, unknown>,
  position: LinePosition
): string {
  const properties = Object.entries(record)
  // An empty record has nothing to break onto its own lines, so `{}` is the
  // only form it has however little room is left for it.
  if (properties.length === 0) return EMPTY_RECORD

  const flat = flatRecord(record)
  if (fits(flat, position)) return flat

  const inner = position.indent + INDENT_STEP
  const lines = properties.map(([key, value]) =>
    renderValueLine(value, {
      indent: inner,
      prefix: `${renderKey(key)}: `,
      suffix: ",",
    })
  )
  return ["{", ...lines, `${spaces(position.indent)}}`].join("\n")
}

/** The one-line form of an array, or nothing when a comment forbids one. */
function flatArray(entries: readonly ArrayEntry[]): string | undefined {
  const items: string[] = []

  for (const entry of entries) {
    // A `//` line cannot be folded back onto one line, so an array holding one
    // has no flat form at all.
    if (entry.kind === "comment") return undefined
    items.push(entry.kind === "source" ? entry.source : flatValue(entry.value))
  }

  return flatList(items)
}

function flatValue(value: unknown): string {
  if (Array.isArray(value)) return flatList(value.map(flatValue))
  if (isKeyedRecord(value)) return flatRecord(value)
  return renderScalar(value)
}

function flatList(items: readonly string[]): string {
  return items.length === 0 ? EMPTY_ARRAY : `[${items.join(", ")}]`
}

function flatRecord(record: Record<string, unknown>): string {
  const properties = Object.entries(record).map(
    ([key, value]) => `${renderKey(key)}: ${flatValue(value)}`
  )
  return properties.length === 0 ? EMPTY_RECORD : `{ ${properties.join(", ")} }`
}

function renderScalar(value: unknown): string {
  return typeof value === "string" ? quoteText(value) : String(value)
}

function fits(flat: string, position: LinePosition): boolean {
  const width =
    position.indent +
    position.prefix.length +
    flat.length +
    position.suffix.length

  return width <= PRINT_WIDTH
}

function occurrences(value: string, character: string): number {
  return value.split(character).length - 1
}

/**
 * A string's body under one enclosing quote: JSON's own escaping, with the
 * escape moved off the double quote and onto whichever quote encloses it.
 */
function escapedFor(value: string, quote: string): string {
  const jsonBody = JSON.stringify(value).slice(1, -1)
  if (quote === FALLBACK_QUOTE) return jsonBody

  return jsonBody.replaceAll('\\"', '"').replaceAll("'", "\\'")
}

/** That many columns of padding. */
export function spaces(count: number): string {
  return " ".repeat(count)
}
