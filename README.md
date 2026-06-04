# Hardcore 5e Sheet — Owlbear Rodeo Extension

A token-bound **D&D 5e stat sheet** for [Owlbear Rodeo](https://www.owlbear.rodeo/),
running the lethal "hardcore" death rules. Select a character token on the map,
open the extension, and its sheet appears — abilities, AC/initiative/speed, hit
points, death saves, and exhaustion. Everything is stored on the token itself,
so it syncs to every client and is saved with the scene.

A small HP badge is also attached to the token on the map (`12/20`, with a 💀 for
the dead and a ⚠ for exhaustion).

The **🎨 Tag the Map** graffiti button is still here at the bottom of the sheet.

## "Hardcore" rules — configurable by the GM

Open the **📖 Rules** panel (top bar) to read every rule and, **as the GM**, toggle
or tune it. Settings live in room metadata, so a change applies to the whole
table instantly; players see the panel read-only so they always know the rules
in play. The configurable rules:

- **Massive-damage instant death** — a hit that drops you to 0 with leftover
  damage ≥ your HP maximum kills outright. *(toggle)*
- **Permanent death** — DEAD can only be undone by **GM Override → Revive**.
  Turn off to allow normal healing/revival of the dead. *(toggle)*
- **Hits while down auto-fail** — taking damage at 0 HP is an automatic failed
  death save. *(toggle)*
- **Exhaustion is lethal** — exhaustion level 6 = death. *(toggle)*
- **Fleeting Luck** — enable/disable the shared luck pool (below). *(toggle)*
- **Successes to stabilise / failures to die** — the death-save thresholds,
  default 3 / 3. *(numbers; the pips redraw to match)*

At 0 HP you're *Dying*; the death-save buttons cover ✓ success, ✗ fail,
**Nat 20** (back up at 1 HP) and **Nat 1** (counts as two failures).

## Fleeting Luck (Shadowdark-style, table-wide)

A shared, volatile luck pool shown in the top bar and synced to everyone via
room metadata:

- **＋ Nat 20** grants the table a point (a death-save Nat 20 grants one too).
- **Spend** burns a point to reroll (disabled at 0).
- **Nat 1** wipes the *entire table's* luck to 0 (a death-save Nat 1 does this too).

Every gain/spend/wipe pops a notification for all players, so the whole table
feels the swing.

## Ability modifiers & initiative are derived automatically

Enter the six ability scores; the sheet computes each modifier and initiative
(DEX mod) for you. AC, speed, and proficiency bonus are entered directly.

## Files

| File            | Purpose                                                              |
| --------------- | ------------------------------------------------------------------- |
| `manifest.json` | Extension metadata + the toolbar `action` (popover) it adds.        |
| `index.html`    | The sheet UI shown in the popover (all styling lives here).         |
| `main.js`       | Loads the OBR SDK; sheet state, hardcore rules, badge, graffiti.    |
| `icon.svg`      | Toolbar icon.                                                       |

## How it works

- **Storage:** each token's sheet lives in that item's `metadata` under
  `com.wvalurejr.hardcore5e/sheet`, written with `OBR.scene.items.updateItems`.
  Table-wide data — Fleeting Luck and the rule config — lives in **room
  metadata** (`OBR.room.setMetadata` / `onMetadataChange`) so it's shared by
  everyone regardless of which token is selected.
- **Roles:** `OBR.player.getRole()` gates rule editing to the GM; players get a
  read-only Rules panel.
- **Selection binding:** the popover reads `OBR.player.getSelection()` and
  re-reads on `OBR.player.onChange`, so it always shows the selected token.
- **Live sync:** `OBR.scene.items.onChange` adopts edits made on other clients
  (unless you're mid-type in a field here).
- **On-map badge:** an `attachedTo` text item shows current HP above the token;
  because it's attached it moves and is deleted along with the token.

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
