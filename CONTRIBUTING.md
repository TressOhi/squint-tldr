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
- Content from web pages and model output is untrusted. Render it with `textContent` (see `src/ui/dom.ts`), never as HTML.
- No new permissions without discussion: every permission makes Chrome Web Store review harder and asks more of users.
- No telemetry, no remote code, no Squint servers.
- Dependencies are pinned to exact versions.

## Where things go

See the layout in the README. In short: logic that doesn't need the browser extension goes in `src/core/`, Chrome-specific helpers in `src/platform/`, and markup, styles and icons in `static/`. Data (provider list, consent tools, button labels, clause categories) lives in JSON files under each module's `data/` folder. ESLint enforces the layering.

## Adding an AI provider

If the provider speaks a protocol Squint already supports (`anthropic-messages` or `openai-chat`), add an entry to [`src/core/llm/data/providers.json`](src/core/llm/data/providers.json); no code is needed:

```json
{
  "id": "example",
  "name": "Example AI",
  "protocol": "openai-chat",
  "baseUrl": "https://api.example.com/v1",
  "key": "required",
  "keyUrl": "https://example.com/api-keys",
  "defaultModel": "example-large",
  "prices": { "example-large": { "input": 1, "output": 4 } }
}
```

`key` is `required`, `optional` or `none`. Set `local: true` for servers on the user's computer (their address becomes editable). `prices` is in USD per million tokens and is optional: without it, scans show no cost. `npm run test:unit` checks every entry.

A new protocol needs an adapter in `src/core/llm/adapters/` implementing `LlmAdapter` (see `types.ts`), registered in `src/core/llm/index.ts`, and a fake for it in `test/extension/fixtures.ts`.

## Fixing or adding a cookie banner

Most cookie banners come from a few dozen consent tools (CMPs). Each has an entry in [`src/content/data/cmps.json`](src/content/data/cmps.json); the fields are documented on the `Cmp` type in [`src/content/cmps.ts`](src/content/cmps.ts):

```json
{
  "name": "ExampleCMP",
  "detect": "#example-banner",
  "reject": ["#example-reject-all"],
  "settings": "#example-manage",
  "panel": "#example-preferences",
  "save": ["#example-save-choices"]
}
```

`detect` is the banner (it must be visible), `reject` lists buttons that reject everything, in order. `settings`, `panel` and `save` are optional, for banners whose only route is "manage preferences": the button that opens the panel, the panel to switch toggles off in, and the button that saves the current choices (never "accept all").

When you add or fix one, also add a fixture to `test/dom/reject.spec.ts` that reproduces the banner's markup and checks that only the reject or save button was clicked.

Banners that aren't from a known CMP are handled by label matching. New phrasings, especially in other languages, go in [`src/content/data/reject-phrases.json`](src/content/data/reject-phrases.json), grouped by language: add them with cases to `test/unit/labels.spec.ts`, including labels that must *not* match.

## Changing the analysis

The prompt lives in `src/core/analysis/prompt.ts` and the output schema in `src/core/analysis/schema.ts`. If you change the schema, the unit tests check that the JSON schema sent to each protocol still meets strict structured-output rules.
