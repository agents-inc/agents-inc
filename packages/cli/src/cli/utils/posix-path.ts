import path from "path";

/** `/`-separated on every platform: a name compared with glob results or shown to a person. */
export function toPosixPath(nativePath: string): string {
  return nativePath.split(path.sep).join(path.posix.sep);
}
