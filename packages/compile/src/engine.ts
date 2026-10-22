import { Liquid, type FS } from "liquidjs"

/**
 * A Liquid engine over a template record, for a browser with no disk. liquidjs's `MapFS` is not
 * exported from its root, so this implements `FS` itself.
 */

/** Keyed by path relative to the templates root, extension included. */
export type CompileTemplates = Readonly<Record<string, string>>

const TEMPLATE_EXTENSION = ".liquid"

const SEPARATOR = "/"

/** liquidjs joins roots onto `{% render %}` paths, so keys can carry `./` and `..`. */
function flattenSegment(
  resolved: readonly string[],
  segment: string
): readonly string[] {
  if (segment === "" || segment === ".") return resolved
  if (segment === "..") return resolved.slice(0, -1)
  return [...resolved, segment]
}

function normalizeKey(key: string): string {
  return key.split(SEPARATOR).reduce(flattenSegment, []).join(SEPARATOR)
}

function templateFileSystem(templates: CompileTemplates): FS {
  const read = (file: string): string | undefined =>
    templates[normalizeKey(file)]

  return {
    // The record is rooted at the templates directory, so an empty root means the key is the path.
    resolve: (dir: string, file: string, ext: string) =>
      [dir, file.endsWith(ext) ? file : `${file}${ext}`]
        .filter(Boolean)
        .join(SEPARATOR),
    existsSync: (file: string) => read(file) !== undefined,
    exists: (file: string) => Promise.resolve(read(file) !== undefined),
    readFileSync: (file: string) => {
      const contents = read(file)
      if (contents === undefined) throw new Error(`Template not found: ${file}`)
      return contents
    },
    readFile: (file: string) => {
      const contents = read(file)
      if (contents === undefined)
        return Promise.reject(new Error(`Template not found: ${file}`))
      return Promise.resolve(contents)
    },
    contains: () => Promise.resolve(true),
    containsSync: () => true,
    dirname: (file: string) =>
      file.split(SEPARATOR).slice(0, -1).join(SEPARATOR),
    sep: SEPARATOR,
  }
}

/**
 * The browser twin of the CLI's `createLiquidEngine`, with the same options so renders match.
 * `globals` carries install values such as the source folder.
 */
export function createEngineFromTemplates(
  templates: CompileTemplates,
  globals: Readonly<Record<string, string>> = {}
): Liquid {
  return new Liquid({
    root: "",
    extname: TEMPLATE_EXTENSION,
    strictVariables: false,
    strictFilters: true,
    fs: templateFileSystem(templates),
    globals,
  })
}
