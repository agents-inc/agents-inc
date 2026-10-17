/**
 * Holds that the command reference's matrix names every command (aliases
 * included) under packages/cli/src/cli/commands/** and no other, and per row
 * exactly the visible flags that command declares. Membership both ways, since
 * a count cannot see a swap. Reads source, not a build. An empty read refuses.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

// oclif's `pattern` strategy: every module here is a command.
const COMMANDS_DIR = fileURLToPath(
  new URL("../../../packages/cli/src/cli/commands/", import.meta.url)
)

const REFERENCE = fileURLToPath(
  new URL("../src/content/docs/docs/reference/commands.md", import.meta.url)
)

const COMMANDS_DIR_LABEL = "packages/cli/src/cli/commands/"
const REFERENCE_LABEL = "src/content/docs/docs/reference/commands.md"

// Per `oclif.topicSeparator`.
const TOPIC_SEPARATOR = " "

const MODULE_EXTENSIONS = [".ts", ".tsx"]

/** A spec beside a command module is not a command. */
const SPEC_SUFFIXES = [".test.ts", ".test.tsx"]

const ALIASES_MEMBER = "aliases"
const FLAGS_MEMBER = "flags"

const FLAG_CHAR_OPTION = "char"
const FLAG_HIDDEN_OPTION = "hidden"

// Each marker must appear exactly once, or the wrong table could be read.
const MATRIX_OPENS_AT = "## Command matrix"
const MATRIX_CLOSES_AT = "**This table is the roster, and it is checked.**"

// Read by name; a renamed heading refuses.
const COMMAND_COLUMN = "Command"
const FLAGS_COLUMN = "Flags"

const TABLE_CELL_DELIMITER = "|"

const TABLE_RULE = /^\|[\s:|-]+\|\s*$/

const CODE_SPAN = /`([^`]+)`/g

/** The `<id>` or `<name>` a cell writes beside a command or a flag that takes a value. */
const VALUE_PLACEHOLDER = /\s*<[^>]*>/g

const MODULE_EXTENSION = /\.[^.]+$/

type Command = { id: string; aliases: string[]; flags: string[] }

type MatrixRow = { command: string; aliases: string[]; flags: string[] }

type Drift = {
  claim: string
  namedButAbsent: string[]
  presentButUnnamed: string[]
}

function main(): void {
  const commands = readCommands()
  const rows = readMatrixRows()

  const drift = [
    driftBetween("the command roster", rosterOf(commands), rosterNamedBy(rows)),
    driftBetween("each command's flags", flagsOf(commands), flagsNamedBy(rows)),
  ].filter(isDrift)

  exitWith(drift, commands)
}

function readCommands(): Command[] {
  if (!existsSync(COMMANDS_DIR)) {
    refuse(`there is no command tree at ${COMMANDS_DIR_LABEL}`)
  }

  const commands = modulesUnder(COMMANDS_DIR).map(readCommand)
  if (commands.length === 0) {
    refuse(`${COMMANDS_DIR_LABEL} holds no command modules`)
  }

  return commands
}

function modulesUnder(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(prefix, entry.name)
    if (entry.isDirectory()) {
      return modulesUnder(join(directory, entry.name), relativePath)
    }

    return isCommandModule(entry.name) ? [relativePath] : []
  })
}

function isCommandModule(name: string): boolean {
  return (
    MODULE_EXTENSIONS.some((extension) => name.endsWith(extension)) &&
    !SPEC_SUFFIXES.some((suffix) => name.endsWith(suffix))
  )
}

function readCommand(modulePath: string): Command {
  const declared = commandClassIn(modulePath)

  return {
    id: commandIdOf(modulePath),
    aliases: staticStringsOf(declared, ALIASES_MEMBER, modulePath),
    flags: staticFlagsOf(declared, modulePath),
  }
}

/** The id oclif's pattern strategy gives a module: its path under the tree, extension off. */
function commandIdOf(modulePath: string): string {
  return modulePath
    .replace(MODULE_EXTENSION, "")
    .split(sep)
    .join(TOPIC_SEPARATOR)
}

/** The default-exported class, which is what oclif loads, not merely the first. */
function commandClassIn(modulePath: string): ts.ClassDeclaration {
  const file = parseModule(join(COMMANDS_DIR, modulePath))
  const declared = file.statements
    .filter(ts.isClassDeclaration)
    .find(isDefaultExported)
  if (declared === undefined) {
    refuse(
      `${COMMANDS_DIR_LABEL}${modulePath} default-exports no command class`
    )
  }

  return declared
}

function isDefaultExported(declared: ts.ClassDeclaration): boolean {
  return hasModifier(declared, ts.SyntaxKind.DefaultKeyword)
}

function parseModule(filePath: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest
  )
}

/** A `static <member> = [...]` of string literals; absent means empty. */
function staticStringsOf(
  declared: ts.ClassDeclaration,
  member: string,
  modulePath: string
): string[] {
  const initializer = staticInitializerOf(declared, member)
  if (initializer === undefined) return []
  if (!ts.isArrayLiteralExpression(initializer)) {
    refuse(`'static ${member}' in ${modulePath} is not an array literal`)
  }

  return initializer.elements.map((element) =>
    stringLiteralOf(element, `an element of 'static ${member}'`, modulePath)
  )
}

/** Written as the reference does: `--name` or `--name/-c`. Hidden flags are dropped. */
function staticFlagsOf(
  declared: ts.ClassDeclaration,
  modulePath: string
): string[] {
  const initializer = staticInitializerOf(declared, FLAGS_MEMBER)
  if (initializer === undefined) return []
  if (!ts.isObjectLiteralExpression(initializer)) {
    refuse(`'static ${FLAGS_MEMBER}' in ${modulePath} is not an object literal`)
  }

  return initializer.properties.flatMap((property) =>
    flagNotationOf(property, modulePath)
  )
}

function flagNotationOf(
  property: ts.ObjectLiteralElementLike,
  modulePath: string
): string[] {
  if (!ts.isPropertyAssignment(property)) {
    refuse(
      `a flag in ${modulePath} is declared as something other than 'name: Flags.…()'`
    )
  }

  const options = flagOptionsOf(property.initializer, modulePath)
  if (isHidden(options)) return []

  const name = flagNameOf(property.name, modulePath)
  const char = stringOptionOf(options, FLAG_CHAR_OPTION, modulePath)

  return [char === undefined ? `--${name}` : `--${name}/-${char}`]
}

function flagOptionsOf(
  initializer: ts.Expression,
  modulePath: string
): ts.ObjectLiteralExpression | undefined {
  if (!ts.isCallExpression(initializer)) {
    refuse(`a flag in ${modulePath} is not declared by a 'Flags.…()' call`)
  }

  const [options] = initializer.arguments
  if (options === undefined) return undefined
  if (!ts.isObjectLiteralExpression(options)) {
    refuse(
      `a flag in ${modulePath} is declared with options no reader can resolve`
    )
  }

  return options
}

function flagNameOf(name: ts.PropertyName, modulePath: string): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text

  refuse(
    `a visible flag in ${modulePath} is keyed by an expression, so it has no readable name`
  )
}

function isHidden(options: ts.ObjectLiteralExpression | undefined): boolean {
  return (
    propertyOf(options, FLAG_HIDDEN_OPTION)?.kind === ts.SyntaxKind.TrueKeyword
  )
}

function stringOptionOf(
  options: ts.ObjectLiteralExpression | undefined,
  option: string,
  modulePath: string
): string | undefined {
  const value = propertyOf(options, option)
  if (value === undefined) return undefined

  return stringLiteralOf(value, `the '${option}' of a flag`, modulePath)
}

function propertyOf(
  options: ts.ObjectLiteralExpression | undefined,
  option: string
): ts.Expression | undefined {
  const assignment = options?.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && nameOf(property.name) === option
  )

  return assignment?.initializer
}

function nameOf(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined
}

function stringLiteralOf(
  node: ts.Node,
  subject: string,
  modulePath: string
): string {
  if (!ts.isStringLiteralLike(node)) {
    refuse(`${subject} in ${modulePath} is not a string literal`)
  }

  return node.text
}

function staticInitializerOf(
  declared: ts.ClassDeclaration,
  member: string
): ts.Expression | undefined {
  const property = declared.members.find(
    (candidate): candidate is ts.PropertyDeclaration =>
      ts.isPropertyDeclaration(candidate) &&
      isStatic(candidate) &&
      nameOf(candidate.name) === member
  )

  return property?.initializer
}

function isStatic(property: ts.PropertyDeclaration): boolean {
  return hasModifier(property, ts.SyntaxKind.StaticKeyword)
}

function hasModifier(node: ts.HasModifiers, kind: ts.SyntaxKind): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === kind) === true
}

/** Read by column name, not position. */
function readMatrixRows(): MatrixRow[] {
  if (!existsSync(REFERENCE)) {
    refuse(`there is no document at ${REFERENCE_LABEL}`)
  }

  const [heading, rule, ...rows] = tableLinesIn(
    sectionBetween(
      readFileSync(REFERENCE, "utf-8"),
      MATRIX_OPENS_AT,
      MATRIX_CLOSES_AT
    )
  )
  if (heading === undefined || rule === undefined || !TABLE_RULE.test(rule)) {
    refuse(`'${MATRIX_OPENS_AT}' in ${REFERENCE_LABEL} opens no markdown table`)
  }
  if (rows.length === 0) {
    refuse(
      `the table under '${MATRIX_OPENS_AT}' in ${REFERENCE_LABEL} has no rows`
    )
  }

  const commandColumn = columnIndexOf(heading, COMMAND_COLUMN)
  const flagsColumn = columnIndexOf(heading, FLAGS_COLUMN)

  return rows.map((row) =>
    matrixRowOf(cellsOf(row), commandColumn, flagsColumn)
  )
}

function sectionBetween(document: string, from: string, to: string): string {
  const opensAt = onlyIndexOf(document, from)
  const closesAt = onlyIndexOf(document, to)
  if (closesAt < opensAt) {
    refuse(`'${to}' precedes '${from}' in ${REFERENCE_LABEL}`)
  }

  return document.slice(opensAt + from.length, closesAt)
}

function onlyIndexOf(document: string, marker: string): number {
  const first = document.indexOf(marker)
  if (first === -1) {
    refuse(`${REFERENCE_LABEL} no longer holds the text '${marker}'`)
  }
  if (document.indexOf(marker, first + marker.length) !== -1) {
    refuse(`${REFERENCE_LABEL} holds the text '${marker}' more than once`)
  }

  return first
}

function tableLinesIn(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(TABLE_CELL_DELIMITER))
}

function cellsOf(row: string): string[] {
  return row
    .split(TABLE_CELL_DELIMITER)
    .slice(1, -1)
    .map((cell) => cell.trim())
}

function columnIndexOf(heading: string, column: string): number {
  const cells = cellsOf(heading)
  const first = cells.indexOf(column)
  if (first === -1) {
    refuse(`the matrix in ${REFERENCE_LABEL} carries no '${column}' column`)
  }
  if (cells.indexOf(column, first + 1) !== -1) {
    refuse(
      `the matrix in ${REFERENCE_LABEL} carries the '${column}' column twice`
    )
  }

  return first
}

/** The first name in the Command cell is the command; the rest are its aliases. */
function matrixRowOf(
  cells: string[],
  commandColumn: number,
  flagsColumn: number
): MatrixRow {
  const [command, ...aliases] = namesIn(
    cellAt(cells, commandColumn, COMMAND_COLUMN)
  )
  if (command === undefined) {
    refuse(`a row of the matrix in ${REFERENCE_LABEL} names no command`)
  }

  return {
    command,
    aliases,
    flags: namesIn(cellAt(cells, flagsColumn, FLAGS_COLUMN)),
  }
}

function cellAt(cells: string[], index: number, column: string): string {
  return (
    cells[index] ??
    refuse(`a row of the matrix in ${REFERENCE_LABEL} has no '${column}' cell`)
  )
}

/** Every backticked span, value placeholder removed: `search <query>` names `search`. */
function namesIn(cell: string): string[] {
  return [...cell.matchAll(CODE_SPAN)]
    .map((span) => withoutValuePlaceholder(span[1] ?? ""))
    .filter((name) => name.length > 0)
}

function withoutValuePlaceholder(span: string): string {
  return span.replace(VALUE_PLACEHOLDER, "").trim()
}

function rosterOf(commands: Command[]): string[] {
  return commands.flatMap((command) => [command.id, ...command.aliases])
}

function rosterNamedBy(rows: MatrixRow[]): string[] {
  return rows.flatMap((row) => [row.command, ...row.aliases])
}

/** Bound per command, so a flag moving between rows is seen. */
function flagsOf(commands: Command[]): string[] {
  return commands.flatMap((command) =>
    command.flags.map((flag) => `${command.id} ${flag}`)
  )
}

function flagsNamedBy(rows: MatrixRow[]): string[] {
  return rows.flatMap((row) =>
    row.flags.map((flag) => `${row.command} ${flag}`)
  )
}

function driftBetween(
  claim: string,
  held: string[],
  named: string[]
): Drift | null {
  const namedButAbsent = named.filter((member) => !held.includes(member))
  const presentButUnnamed = held.filter((member) => !named.includes(member))
  if (namedButAbsent.length === 0 && presentButUnnamed.length === 0) return null

  return { claim, namedButAbsent, presentButUnnamed }
}

function isDrift(verdict: Drift | null): verdict is Drift {
  return verdict !== null
}

function exitWith(drift: Drift[], commands: Command[]): never {
  if (drift.length === 0) {
    const flags = flagsOf(commands).length
    console.log(
      `cli claims: ${commands.length} commands and ${flags} flags, all documented`
    )
    process.exit(0)
  }

  console.error(
    `cli claims: ${REFERENCE_LABEL} and ${COMMANDS_DIR_LABEL} disagree\n`
  )
  for (const { claim, namedButAbsent, presentButUnnamed } of drift) {
    console.error(`  ${claim}`)
    for (const member of namedButAbsent) {
      console.error(
        `    · documented, and the CLI has no such thing: ${member}`
      )
    }
    for (const member of presentButUnnamed) {
      console.error(
        `    · the CLI ships it, and nothing documents it: ${member}`
      )
    }
  }
  console.error(
    `\nThe matrix under '${MATRIX_OPENS_AT}' is the roster. Every command is a module` +
      `\nunder ${COMMANDS_DIR_LABEL}, and nothing else is a command.`
  )
  process.exit(1)
}

/** An empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`cli claims: ${reason}`)
}

main()
