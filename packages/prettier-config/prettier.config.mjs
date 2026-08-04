import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")

/** @type {import("prettier").Config} */
export default {
  endOfLine: "lf",
  semi: false,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 80,
  plugins: ["prettier-plugin-tailwindcss"],
  // Absolute, so class sorting works the same whether prettier runs from a workspace or the root.
  tailwindStylesheet: join(REPO_ROOT, "packages/ui/src/styles/globals.css"),
  tailwindFunctions: ["cn", "cva"],
}
