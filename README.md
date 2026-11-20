<p align="center"><img src="icons/128.png" width="80" alt=""></p>

<h1 align="center">Squint</h1>

<p align="center">Squint at the small print. A Chrome extension that rejects cookie banners for you and tells you what you're actually agreeing to in privacy policies and terms of service.</p>

---

## What it does

**Rejects cookie banners automatically.** When a cookie banner appears, Squint picks the most private option: "Reject all" if there is one. If the banner hides it, Squint opens the preferences, switches off every optional category and saves. It never clicks "Accept". This runs entirely in your browser and needs no API key.

**Flags the dicey clauses.** Open the side panel on a privacy policy or terms page and click **Scan this page**. You can also paste a link (handy for app terms from your phone) or paste the text. Claude reads the whole document and gives you:

- **A TL;DR** of what you're signing up for, in plain English
- **Flagged clauses** rated red, amber or green, each with the exact quote and why it matters
- **What you can do**: opt-outs and settings the document itself offers
- **An overall verdict**

**Quotes are checked.** Every flag must quote the document word for word, and Squint checks each quote against the text it sent. Any flag whose quote doesn't match is thrown away, so the model can't invent a scary clause.

## Bring your own key

Policy scans use Claude through your own [Anthropic API key](https://platform.claude.com/settings/keys). There is no Squint server: your key stays in your browser, and documents go straight from your browser to Anthropic. A typical policy costs a few cents to scan; the exact cost is shown after every scan. Results are cached locally, so reopening a policy you've already scanned is free.

See [PRIVACY.md](PRIVACY.md) for exactly what is stored and sent.

## Install

Until Squint is on the Chrome Web Store, install it from source:

```sh
git clone <this repo> && cd squint
npm ci
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist/` folder. Squint opens its settings page so you can add your key. It also works in Edge, Brave, Arc and other Chromium browsers.

## Development

Requires Node 22+.

| Command | What it does |
| --- | --- |
| `npm run watch` | Rebuild on change (then press reload on `chrome://extensions`) |
| `npm run check` | Type-check, lint, build and run every test (what CI runs) |
| `npm run test:unit` | Fast unit tests only |
| `npm run package` | Build and zip `dist/` for the Chrome Web Store |

First time running tests: `npx playwright install chromium`.

### Layout

```
src/
  background/   service worker: badge, side panel, per-tab cookie results
  content/      cookie banner rejecter (cmps.ts lists known consent tools)
  sidepanel/    the main UI: scan, results
  settings/     API key, cookie options, privacy
  lib/          analysis (Claude call, schema, quote checks), storage, HTML extraction
test/
  unit/         pure logic: quote matching, response parsing, button labels
  dom/          the cookie rejecter against fixture banners in Chromium
  extension/    the built extension loaded into Chromium end to end
```

### How a scan works

1. The side panel gets the text: the current page's rendered text, a fetched link (HTML converted to text, no cookies sent), or pasted text.
2. `lib/analyze.ts` sends it to Claude (`claude-opus-5-5`) as a document, with a [structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) schema generated from the Zod schema in `lib/schema.ts`. Server-side fallback is on, so if the model declines, Anthropic retries on a fallback model.
3. The response is validated against the same Zod schema, and every quote is checked against the document (`lib/quotes.ts`).

## Contributing

Cookie banners change all the time, and the most useful contribution is keeping the consent-tool list in [`src/content/cmps.ts`](src/content/cmps.ts) accurate. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
