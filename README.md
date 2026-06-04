# Hello World — Owlbear Rodeo Extension

A minimal [Owlbear Rodeo](https://www.owlbear.rodeo/) extension. It adds a
toolbar button; clicking it broadcasts a "Hello World" notification to everyone
in the room.

## Files

| File            | Purpose                                                        |
| --------------- | ------------------------------------------------------------- |
| `manifest.json` | Extension metadata + the toolbar `action` (popover) it adds.  |
| `index.html`    | The popover UI shown when the toolbar button is clicked.      |
| `main.js`       | Loads the OBR SDK, broadcasts and shows notifications.        |
| `icon.svg`      | Toolbar icon.                                                 |

## How it works

`OBR.notification.show()` only shows a notification on the *local* client, so to
reach the whole group we broadcast instead:

1. The clicker sends a message on a private channel with
   `OBR.broadcast.sendMessage(channel, data, { destination: "ALL" })`.
2. Every client (including the sender) handles it in
   `OBR.broadcast.onMessage(...)` and calls `OBR.notification.show()`.

> **Note:** Broadcasts only reach clients that currently have this extension's
> popover open, since that's where the `onMessage` listener lives. For a
> "hello world" demo that's fine; a production extension would register its
> listener in a persistent background context.

## Running it locally

Extensions are just static web apps served over HTTPS/localhost. Serve this
folder, then add the manifest URL in Owlbear Rodeo.

```sh
# From this folder, start any static server, e.g.:
npx serve .
# or
python -m http.server 8080
```

Then in Owlbear Rodeo: **Profile → Extensions → Add Extension** and paste the
URL to `manifest.json` (e.g. `http://localhost:8080/manifest.json`).

To share it with your group for real, deploy the folder to any static host
(GitHub Pages, Netlify, Vercel, Cloudflare Pages) and use that public
`manifest.json` URL instead.

### A note on manifest paths

Owlbear resolves the `icon` and `popover` paths in `manifest.json` against the
**domain root**, *not* the manifest's own folder. On a host that serves your
files at the root that's fine, but on a GitHub Pages **project site**
(`user.github.io/repo/...`) a bare path like `index.html` resolves to
`user.github.io/index.html` — the wrong place — so the popover fails to load
and the icon goes missing.

To avoid any ambiguity, `manifest.json` uses **full absolute URLs** for `icon`
and `popover`. (The `main.js` reference inside `index.html` stays relative — the
browser resolves that one against the loaded page, which works correctly.)
If you fork this to a different repo/host, update those two URLs to match.

### Deploying to GitHub Pages

```sh
# from this folder
git init && git add . && git commit -m "Hello World OBR extension"
gh repo create hello-world-obr --public --source=. --push
```

Then enable Pages: repo **Settings → Pages → Branch: `main` / root**. After it
builds, your manifest URL is:

```
https://<user>.github.io/hello-world-obr/manifest.json
```

Paste that into Owlbear Rodeo's **Add Extension** dialog.
