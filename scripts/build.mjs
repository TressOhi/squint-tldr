// Bundles the extension into dist/. Load dist/ via chrome://extensions → "Load unpacked".
//   npm run build   one production build
//   npm run watch   rebuild on change (then click reload on chrome://extensions)
//
// static/ (manifest, HTML pages, styles, icons) is copied as is; src/ is bundled into dist/js/.
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(() => cpSync("static", outdir, { recursive: true }));
  },
};

const shared = {
  outdir: `${outdir}/js`,
  bundle: true,
  target: "chrome116",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  legalComments: "external",
  logLevel: "info",
};

const builds = [
  // Extension pages and the service worker are ES modules.
  {
    ...shared,
    format: "esm",
    splitting: true, // shared code and each provider SDK become chunks, loaded on demand
    chunkNames: "chunks/[name]-[hash]",
    entryPoints: {
      background: "src/background/index.ts",
      sidepanel: "src/ui/sidepanel/index.ts",
      settings: "src/ui/settings/index.ts",
    },
    plugins: [copyStatic],
  },
  // Content scripts are classic scripts; wrap in an IIFE so nothing leaks into the page.
  { ...shared, format: "iife", entryPoints: { content: "src/content/index.ts" } },
];

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
