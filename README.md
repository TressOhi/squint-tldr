<p align="center"><img src="static/icons/128.png" width="80" alt=""></p>

<h1 align="center">Squint TL;DR</h1>

<p align="center">Squint at the small print. A Chrome extension that rejects cookie banners for you and tells you what you're actually agreeing to in privacy policies and terms of service.</p>

---

## What it does

**Rejects cookie banners automatically.** When a cookie banner appears, Squint picks the most private option: "Reject all" if there is one. If the banner hides it, Squint opens the preferences, switches off every optional category and saves. It never clicks "Accept". This runs entirely in your browser and needs no API key.

**Flags the dicey clauses.** Open the side panel on a privacy policy or terms page and click **Scan this page**. You can also paste a link (handy for app terms from your phone) or paste the text. The AI model you chose reads the whole document and gives you:

- **A TL;DR** of what you're signing up for, in plain English
- **Flagged clauses** rated red, amber or green, each with the exact quote and why it matters
- **What you can do**: opt-outs and settings the document itself offers
- **An overall verdict**

**Quotes are checked.** Every flag must quote the document word for word, and Squint checks each quote against the text it sent. Any flag whose quote doesn't match is thrown away, so the model can't invent a scary clause.

## Bring your own model

Policy scans use an AI model through your own account, with no Squint server in between. In Settings, pick a provider, connect it, and choose from the models your key can use:

- **Hosted:** Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek and xAI, with your own API key.
- **On your computer:** Ollama or LM Studio. Free, and the document never leaves your machine.
- **Anything else** that speaks the OpenAI Chat Completions API: give its address and, if it needs one, a key.

Your key stays in your browser and documents go straight from your browser to the provider. Where Squint knows the model's prices, it shows what each scan cost. Results are cached locally, so reopening a policy you've already scanned is free.

Quality depends on the model. Large models give the sharpest results. Small local models can miss things, though the quote check still stops them inventing clauses.

### Local models

Ollama only accepts requests from origins it trusts. If Squint says Ollama refused the request, restart it allowing browser extensions:

```sh
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

Local models also default to a short context window. For long policies, pick a model with a large context and raise its context length in Ollama or LM Studio.

See [PRIVACY.md](PRIVACY.md) for exactly what is stored and sent.

## Install

Until Squint is on the Chrome Web Store, install it from source:

```sh
git clone https://github.com/TressOhi/squint-tldr.git && cd squint-tldr
npm ci
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist/` folder. Squint opens its settings page so you can connect a model. It also works in Edge, Brave, Arc and other Chromium browsers.

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
  core/          Plain logic with no extension APIs, reusable by a future desktop or phone app
    analysis/    the scan: prompt, output schema, answer parsing, quote checks
    llm/         providers and the adapters that call them
      data/      providers.json: every supported provider, as data
      adapters/  one per protocol (anthropic-messages, openai-chat)
    documents/   turning HTML into text, spotting policy pages
  platform/      Chrome glue shared by the entry points: storage, messages
  background/    service worker: badge, side panel, per-tab cookie results
  content/       cookie banner rejecter
    data/        cmps.json (known consent tools), reject-phrases.json (button labels)
  ui/            scripts for the extension pages
    sidepanel/   the main UI: scan, results
    settings/    provider and model, cookie options, privacy
static/          copied into the build as is
  manifest.json
  pages/         HTML
  styles/        CSS
  icons/         the logo, as PNGs at each size Chrome needs
test/
  unit/          pure logic: quote matching, answer parsing, provider data, button labels
  dom/           the cookie rejecter and text extraction against fixtures in Chromium
  extension/     the built extension end to end, with providers faked by protocol
```

ESLint enforces the layering: `core/` can't use `chrome.*` or import from the extension layers, and `platform/` can't import from the entry points.

### How a scan works

1. The side panel gets the text: the current page's rendered text, a fetched link (HTML converted to text, no cookies sent), or pasted text.
2. `core/analysis/analyze.ts` sends it, with the prompt in `prompt.ts`, to the provider you selected. `core/llm` looks the provider up in `providers.json` and hands the request to the adapter for its protocol, which loads that provider's SDK on demand.
3. The adapter asks for [structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) matching the Zod schema in `schema.ts` where the provider supports it, and otherwise puts the schema in the prompt.
4. The answer is validated against the same Zod schema, and every quote is checked against the document (`quotes.ts`).

## Contributing

Cookie banners change all the time, and the most useful contribution is keeping the consent-tool list in [`src/content/data/cmps.json`](src/content/data/cmps.json) accurate. Adding a provider that speaks a supported protocol is a JSON change too. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
