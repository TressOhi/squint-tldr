# Contributing to Squint

Thanks for helping. Please open an issue before starting anything large.

## Setup

```sh
npm ci
npx playwright install chromium
npm run check   # type-check, lint, build, all tests
```

Load `dist/` as an unpacked extension (see the README) and run `npm run watch` while you work.

## Standards

- TypeScript in strict mode, linted with `typescript-eslint`'s strict type-checked rules. `npm run check` must pass, and CI runs the same command.
- Content from web pages and model output is untrusted. Render it with `textContent` (see `lib/dom.ts`), never as HTML.
- No new permissions without discussion: every permission makes Chrome Web Store review harder and asks more of users.
- No telemetry, no remote code, no Squint servers.
- Dependencies are pinned to exact versions.

## Fixing or adding a cookie banner

Most cookie banners come from a few dozen consent tools (CMPs). Each has an entry in [`src/content/cmps.ts`](src/content/cmps.ts):

```ts
{
  name: "ExampleCMP",
  detect: "#example-banner",            // the banner; must be visible
  reject: ["#example-reject-all"],      // buttons that reject everything, in order
  // Optional, for banners whose only route is "manage preferences":
  settings: "#example-manage",          // opens the preferences panel
  panel: "#example-preferences",        // the panel to switch toggles off in
  save: ["#example-save-choices"],      // saves the current choices (never "accept all")
}
```

When you add or fix one, also add a fixture to `test/dom/reject.spec.ts` that reproduces the banner's markup and checks that only the reject or save button was clicked.

Banners that aren't from a known CMP are handled by label matching (`isRejectLabel` in `src/content/reject.ts`). New phrasings, especially in other languages, are welcome: add them with cases to `test/unit/labels.spec.ts`, including labels that must *not* match.

## Changing the analysis

The prompt and request live in `src/lib/analyze.ts`, and the output schema in `src/lib/schema.ts`. If you change the schema, the unit test that checks the generated JSON schema will tell you if structured outputs would reject it.
