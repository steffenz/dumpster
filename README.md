# Drittsleipt

A browser extension to help you **stop using Schibsted sites and services**. It
blocks a list of domains and lets you decide, in an admin panel, what happens
when you visit one:

- **Warning bar** — the page loads, but a big red bar is stuck on top.
- **Redirect** — you're sent to a calmer URL of your choosing.
- **Stop page** — the site is replaced with a plain "site blocked" page.

You pick a **default action**, then **override it per-site**: each entry in the
block list has its own action dropdown, so you can keep a stop page as the
default while sending `vg.no` to `nrk.no` and showing only a warning on
`finn.no`. Redirect sites can use the default destination or their own.

The wording **and button labels** on the warning bar and stop page are fully
editable in the admin panel — use `{site}` anywhere you want the blocked domain
to appear. The panel follows your system **light/dark** theme automatically and
flags unsaved changes (nothing applies until you hit **Save**).

Ships with a starter list of Schibsted properties (VG, Aftenposten, Finn,
Aftonbladet, SvD, Blocket, Tori, DBA, and more). The list is fully editable.

## Install (Chrome / Brave / Edge / Vivaldi)

No build step, no command line, no account — the repository ships ready to run.
Everything the browser needs is already in the download, so you just unzip and
load the folder.

1. **Download the ZIP.** On the GitHub page click the green **Code** button →
   **Download ZIP**. (Or grab a release ZIP if one is attached.)
2. **Unzip it** somewhere permanent — e.g. `~/Extensions/drittsleipt`. The
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
6. Pin the toolbar icon. Click it for the quick on/off + mode switch, or
   right-click → **Options** to manage the block list.

> **Why "Developer mode"?** This extension is loaded directly rather than from
> the Chrome Web Store, so the browser calls it an unpacked/developer extension.
> It stays installed across restarts. The browser may show a one-time "disable
> developer mode extensions" nag on startup — that's normal for sideloaded
> extensions and safe to dismiss.

> **Updating:** download the new ZIP, replace the folder's contents, then click
> the **↻ reload** icon on the card at `chrome://extensions`.

## Editing the block list

**As a user:** you don't need any of this. Add or remove sites right in the
admin panel (popup → Options). When you add your own domain, the extension asks
for permission for just that one host the first time you save — that's all.

**As a maintainer** changing the *default* shipped list: `blocklist.json` is the
single source of truth. After editing it, regenerate the committed artifacts:

```sh
node tools/build.js
```

This rewrites the manifest's scoped `host_permissions` and content-script
`matches`, and `src/blocklist.data.js`. **Commit the regenerated files** — they
ship in the repo so end users can load the download without running anything.
Then reload the extension.

## Permissions — why no `<all_urls>`

The extension only touches the sites on the list, so permissions are scoped to
exactly those domains (e.g. `*://*.vg.no/*`) instead of all sites. The store
warning reads "Read and change your data on vg.no and N other sites." User-added
domains use `optional_host_permissions`, requested per-host on demand — no broad
install-time grant.

## How it works

| File | Role |
| --- | --- |
| `blocklist.json` | Source of truth for the default domains. |
| `tools/build.js` | Generates manifest perms and `blocklist.data.js`. |
| `manifest.json` | Manifest V3 definition (generated perms; do not hand-edit the host lists). |
| `src/blocklist.data.js` | Generated `DEFAULT_BLOCKLIST`, loaded everywhere. |
| `src/common.js` | Shared storage, domain-matching, action-resolution, and permission helpers. |
| `src/background.js` | Service worker. Maintains per-domain dynamic `declarativeNetRequest` rules. |
| `src/content.js` | Injects the warning bar (for "warning" sites only), in a shadow root. |
| `src/options.html/js` | The admin panel. |
| `src/popup.html/js` | Toolbar quick-toggle (on/off + default action). |
| `src/blocked.html/js` | The custom stop page. |
| `src/pages.css` | Shared styling for the pages above. |
| `assets/icon.svg` | Editable icon master (poop swirl + prohibition slash). |
| `tools/render_icons.sh` | Rasterizes the SVG to `icons/icon{16,48,128}.png` (`./tools/render_icons.sh`). |

The blocking engine resolves an **effective action per domain** — the site's
override, or the global default — and applies each independently:

- **redirect** / **stop page** sites get a dynamic `declarativeNetRequest`
  redirect rule (to the custom/default URL, or the bundled stop page).
- **warning** sites get no network rule; the content script draws the bar and
  self-gates on the per-domain action.

This means the list can mix all three actions at once. Rules are built
dynamically because each site can differ; there is no static ruleset.

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
- Disabling the extension from the popup removes all blocking rules and hides the
  warning bar.
