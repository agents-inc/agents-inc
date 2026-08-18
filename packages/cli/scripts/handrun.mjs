// Bundles and runs the hand-run driver. The bundle lands beside the e2e helpers
// so that CLI_ROOT, which is derived from import.meta.url, still resolves to the
// package root — a bundle placed elsewhere silently points the spawned binary at
// the wrong tree.
import { build } from "esbuild";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "e2e", "helpers", "handrun.gen.mjs");

await build({
  entryPoints: [path.join(here, "..", "e2e", "handrun-journeys.ts")],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: [
    "@lydell/node-pty",
    "jiti",
    "zod",
    "execa",
    "fs-extra",
    "yaml",
    "chalk",
    "ink",
    "react",
    "@oclif/core",
    "fast-glob",
  ],
  resolveExtensions: [".ts", ".js", ".json"],
  banner: { js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" },
  plugins: [
    {
      name: "js-to-ts",
      setup(b) {
        b.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (a) => {
          const p = path.resolve(a.resolveDir, a.path.replace(/\.js$/, ".ts"));
          return fs.existsSync(p) ? { path: p } : undefined;
        });
      },
    },
  ],
});

const { default: _ } = await import(`file://${out}?t=${Date.now()}`);
void _;
