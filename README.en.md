<div align="center">

# PDF Office

**A browser-native PDF editor — no server, no uploads, just your files.**

[![Deploy](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://pdf-office-dusky.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Live Demo →**](https://pdf-office-dusky.vercel.app)

[한국어](README.md) · English

</div>

---

## Why PDF Office

- **Privacy-first** — everything runs in your browser. No file uploads, no server storage, no account, no tracking.
- **No install** — one link, instant. All you need is a browser.
- **Work persists** — uploads and edits are saved in the browser (IndexedDB) and survive reloads and revisits.

---

## What it does

| Feature | Details |
|---|---|
| **Upload** | Drag & drop or click — multiple PDFs at once |
| **Encrypted PDF** | Unlock password-protected PDFs, then edit |
| **View** | Page-by-page viewer, zoom & fit (width/page), stable loading |
| **Edit pages** | Delete, rotate, **drag to reorder**, range/toggle select, undo/redo |
| **Extract · Insert · Watermark** | Extract/split selected pages, insert blank or other-doc pages, watermark |
| **Search** | Full-text search, jump to the matching page |
| **Merge** | Combine 2+ PDFs in any order — **mixed page sizes auto-normalized** |
| **Reset** | Clear all documents and edits in one click |
| **AI → Markdown** | Convert PDF to structured Markdown (Claude Sonnet 4.6 / Gemini 2.5 Flash / GPT-4o) |

The only exception is **AI conversion** — it sends requests via a same-origin proxy, using your own key, to the chosen provider only, and is never stored or logged server-side.

---

## Getting started

```bash
git clone https://github.com/tigerjk9/PDF-Office.git
cd PDF-Office

npm install --legacy-peer-deps   # react-dropzone has a peer conflict with React 19
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** `--legacy-peer-deps` is required.

---

## AI Conversion (BYO Key)

Your API key is stored **only in browser `localStorage`** and passed through the same-origin `/api/ai/convert` proxy to the provider. It is never stored or logged server-side.

| Provider | Model | Get a key |
|---|---|---|
| Claude (Anthropic) | `claude-sonnet-4-6` | [console.anthropic.com](https://console.anthropic.com) |
| Gemini (Google) | `gemini-2.5-flash` | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | `gpt-4o` | [platform.openai.com](https://platform.openai.com) |

Scanned PDFs without a text layer are sent as page images to a vision model. Conversion scope (all/current/selected/range) is configurable, and results are cached per document.

---

## Stack

```
Next.js 16 (App Router + Turbopack)
TypeScript · Tailwind CSS v3.4 · shadcn/ui · Pretendard
pdfjs-dist          — PDF rendering / text extraction
pdf-lib              — PDF manipulation (delete·rotate·reorder·merge·extract·insert·watermark)
Zustand (+ IndexedDB persist) — state & session restore
react-dropzone      — file upload
Claude / Gemini / OpenAI — AI conversion (server proxy, BYO Key)
```

---

## Deploy

Pre-configured for Vercel (`vercel.json` applies `--legacy-peer-deps`). Pushing to `main` triggers an automatic production deploy via the Git integration.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigerjk9%2FPDF-Office)

---

## Known constraints

- **No OCR** — for scanned PDFs without a text layer, AI conversion falls back to sending page images to a vision model.
- **Large PDFs** (100+ pages) can be slow to thumbnail.

---

<div align="center">

Built with [Next.js](https://nextjs.org) · Deployed on [Vercel](https://vercel.com)

</div>
