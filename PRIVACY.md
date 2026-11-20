# Privacy

Squint has no server and collects nothing. This page lists everything it stores and everything it sends.

## Stored in your browser

All of this is in the extension's local storage in your Chrome profile, and is removed when you uninstall Squint.

- **Your Anthropic API key**, if you add one. Remove it at any time in Settings.
- **Your settings**: whether cookie auto-reject is on, and the sites you've paused it on.
- **Your 25 most recent scan results**, so reopening a policy doesn't cost another scan. Clear them in Settings.
- **Which cookie banner was rejected on each open tab**, held in memory only and discarded when the tab closes.

## Sent anywhere

- **When you scan a document**, its text is sent from your browser directly to Anthropic's API (`api.anthropic.com`) using your key. Anthropic's handling of API data is covered by [their privacy policy](https://www.anthropic.com/legal/privacy) and the terms of your API account.
- **When you scan a link**, Squint fetches that page from your browser without sending your cookies.

Nothing else leaves your browser. Cookie auto-reject runs entirely on the page and sends nothing anywhere. There is no analytics or telemetry.

## Permissions

| Permission | Why |
| --- | --- |
| Read and change data on all websites | To find and reject cookie banners on any site, read the current page when you click Scan, and fetch links you paste |
| `storage` | To save your key, settings and recent scans locally |
| `sidePanel` | To show results beside the page |
| `scripting` | To read the current page's text when you click Scan, and scroll to a quoted clause |
