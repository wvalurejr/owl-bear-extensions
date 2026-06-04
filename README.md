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

All internal references (`manifest.json` → `index.html`/`icon.svg`,
`index.html` → `main.js`) use **relative** paths, so the extension works
whether it's served from a domain root (Netlify/Vercel/Cloudflare) or a
subpath (GitHub Pages project site, e.g. `user.github.io/repo/`).

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
