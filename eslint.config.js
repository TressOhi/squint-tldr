import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  // Layering. core/ is plain logic with no browser-extension APIs, so it can be reused by a
  // future desktop or phone app; platform/ wraps Chrome; the entry points sit on top.
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", { name: "chrome", message: "core/ must not use extension APIs; put this in platform/." }],
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/platform/**", "**/ui/**", "**/content/**", "**/background/**"], message: "core/ must not depend on the extension layers." }] }],
    },
  },
  {
    files: ["src/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/ui/**", "**/content/**", "**/background/**"], message: "platform/ must not depend on entry points." }] }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly", Buffer: "readonly" } },
  },
);
