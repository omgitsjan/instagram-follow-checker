# Instagram Follow Checker

[![CI](https://github.com/omgitsjan/instagram-follow-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/omgitsjan/instagram-follow-checker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Chrome extension (**Manifest V3**, **v2**) for Instagram follow relationships, local analytics, bot heuristics, and optional **Impersonator** (read-only view of another public account) — all via **your existing browser session**. No official API, no paywall, no backend.

| Section | What you get |
|---------|----------------|
| **Relationships** | Following / Followers tiles; Mutual / Not back / You don’t follow |
| **Analytics** | Doughnut charts from your list buckets (mutual / not back / not you) |
| **Bots** | Heuristic “maybe bot” list (≥25 signals) with unfollow/remove actions |
| **Posts** | Roadmap / coming soon (Admire & own-posts fans) |
| **Settings** | Language EN/DE, Impersonator load/disable, open source, tip |

> **Vibe-coded.** Built exploratively with AI — not production/enterprise software. Expect rough edges, Instagram breaking changes, and no support guarantee.

**UI language:** English by default. **German** is supported via full-page **Settings**.

---

## Important disclaimer

**Read this before installing or using the extension.**

### No warranty / no liability

- Provided **“as is”**, without warranty of any kind (express or implied).
- Authors and contributors are **not liable** for account restrictions, bans, lost followers, data loss, or any damages.
- Use **at your own risk**.

### Instagram Terms of Service / automation

This tool does **not** use the official Instagram Graph API. It loads data through the same kind of web session / internal web endpoints the Instagram website uses (cookies in your browser).

That may conflict with **Instagram / Meta Terms of Use**, especially where they prohibit:

- automated access, scraping, or unofficial clients  
- bulk follow / unfollow  
- bot-like behaviour  

**Possible outcomes** (depending on usage and Instagram’s systems):

- temporary action blocks  
- limited features  
- **account restriction or permanent ban**  

**Recommendations:**

- only use an account you can afford to risk  
- do **not** mass-follow or mass-unfollow  
- pause if you hit rate limits (e.g. HTTP 429)  
- do not use this for spam, harassment, or commercial bulk abuse  

This repo is **not** advice to circumvent ToS. You are responsible for complying with Instagram/Meta rules and applicable law.

### Not affiliated

- **Not** affiliated with Meta, Instagram, or related companies  
- Unofficial tool  
- Internal Instagram endpoints can break at any time  

---

## Features

- **Relationships:** full Following / Followers lists; mutual / not back / you don’t follow  
- **Analytics:** pie/doughnut charts from list buckets (no broken “most followers” rankings)  
- **Bots:** local heuristics with unfollow / remove-follower style actions where available  
- **Impersonator (Settings):** load a public username → analysis runs for that account (read-only); **Disable** resets to you  
- Profile pictures (with fallback via the Instagram tab)  
- **Unfollow** / **Follow** from relationship lists  
- Search and JSON export  
- Last result cached locally in the browser  
- **English** default UI + **German** in Settings  
- Posts / Admire marked **coming soon**  
- Everything local — **no** developer backend  

---

## Privacy

- Privacy policy: [PRIVACY.md](./PRIVACY.md)  
- Public URL (Chrome Web Store): https://github.com/omgitsjan/instagram-follow-checker/blob/main/PRIVACY.md  
- Store form answers: [`store/chrome-web-store-form-answers-en.txt`](./store/chrome-web-store-form-answers-en.txt) · [`store/chrome-web-store-form-answers-de.txt`](./store/chrome-web-store-form-answers-de.txt)

Relationship data is processed **locally in your browser**. Analysis results are not sent to the developer’s servers.

---

## Installation (unpacked)

### Option A – Release ZIP (recommended)

1. Download the latest **[Release](https://github.com/omgitsjan/instagram-follow-checker/releases)**  
   (e.g. [`instagram-follow-checker-v1.0.0.zip`](https://github.com/omgitsjan/instagram-follow-checker/releases/download/v1.0.0/instagram-follow-checker-v1.0.0.zip))  
2. Unzip  
3. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked**  
4. Select the **unzipped folder**  
5. Open [instagram.com](https://www.instagram.com) (logged in) → extension icon → **Start analysis**

### Option B – From the repo

1. Clone the repository  
2. Load the project folder as an unpacked extension (steps 3–5 above)  

After code updates: click **Reload** on the extensions page and refresh the Instagram tab.

**Tip:** Package with valid timestamps (avoids “Updated 1 Jan 1970” in the store):

```bash
node scripts/package-zip.mjs
```

---

## Usage

1. Stay logged in on Instagram (tab open).  
2. Start analysis and wait (large accounts take longer; requests are paced).  
3. Use **Relationships** for tiles/tabs; **Analytics** for charts; **Bots** for heuristic flags.  
4. Optionally follow/unfollow; use search or export.  
5. **Settings** → language EN/DE, **Impersonator** (load public username / disable), GitHub, tip.  
6. On errors (429, login): wait, reload, try again.  

---

## Project structure

| File | Role |
|------|------|
| `manifest.json` | MV3, Instagram + CDN host permissions |
| `content.js` | Runs on `instagram.com`, lists, resolve user, follow/unfollow |
| `popup.*` | UI: sections, tiles, charts, bots, settings, Impersonator |
| `analytics.js` | Doughnut/pie charts from list buckets |
| `i18n.js` | English + German strings |
| `PRIVACY.md` | Privacy policy |
| `docs/V2-CONCEPT.md` | v2 product concept notes |
| `store/` | Chrome Web Store assets & form answers |

Data stays in the browser (`chrome.storage.local` for language + last result + Impersonator target).

---

## Limitations

- Instagram API/DOM changes can break the extension overnight  
- Rate limits / action blocks are possible  
- Very large accounts mean long runtimes  
- No multi-account manager, no background auto-unfollow bot  

---

## CI / releases

Lightweight pipeline (no app bundler, no Web Store deploy in CI):

| Workflow | When | What |
|----------|------|------|
| **CI** (`ci.yml`) | Push/PR on `main` | Validate structure, JS syntax, ZIP artifact |
| **Release** (`release.yml`) | Tag `v*` (e.g. `v1.0.0`) | Validate, tag = manifest version, GitHub Release + ZIP |

Local checks:

```bash
node scripts/validate-extension.mjs
node --check content.js
node --check popup.js
node --check analytics.js
node --check i18n.js
```

Release example (bump `manifest.json` version first):

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## License

[MIT](./LICENSE) — plus the **disclaimers** above: use at your own risk; **no liability**, especially for Instagram/Meta account actions.

---

## Contributing

PRs welcome, no guarantee on review time. Please **do not** add features aimed at aggressive mass spam or bulk abuse.

---

## Credits

- Vibe-coded with AI assistance  
- Author: [omgitsjan](https://github.com/omgitsjan)  

If this helps you: a star on the repo is enough. Be fair to other accounts — and read the warnings again.
