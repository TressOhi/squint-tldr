// Bundles the extension into dist/. Load dist/ via chrome://extensions → "Load unpacked".
//   npm run build   one production build
//   npm run watch   rebuild on change (then click reload on chrome://extensions)
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

const STATIC = [
  ["manifest.json", "manifest.json"],
  ["icons", "icons"],
  ["src/lib/base.css", "base.css"],
  ["src/sidepanel/sidepanel.html", "sidepanel.html"],
  ["src/sidepanel/sidepanel.css", "sidepanel.css"],
  ["src/settings/settings.html", "settings.html"],
  ["src/settings/settings.css", "settings.css"],
];
const copyStatic = {
  name: "copy-static",
  setup(build) {
    build.onEnd(() => {
      for (const [from, to] of STATIC) cpSync(from, `${outdir}/${to}`, { recursive: true });
    });
  },
};

const shared = {
  outdir,
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
    splitting: true, // the SDK and Zod live in one shared chunk
    chunkNames: "chunks/[name]-[hash]",
    entryPoints: {
      background: "src/background/index.ts",
      sidepanel: "src/sidepanel/sidepanel.ts",
      settings: "src/settings/settings.ts",
    },
    plugins: [copyStatic],
  },
  // Content scripts are classic scripts; wrap in an IIFE so nothing leaks into the page.
  { ...shared, format: "iife", entryPoints: { cookies: "src/content/cookies.ts" } },
];

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

if (watch) {
  for (const options of builds) await (await esbuild.context(options)).watch();
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
