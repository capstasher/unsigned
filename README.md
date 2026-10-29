# Unsigned

A Chrome / Brave extension that strips the sharer-tracking tags X adds to copied tweet links, and can optionally hand you a vxtwitter (or fixvx / fxtwitter / fixupx) link instead.

```
X gives:  https://x.com/jack/status/20?s=12&t=dHJhY2tlZC10b2tlbg
Clean:    https://x.com/jack/status/20
Embed:    https://vxtwitter.com/jack/status/20
```

The `t=` value is a session-bound token that identifies whoever copied the link; `s=` marks the client it came from.

<p align="center"><img src="docs/popup.png" width="340" alt="The Unsigned popup: Clean and Embed modes, a live before/after preview, and options for Shift-click and rich-copy scrubbing"></p>

## Install

1. Download `unsigned-<version>.zip` from [Releases](../../releases) and unzip it somewhere permanent.
2. Go to `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
3. **Load unpacked** → pick the `unsigned` folder.
4. Reload any open x.com tabs.

Needs Chrome/Brave 111 or later.

## Use

Click **⋯ / Share → Copy link** on a tweet as normal. The toolbar seal flashes **✓** (clean) or **vx** (embed) when a link was rewritten.

- **Mode** — Clean or Embed, from the toolbar popup. Embed service is selectable.
- **Shift-click** "Copy link" to use the other mode for that one copy.
- **Scrub rich copies** — also removes the hidden tracking spans X slips into the HTML side of ordinary text copies.

Embed conversion only happens when the copied thing is a single tweet link. Links inside copied prose are cleaned but stay on x.com.

## How it works

`src/hook.js` runs in the page at `document_start` and wraps every route X can use to write the clipboard: `navigator.clipboard.writeText` / `write`, `clipboardData.setData` inside copy/cut handlers, and plain `execCommand('copy')` of a selected link. The rewrite rules live in `src/rewrite.js`. `src/bridge.js` relays settings in from `chrome.storage` (the page context can't read it).

No network requests, no analytics. Permissions: `storage`, plus access to x.com / twitter.com.
