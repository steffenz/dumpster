# Dumpster

A browser extension to help you **stop using the sites you keep slipping back
to**. Group sites into **bins** (collections), and for each bin decide what
happens when you visit one:

- **Warning bar** — the page loads, but a big red bar is stuck on top.
- **Redirect** — you're sent to a calmer URL of your choosing.
- **Stop page** — the site is replaced with a plain "site blocked" page.

Each bin has its own **default action**, and individual sites can **override**
it. So one bin ("Schibsted") can replace everything with a stop page while
sending `vg.no` to `nrk.no`, and another bin ("Social") just shows a warning —
all at once. Bins can be toggled on and off independently.

Dumpster ships **empty** — you create bins and **paste in your own lists** of
domains. A ready-to-paste Schibsted starter list lives in
[`presets/schibsted.txt`](presets/schibsted.txt) (VG, Aftenposten, Finn,
Aftonbladet, SvD, Blocket, Tori, DBA, and more).

The wording **and button labels** on the warning bar and stop page are editable
under the **Appearance** tab — use `{site}` anywhere you want the blocked domain
to appear. The panel follows your system **light/dark** theme automatically.

## Install (Chrome / Brave / Edge / Vivaldi)

No build step, no command line, no account — the repository ships ready to run.
Everything the browser needs is already in the download, so you just unzip and
load the folder.

1. **Download the ZIP.** On the GitHub page click the green **Code** button →
   **Download ZIP**. (Or grab a release ZIP if one is attached.)
2. **Unzip it** somewhere permanent — e.g. `~/Extensions/dumpster`. The
   browser reads the extension from this folder every time it starts, so don't
   delete it or load it from inside the Downloads folder.
3. Open your browser's extensions page:
   - Chrome → `chrome://extensions`
   - Brave → `brave://extensions`
   - Edge → `edge://extensions`
   - Vivaldi → `vivaldi://extensions`
4. Turn on **Developer mode** (toggle, usually top-right).
5. Click **Load unpacked** and select the unzipped folder — the one that
   contains `manifest.json` (if you opened the ZIP and there's a single folder
   inside, pick *that* inner folder).
6. Pin the toolbar icon. Click it for the master on/off and per-bin toggles, or
   right-click → **Options** to manage bins and wording.

> **Why "Developer mode"?** This extension is loaded directly rather than from
> the Chrome Web Store, so the browser calls it an unpacked/developer extension.
> It stays installed across restarts. The browser may show a one-time "disable
> developer mode extensions" nag on startup — that's normal for sideloaded
> extensions and safe to dismiss.

> **Updating:** download the new ZIP, replace the folder's contents, then click
> the **↻ reload** icon on the card at `chrome://extensions`.

## Bins & importing

Everything happens in the admin panel (popup → **Manage bins & settings**):

1. **New bin** → give it a name and a default action (warning / redirect / stop).
2. **Paste domains** → paste a newline- or comma-separated list; each becomes a
   site in the bin. Or **+ Add site** one at a time.
3. Optionally set a per-site override (a different action, or a custom redirect)
   from the dropdown on each row.
4. **Save changes** on that bin.

To block the Schibsted ecosystem, open [`presets/schibsted.txt`](presets/schibsted.txt),
copy it, make a bin, and paste it in.

When you save, the extension asks for host permission for the bin's domains (one
prompt). There are **no baked-in defaults**, so nothing is requested until you
add it.

## Permissions — why no `<all_urls>`

Dumpster declares **zero** host permissions up front. Every domain you add is
requested individually through `optional_host_permissions` when you save the
bin, so the browser only ever grants access to the exact sites on your lists —
never "all sites." Blocking rules are created at runtime with
`declarativeNetRequest`.

## How it works

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3 definition. No host permissions; everything is optional. |
| `src/common.js` | Data model (bins), storage, action-resolution, and permission helpers. |
| `src/background.js` | Service worker. Resolves bins → per-domain dynamic `declarativeNetRequest` rules + registers warning content scripts. |
| `src/content.js` | Injects the warning bar (for "warning" sites only), in a shadow root. |
| `src/options.html/js` | The admin panel: bin grid, popup bin editor, Appearance tab. |
| `src/popup.html/js` | Toolbar quick-toggles (master on/off + per-bin). |
| `src/blocked.html/js` | The custom stop page. |
| `src/pages.css` | Shared styling for the pages above. |
| `presets/schibsted.txt` | Copy-paste starter list of Schibsted domains. |
| `assets/icon.svg` | Editable icon master (the flaming dumpster). |
| `tools/render_icons.sh` | Rasterizes the SVG to `icons/icon{16,48,128}.png` (`./tools/render_icons.sh`). |

Each active site resolves to an **effective action** — its own override, or its
bin's default — and they apply independently:

- **redirect** / **stop page** sites get a dynamic `declarativeNetRequest`
  redirect rule (to the custom/bin URL, or the bundled stop page).
- **warning** sites get no network rule; a dynamically-registered content script
  draws the bar and self-gates on the per-domain action.

So the lists can mix all three actions at once. Rules are built dynamically
because each site can differ; there is no static ruleset and no build step.

Redirect/stop-page actions intercept the request *before* the page loads (via
declarativeNetRequest), so there's no flicker. Matching is suffix-based: `vg.no`
also covers `www.vg.no` and any other subdomain.

## Firefox

The codebase is intentionally Chromium-first but Firefox-friendly: it uses the
`chrome.*` API with a `browser` fallback, promise-based storage, and standard
declarativeNetRequest. To target Firefox you'll mainly need to:

- add a `browser_specific_settings.gecko.id`,
- switch `background.service_worker` to `background.scripts` (older Firefox), and
- repackage.

That's the planned next step rather than something wired up today.

## Notes

- Icons are rendered from `assets/icon.svg` — edit the SVG and rerun
  `./tools/render_icons.sh` to regenerate the PNGs. The icon is transparent and
  reused everywhere: the toolbar, the warning bar, the stop page, and the admin
  panel header.
- The master toggle (header or popup) and per-bin toggles apply **instantly**.
  Bin content edits and Appearance changes apply when you hit their **Save**.
- Disabling the extension removes all blocking rules and hides the warning bar.
