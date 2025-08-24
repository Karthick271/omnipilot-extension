# ChatPilot – Chrome Extension (MVP)

A streamlined Chrome/Chromium extension scaffold set up with a clean repo structure.  
Drop your existing source files into the mapped folders below, commit, and push.

---

## 📁 Repo Structure (What goes where)

```
.
├── src/
│   ├── background/        # Service worker or background script(s)
│   ├── content/           # Content scripts injected into pages
│   ├── popup/             # Browser action popup UI (html/js/css)
│   ├── options/           # Options page UI (html/js/css)
│   └── lib/               # Reusable helpers/utils (no DOM here)
├── assets/
│   ├── icons/             # 16/32/48/128/256 png icons (replace placeholders)
│   ├── images/            # Misc static images used by popup/options
│   ├── css/               # Shared styles (reset.css, variables.css, etc.)
│   └── json/              # JSON-LD samples or schema files
├── docs/                  # Screenshots, architecture notes
├── scripts/               # Local dev or packaging scripts
├── manifest.json          # Chrome extension manifest (v3)
├── package.json           # Optional (if you use Node tooling)
├── .gitignore
├── LICENSE
├── CHANGELOG.md
└── CONTRIBUTING.md
```

> **Where to put your current files**  
> - **manifest.json** → replace the root `manifest.json` here.  
> - **Background / service worker** → `src/background/`.  
> - **Content scripts** → `src/content/`.  
> - **Popup** (HTML/CSS/JS) → `src/popup/`.  
> - **Options** (HTML/CSS/JS) → `src/options/`.  
> - **Helpers** → `src/lib/`.  
> - **Static assets** (icons, images) → `assets/` subfolders.

---

## ✨ Features (document here)

List the features your extension provides. Example (edit to match yours):

- Create folders & subfolders for conversations
- Multiple custom instruction profiles
- Prompt chains, prompt templates, custom prompts
- Prompt history, favorites, public prompts
- Minimap overview of entire conversation
- Hide/show custom GPT list and alphabetical sort
- Override default model switcher to access all models
- Pinned messages for quick access
- Export chats: PDF / Text / Markdown / JSON

> Keep this section up to date. If a feature has caveats or permissions, link to a doc or screenshot in `/docs`.

---

## 🧩 Static Files & Manifest Mapping

- **Icons** live in `assets/icons/` and are declared in `manifest.json` → `action.default_icon` and `icons`.
- **Popup** → declared via `action.default_popup` → `src/popup/index.html`.
- **Options page** → `options_page` → `src/options/index.html`.
- **Content scripts** → `content_scripts[*].js` → files under `src/content/`.
- **Web-accessible resources** (e.g., images) → set in `web_accessible_resources[*].resources` and store under `assets/`.

---

## 🛠️ Local Development

You can use this project without Node tooling. If you want bundling/TypeScript, add your preferred toolchain later.

### Load unpacked in Chrome
1. `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the repo root folder.

### Optional: Node toolchain (only if you need it)
```bash
# Initialize once if you plan to use npm scripts or tooling
npm init -y
npm i --save-dev esbuild
```

---

## 🚀 Build & Release

When you are ready to publish:
1. Bump the version in `manifest.json` (and tag it).
2. Run the packaging script:
   ```bash
   bash scripts/package.sh
   ```
3. Upload the ZIP in `release/` to the Chrome Web Store.

---

## 🔐 Permissions

Document the permissions you request and why:
- `activeTab` – to access current tab context after user action
- `scripting` – to inject content scripts on demand
- `storage` – to persist user settings
- `tabs` – to read basic tab info for features like minimap

Keep this minimal and explain each permission.

---

## 🧭 Contributing

- Use small, focused PRs.
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`).
- Add/Update tests (if you introduce toolchains).

---

## 📝 Changelog

See [`CHANGELOG.md`](./CHANGELOG.md). Use semver: `MAJOR.MINOR.PATCH`.

---

## 📄 License

MIT by default. Replace with your own if needed.