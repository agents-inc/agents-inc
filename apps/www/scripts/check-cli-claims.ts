/**
 * The other thing this site could not previously see about itself: whether the
 * commands it tells people to run exist.
 *
 * WHY THIS EXISTS. `todo/www.md` carried WWW-04 — "three pages tell readers to
 * run `new skill` / `new agent` / `new marketplace`" — for a fortnight, and by
 * the time anybody looked, every clause of it had gone stale in a different
 * direction. `new agent` had been deleted and is never returning. `new skill`
 * had been deleted and is deferred. `new marketplace` had been deleted and had
 * come BACK, so the row was telling a reader to remove a page documenting a
 * live command. Meanwhile `share` shipped and `edit` grew `--ui` and `--from`,
 * and the reference documented neither: one page said in as many words that
 * "there is no `share` command" while `agents-inc share` worked.
 *
 * That is one defect with two faces, and only one of them is the loud one. A
 * page naming a command that exits 127 is caught by the first reader who tries
 * it. A page silently missing a command is caught by nobody, ever — a reader
 * cannot miss what they were never shown. Both are the same drift, so both are
 * judged here, as MEMBERSHIP in both directions rather than as a count.
 *
 * WHAT IT CHECKS, as two claims about the product:
 *
 *   1. THE COMMAND REFERENCE NAMES EVERY COMMAND THE CLI SHIPS, AND NO OTHER.
 *      Aliases included: `ls` went undocumented for months because it is not a
 *      file, and a reader looking for it in the reference concluded it was not
 *      real.
 *
 *   2. EACH ROW'S FLAGS CELL NAMES THAT COMMAND'S FLAGS, AND NO OTHERS. Bound
 *      per command rather than as one pooled set, because a flag that moves
 *      between two commands leaves a pooled set identical.
 *
 * WHAT IT BINDS TO. `packages/cli/src/cli/commands/**` and nothing else, which
 * is the CLI's own definition of its roster: `oclif.commands.strategy` is
 * `pattern`, so a module under that tree IS a command, nothing anywhere
 * declares an id, and a topic is a directory. The two stock oclif commands —
 * `help` and `autocomplete` — arrive from plugins rather than that tree, and
 * are out of scope for a reference about this CLI's own surface.
 *
 * It reads SOURCE, not `dist/`. A `--help` diff would answer a richer question
 * and need the CLI built, installed and on PATH, which would put the site's
 * gate behind another workspace's build. The tree and the class bodies carry
 * everything either claim needs.
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK. Not the per-command prose below the
 * matrix, which is written for a reader rather than in a notation, and not
 * whether a description is accurate — a checker cannot read English, and one
 * that pretends to would fail on rewording and be switched off within the
 * week. The matrix is the roster; the prose is commentary on it.
 *
 * A CHECK THAT JUDGES NOTHING IS A FAILURE, NOT A PASS. A missing tree, a
 * missing document, a section marker that has moved or appears twice, a table
 * with no rows, a renamed column, a flag whose name no reader can resolve —
 * all refuse loudly. Silently reading an empty list is how the binding was
 * lost in the first place.
 *
 * Reads no build output, so unlike check-type-scale.ts it needs no `dist/`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

/** The roster, per `oclif.commands` in packages/cli/package.json. */
const COMMANDS_DIR = fileURLToPath(
  new URL("../../../packages/cli/src/cli/commands/", import.meta.url)
)

/** The document that claims to enumerate it. */
const REFERENCE = fileURLToPath(
  new URL("../src/content/docs/docs/reference/commands.md", import.meta.url)
)

/** For a failure message, which has to name a path a reader can open. */
const COMMANDS_DIR_LABEL = "packages/cli/src/cli/commands/"
const REFERENCE_LABEL = "src/content/docs/docs/reference/commands.md"

/** What separates a topic from its command in an id, per `oclif.topicSeparator`. */
const TOPIC_SEPARATOR = " "

const MODULE_EXTENSIONS = [".ts", ".tsx"]

/** A spec beside a command module is not a command. */
const SPEC_SUFFIXES = [".test.ts", ".test.tsx"]

/** The two static members of a command class that either claim reads. */
const ALIASES_MEMBER = "aliases"
const FLAGS_MEMBER = "flags"

/** The option naming a flag's short form, and the one holding it back from `--help`. */
const FLAG_CHAR_OPTION = "char"
const FLAG_HIDDEN_OPTION = "hidden"

/**
 * The section of the reference holding the matrix. Both markers are text the
 * document uses exactly once, and appearing twice refuses rather than picking
 * the first — an opener that has drifted onto a second heading would silently
 * read the wrong table.
 */
const MATRIX_OPENS_AT = "## Command matrix"
const MATRIX_CLOSES_AT = "**This table is the roster, and it is checked.**"

/** The two columns read, by name. A renamed heading refuses rather than reading nothing. */
const COMMAND_COLUMN = "Command"
const FLAGS_COLUMN = "Flags"

const TABLE_CELL_DELIMITER = "|"

/** A markdown table's rule row, which separates its heading from the rows worth reading. */
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/

/** A backticked span, which is how a cell writes one name. */
const CODE_SPAN = /`([^`]+)`/g

/** The `<id>` or `<name>` a cell writes beside a command or a flag that takes a value. */
const VALUE_PLACEHOLDER = /\s*<[^>]*>/g

const MODULE_EXTENSION = /\.[^.]+$/

/** One command, as its own module declares it. */
type Command = { id: string; aliases: string[]; flags: string[] }

/** One row of the matrix, as the document writes it. */
type MatrixRow = { command: string; aliases: string[]; flags: string[] }

/** One claim's answer. A claim that agrees produces nothing to report. */
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

/**
 * Every command module under the tree, each read for the two things the
 * document states about it.
 */
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

/** Every module under a directory, deepest last, as paths relative to it. */
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

/**
 * The class oclif loads, which is the DEFAULT-exported one and not merely the
 * first in the file. All thirteen are written `export default class … extends
 * BaseCommand`; reading the first class instead would answer confidently and
 * wrongly the day a module grows a helper class above it.
 */
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

/**
 * A `static <member> = [...]` of string literals. A class that declares no such
 * member states an empty list, which is the ordinary case — one command in the
 * CLI has an alias and one has none, and both are correct.
 */
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

/**
 * Every flag a command declares, written the way the reference writes one:
 * `--name`, or `--name/-c` where the flag has a short form.
 *
 * A hidden flag is not part of the documented surface and is dropped. That test
 * comes BEFORE the name is read, and deliberately: the one flag in the CLI
 * whose key is a computed property — `edit`'s internal project-setup flag — is
 * also the one flag marked hidden, so it never reaches a reader that would have
 * to refuse it. A computed key on a VISIBLE flag still refuses, because that is
 * a flag the document is expected to name and this cannot say what it is called.
 */
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

/** The options object a `Flags.<kind>(…)` call carries, or nothing where it carries none. */
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

/** Whether the flag is held back from `--help`, and so out of the document's scope. */
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

/** Every row of the matrix, read by column name rather than by position. */
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

/**
 * The text strictly between the two markers. Each must appear exactly once: a
 * marker the document has lost, and one it has grown a second of, are both
 * reasons to stop rather than to read whatever is there.
 */
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

/**
 * One row's two claims. The first name in the Command cell is the command and
 * the rest are its aliases, which is how the document writes them:
 * `` `list` (alias `ls`) ``.
 */
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

/**
 * Every name a cell writes, which is every backticked span in it with any value
 * placeholder taken off — `` `search <query>` `` names `search`, and
 * `(none — no base)` names nothing at all.
 */
function namesIn(cell: string): string[] {
  return [...cell.matchAll(CODE_SPAN)]
    .map((span) => withoutValuePlaceholder(span[1] ?? ""))
    .filter((name) => name.length > 0)
}

function withoutValuePlaceholder(span: string): string {
  return span.replace(VALUE_PLACEHOLDER, "").trim()
}

/** Every name the CLI answers to: one per module, plus each alias it declares. */
function rosterOf(commands: Command[]): string[] {
  return commands.flatMap((command) => [command.id, ...command.aliases])
}

function rosterNamedBy(rows: MatrixRow[]): string[] {
  return rows.flatMap((row) => [row.command, ...row.aliases])
}

/** Each flag bound to the command that declares it, so a flag cannot drift between rows unseen. */
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

/** Every way of judging nothing, said out loud. A quiet empty read is the defect, not a pass. */
function refuse(reason: string): never {
  throw new Error(`cli claims: ${reason}`)
}

main()
