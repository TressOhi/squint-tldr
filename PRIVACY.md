# Privacy

Squint has no server and collects nothing. This page lists everything it stores and everything it sends.

## Stored in your browser

All of this is in the extension's local storage in your Chrome profile, and is removed when you uninstall Squint.

- **Your API keys**, one per provider you connect. Remove any of them at any time in Settings.
- **Your settings**: the provider and model you chose, any custom server address, whether cookie auto-reject is on, and the sites you've paused it on.
- **Your 25 most recent scan results**, so reopening a policy doesn't cost another scan. Clear them in Settings.
- **Which cookie banner was rejected on each open tab**, held in memory only and discarded when the tab closes.

## Sent anywhere

- **When you scan a document**, its text is sent from your browser directly to the provider you chose in Settings, using your key. That provider's handling of the data is covered by its own privacy policy and the terms of your account with it. If you choose a provider that runs on your computer (Ollama, LM Studio), the text never leaves your machine.
- **When you connect a provider**, Squint asks it for the list of models your key can use. This is free and sends no documents.
- **When you scan a link**, Squint fetches that page from your browser without sending your cookies.

Nothing else leaves your browser. Cookie auto-reject runs entirely on the page and sends nothing anywhere. There is no analytics or telemetry.

## Permissions

| Permission | Why |
| --- | --- |
| Read and change data on all websites | To find and reject cookie banners on any site, read the current page when you click Scan, fetch links you paste, and reach the provider you chose, including one on your own computer |
| `storage` | To save your key, settings and recent scans locally |
| `sidePanel` | To show results beside the page |
| `scripting` | To read the current page's text when you click Scan, and scroll to a quoted clause |
