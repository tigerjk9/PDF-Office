<div align="center">

# 📄 PDF Office

### A browser-native PDF viewer & editor
**No server · No uploads · No tracking — your files stay in your browser.**

<br/>

[![Live](https://img.shields.io/badge/▶_Live_Demo-pdf--office-000?style=for-the-badge&logo=vercel&logoColor=white)](https://pdf-office-dusky.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![100% Client-Side](https://img.shields.io/badge/100%25-client--side-22c55e)](#-why-pdf-office)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[한국어](README.md) · **English**

</div>

---

> **TL;DR** — Open, read, edit pages, merge, and even convert PDF to Markdown with AI. Your files never leave the browser.

---

## ✨ Why PDF Office

| | |
|---|---|
| 🔒 **Privacy-first** | Everything runs in your browser. **Zero** file uploads, server storage, accounts, or tracking |
| 📖 **Viewer and editor** | Continuous, single, and 2-up view modes. One screen for reading and editing |
| ⚡ **No install** | One link, instant. All you need is a browser |
| 💾 **Work persists** | Uploads, edits, and view settings (mode, zoom, panel width) are saved in the browser (IndexedDB / localStorage) and survive reloads & revisits |

> The only exception is **AI conversion** — requests go via a same-origin proxy, using your own key, to the chosen provider only, and are never stored or logged server-side.

---

## 🧩 What it does

| | Feature | Details |
|---|---|---|
| 📤 | **Upload** | Drag & drop or click — multiple PDFs at once (max **100MB**/file, up to **20** at once) |
| 🔑 | **Encrypted PDF** | Drop a locked PDF and a **password prompt appears automatically** → unlock, then edit & download like any document |
| 👁️ | **View** | Continuous · single · **2-up** modes · mouse/keyboard scroll · Ctrl/⌘+wheel zoom · drag-pan · resizable page panel |
| ✂️ | **Edit pages** | Delete · rotate 90° · **drag to reorder** (or first/up/down/last buttons) · range/toggle select · undo/redo |
| 📑 | **Extract · Insert · Watermark** | Extract selected pages **into a new document** (split effect for a contiguous range) · insert blank pages · insert pages from another doc* · watermark all pages |
| 🔍 | **Search** | Full-text search across the document, jump to the matching page |
| 🔗 | **Merge** | Combine 2+ PDFs in any order — **mixed page sizes auto-normalized*** |
| ♻️ | **Reset** | Clear all documents and edits in one click |
| 🤖 | **AI → Markdown** | Convert PDF to structured Markdown (Claude Sonnet 4.6 / Gemini 2.5 Flash / GPT-4o) |

<sub>\* "Insert from another doc" and "Merge" appear in the toolbar only when **2+ documents** are open.</sub>

---

## 👁️ View modes & viewer controls

PDF Office is a **comfortable reader** before it is an editor. Switch modes from the top control bar; your choice is saved across sessions.

| Mode | Layout | Use for |
|---|---|---|
| **Continuous** `default` | All pages, single column, smooth scroll | Reading through a long document |
| **Single page** | One page at a time, fit-to-page supported | Reviewing page by page |
| **2-up** | N×2 spread (`1·2 / 3·4 …`, odd last page solo) | Book/paper-style spread reading |

<details>
<summary><b>Expand control details</b></summary>

<br/>

- **Scroll** — mouse wheel/trackpad, or keyboard. Scroll position and page number stay in two-way sync.
- **Zoom** — slider · `+`/`−` buttons · **`Ctrl`/`⌘` + wheel**. Fit-width in every mode; fit-page in single mode.
- **Drag-pan** — when zoomed in and content is wider than the viewport, drag to move.
- **Resizable page panel** — drag the right edge of the left thumbnail panel to set its width between **180–420px** (accessible `role="separator"`). Persisted and restored on reload.
- **Smooth at scale** — off-screen pages stay as thumbnail placeholders while only visible pages render to canvas (IntersectionObserver windowing) plus a shared pdfjs document cache (zero re-parsing).
- **Session restore** — view mode, zoom, and panel width are restored along with uploads and edits.

</details>

---

## ⌨️ Keyboard shortcuts

| Action | Keys |
|---|---|
| Previous / next page | <kbd>←</kbd> <kbd>→</kbd> |
| Scroll | <kbd>↑</kbd> <kbd>↓</kbd> · <kbd>PageUp</kbd> <kbd>PageDown</kbd> · <kbd>Space</kbd> · <kbd>Home</kbd> <kbd>End</kbd> |
| Delete selected pages | <kbd>Del</kbd> |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> |
| Select all pages | <kbd>Ctrl</kbd>+<kbd>A</kbd> |
| Clear selection / close | <kbd>Esc</kbd> |
| Zoom | <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + wheel |

---

## 🚀 Getting started

```bash
git clone https://github.com/tigerjk9/PDF-Office.git
cd PDF-Office

npm install --legacy-peer-deps   # react-dropzone has a peer conflict with React 19
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **⚠️ `--legacy-peer-deps` is required.**
>
> Verification (no test runner): `npx tsc --noEmit` · `npm run build`

---

## 🤖 AI Conversion (BYO Key)

Your API key is stored **only in browser `localStorage`** and passed through the same-origin `/api/ai/convert` proxy to the provider. It is never stored or logged server-side.

| Provider | Model | Get a key |
|---|---|---|
| Claude (Anthropic) | `claude-sonnet-4-6` | [console.anthropic.com](https://console.anthropic.com) |
| Gemini (Google) | `gemini-2.5-flash` | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | `gpt-4o` | [platform.openai.com](https://platform.openai.com) |

Scanned PDFs without a text layer are sent as page images to a vision model. Conversion scope (**all / current / selected / range**) is configurable, and results are cached per document.

---

## 🛠️ Stack

```
Next.js 16 (App Router + Turbopack)
TypeScript · Tailwind CSS v3.4 · shadcn/ui · Pretendard
pdfjs-dist                     — PDF rendering / text extraction
pdf-lib                        — PDF manipulation (delete·rotate·reorder·merge·extract·insert·watermark)
Zustand (+ IndexedDB persist)  — state & session restore (view-mode persist, v3 migrate)
react-dropzone                 — file upload
Claude / Gemini / OpenAI       — AI conversion (server proxy, BYO Key)
```

---

## 📂 Project structure

```
src/
├── app/                  # App Router · /api/ai/convert proxy route
├── components/
│   ├── ai/               # ConvertPanel · MarkdownPreview
│   ├── help/             # HelpSheet
│   ├── layout/           # AppShell · AppFooter · PanelResizer (panel-width drag)
│   ├── merge/            # MergeDialog
│   ├── pages/            # PageGrid · PageThumbnail · Insert/Watermark dialogs
│   ├── upload/           # DropZone · FileList · PasswordDialog (encrypted PDF)
│   ├── viewer/           # PdfViewer (shell) · Continuous/SinglePageViewer · PageSlot · ZoomControl · SearchPanel
│   └── ui/               # shadcn/ui primitives
├── hooks/                # useEncryptedUpload · useViewerScrollSync · usePanelWidth · useKeyboardShortcuts · …
├── lib/
│   ├── ai/               # server adapters · converter · transport · page-extractor · cache
│   ├── pdf/              # loader · renderer · manipulator (delete·rotate·reorder·merge)
│   │                     #   insert (extract·insert·watermark) · merge-normalize · search
│   │                     #   text-extractor · history · spread (2-up) · doc-cache · idb-storage
│   ├── store/            # Zustand pdf-store (IndexedDB persist · v3 migrate)
│   └── types.ts          # type SSOT
```

---

## ☁️ Deploy

Pre-configured for Vercel (`vercel.json` applies `--legacy-peer-deps`). Pushing to `main` triggers an automatic production deploy via the Git integration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigerjk9%2FPDF-Office)

---

## ⚠️ Known constraints

- **No OCR** — for scanned PDFs without a text layer, AI conversion falls back to sending page images to a vision model (no text extraction itself).
- **Large PDFs** (100+ pages) — the main viewer scrolls smoothly via windowing, but thumbnail generation in the left page panel can be slow.
- **No in-place text editing** — intentionally excluded; perfect reproduction is impossible due to font/reflow limits (focus is page-level editing).

---

## 📜 License

[MIT](LICENSE) © 2026 Jinkwan Kim (dot_connector)

---

<div align="center">

### Maker

**[dot_connector (Jinkwan Kim)](https://litt.ly/dot_connector)** — a connectivist pursuing learning, sharing, and growth

<br/>

Built with [Next.js](https://nextjs.org) · Deployed on [Vercel](https://vercel.com)

</div>
