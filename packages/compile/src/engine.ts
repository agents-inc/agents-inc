import { Liquid, type FS } from "liquidjs"

/**
 * A Liquid engine whose templates are a plain record rather than a directory.
 *
 * The CLI builds its engine over a layered `root:` array so a project can
 * override a template on disk; a browser has no disk, so the same templates
 * travel as string data (`./generated/corpus`) and are seated here. Both hand a
 * `Liquid` to the same `renderAgent`, which is what makes the two renders
 * comparable at all.
 *
 * liquidjs ships a `MapFS` doing roughly this, at `dist/fs/map-fs.d.ts`, but does
 * not re-export it from the package root — so this implements the `FS` interface
 * over the record instead.
 */

/** Keyed by template path relative to the templates root, extension included. */
export type CompileTemplates = Readonly<Record<string, string>>

const TEMPLATE_EXTENSION = ".liquid"

const SEPARATOR = "/"

/**
 * liquidjs resolves a `{% render %}` by joining the root against the referenced
 * path, so the key a lookup arrives with can carry `./` and `..` segments. This
 * flattens them the way a filesystem would, without one.
 */
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
    // Roots are joined by liquidjs before `exists`/`readFile`; the record is
    // rooted at the templates directory itself, so an empty root means the
    // lookup key IS the path.
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
 * The browser-side twin of the CLI's `createLiquidEngine`. Every option below is
 * that function's, because a render that resolved filters or variables
 * differently would produce a different file from the same data.
 */
export function createEngineFromTemplates(templates: CompileTemplates): Liquid {
  return new Liquid({
    root: "",
    extname: TEMPLATE_EXTENSION,
    strictVariables: false,
    strictFilters: true,
    fs: templateFileSystem(templates),
  })
}
