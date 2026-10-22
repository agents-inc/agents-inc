/**
 * Emits an install's `config.ts` and `config-types.ts` already prettier-formatted under the user's
 * settings (`semi: false, singleQuote: true, printWidth: 100, trailingComma: "all"`). Prettier is
 * not imported: it would bundle the TypeScript parser into the CLI and the editor preview.
 * `contract/emission-scenarios.test.ts` checks prettier leaves the output unchanged.
 */

const PRINT_WIDTH = 100

export const INDENT_STEP = 2

/** Prettier's `isObjectPropertyWithShortKey`: a key narrower than this keeps its value beside it. */
const SHORT_KEY_WIDTH = INDENT_STEP + 3

const PREFERRED_QUOTE = "'"
const FALLBACK_QUOTE = '"'

/** `quoteProps: "as-needed"` leaves a plain identifier unquoted. */
const BARE_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const EMPTY_ARRAY = "[]"
const EMPTY_RECORD = "{}"

export function isKeyedRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Prettier's pick: the preferred quote unless swapping saves escapes; a tie keeps it. */
export function quoteText(value: string): string {
  const preferred = occurrences(value, PREFERRED_QUOTE)
  const fallback = occurrences(value, FALLBACK_QUOTE)
  const quote = preferred > fallback ? FALLBACK_QUOTE : PREFERRED_QUOTE

  return `${quote}${escapedFor(value, quote)}${quote}`
}

export function renderKey(key: string): string {
  return BARE_KEY.test(key) ? key : quoteText(key)
}

/** A comment is an entry because a `//` line is what forces the array to break. */
export type ArrayEntry =
  | { kind: "value"; value: unknown }
  | { kind: "source"; source: string }
  | { kind: "comment"; text: string }

export function valueEntries(values: readonly unknown[]): ArrayEntry[] {
  return values.map((value) => ({ kind: "value", value }))
}

export function commentEntry(text: string): ArrayEntry {
  return { kind: "comment", text }
}

export function sourceEntry(source: string): ArrayEntry {
  return { kind: "source", source }
}

export type LinePosition = {
  /** Columns of indentation the line starts at, and its closing line returns to. */
  indent: number
  /** What precedes the value on its first line, after the indentation. */
  prefix: string
  /** What follows the value on its last line. */
  suffix: string
  /** The printed key, when the value is an object property's. */
  key?: string
}

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

export function renderArrayLine(
  entries: readonly ArrayEntry[],
  position: LinePosition
): string {
  return line(renderArray(entries, position), entries.length === 0, position)
}

export type UnionLayout = "inline" | "indented" | "stacked"

export type BrokenUnionLayout = Exclude<UnionLayout, "inline">

export type UnionPosition = {
  /** Columns before the union on the line it would sit inline on. */
  headWidth: number
  /** Columns after it on that same line. */
  tailWidth: number
  /** Indentation the union's own lines take once it leaves that line. */
  bodyIndent: number
}

/** Inline if the line fits, else its own indented line if that fits, else one member per line. */
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

/** For sectioned unions, whose `// Custom` heading already broke the line. */
export function brokenUnionLayout(
  members: readonly string[],
  bodyIndent: number
): BrokenUnionLayout {
  return bodyIndent + flatUnion(members).length <= PRINT_WIDTH
    ? "indented"
    : "stacked"
}

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

export function flatUnion(members: readonly string[]): string {
  return members.join(" | ")
}

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

/** An array element (empty prefix) has nothing to move under and stays put. */
function line(
  rendered: string,
  mayMoveBelowPrefix: boolean,
  position: LinePosition
): string {
  const prefix = position.prefix.trimEnd()
  if (
    !mayMoveBelowPrefix ||
    prefix === "" ||
    hasShortKey(position) ||
    fits(rendered, position)
  ) {
    return asLine(rendered, position)
  }

  const body = `${spaces(position.indent + INDENT_STEP)}${rendered}${position.suffix}`
  return `${spaces(position.indent)}${prefix}\n${body}`
}

function hasShortKey({ key }: LinePosition): boolean {
  return key !== undefined && key.length < SHORT_KEY_WIDTH
}

/**
 * Measured against prettier 3.9: strings, `null` and empty arrays/records move below their prefix;
 * numbers and booleans stay on the line however wide.
 */
function movesBelowItsPrefix(value: unknown): boolean {
  if (typeof value === "string" || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  return isKeyedRecord(value) && Object.keys(value).length === 0
}

function asLine(rendered: string, position: LinePosition): string {
  return `${spaces(position.indent)}${position.prefix}${rendered}${position.suffix}`
}

function renderValue(value: unknown, position: LinePosition): string {
  if (Array.isArray(value)) return renderArray(valueEntries(value), position)
  if (isKeyedRecord(value)) return renderRecord(value, position)
  return renderScalar(value)
}

function renderArray(
  entries: readonly ArrayEntry[],
  position: LinePosition
): string {
  // Breaking it would print `[` and `]` on two lines; `line` moves it below its prefix instead.
  if (entries.length === 0) return EMPTY_ARRAY

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
  if (properties.length === 0) return EMPTY_RECORD

  const flat = flatRecord(record)
  if (fits(flat, position)) return flat

  const inner = position.indent + INDENT_STEP
  const lines = properties.map(([key, value]) =>
    renderValueLine(value, propertyPosition(key, inner))
  )
  return ["{", ...lines, `${spaces(position.indent)}}`].join("\n")
}

export function propertyPosition(key: string, indent: number): LinePosition {
  const printed = renderKey(key)
  return { indent, prefix: `${printed}: `, suffix: ",", key: printed }
}

function flatArray(entries: readonly ArrayEntry[]): string | undefined {
  const items: string[] = []

  for (const entry of entries) {
    // A `//` line cannot fold onto one line.
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

/** JSON escaping, with the escape moved onto whichever quote encloses the string. */
function escapedFor(value: string, quote: string): string {
  const jsonBody = JSON.stringify(value).slice(1, -1)
  if (quote === FALLBACK_QUOTE) return jsonBody

  return jsonBody.replaceAll('\\"', '"').replaceAll("'", "\\'")
}

export function spaces(count: number): string {
  return " ".repeat(count)
}
