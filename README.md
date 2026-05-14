<div align="center">

# PDF Office

**Browser-native PDF editor with AI conversion — no server, no uploads, just your files.**

[![Deploy](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://pdf-office-dusky.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Live Demo →**](https://pdf-office-dusky.vercel.app)

</div>

---

## What it does

| Feature | Details |
|---|---|
| **Upload** | Drag & drop or click — single or multiple PDFs at once |
| **View** | Page-by-page viewer with pinch/scroll zoom |
| **Edit pages** | Delete, reorder, rotate individual pages |
| **Merge** | Combine 2+ PDFs into one, in any order |
| **AI → Markdown** | Convert PDF text to structured Markdown via Claude, Gemini, or GPT-4o |

Everything runs **in your browser**. Files never leave your machine. AI calls go directly from your browser to the provider using your own API key.

---

## Stack

```
Next.js 16 (App Router + Turbopack)
TypeScript · Tailwind CSS v4 · shadcn/ui
pdfjs-dist  — PDF rendering
pdf-lib     — PDF manipulation (delete, reorder, merge, rotate)
Zustand     — state management
react-dropzone — file upload
Anthropic SDK / Gemini API / OpenAI API — AI conversion (BYO Key)
```

---

## Getting started

```bash
git clone https://github.com/tigerjk9/PDF-Office.git
cd PDF-Office

npm install --legacy-peer-deps   # react-dropzone needs legacy peer resolution
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** `--legacy-peer-deps` is required. react-dropzone has a peer dep conflict with React 19.

---

## AI Conversion (BYO Key)

PDF Office uses a **Bring Your Own Key** model — your API key is stored only in `localStorage` and sent directly to the provider. It never touches any server.

| Provider | Where to get a key |
|---|---|
| Claude (Anthropic) | [console.anthropic.com](https://console.anthropic.com) |
| Gemini (Google) | [aistudio.google.com](https://aistudio.google.com) |
| GPT-4o (OpenAI) | [platform.openai.com](https://platform.openai.com) |

Paste your key in the AI panel — it's saved locally for future sessions.

---

## Project structure

```
src/
├── app/                  # Next.js App Router
├── components/
│   ├── ai/               # ConvertPanel, MarkdownPreview
│   ├── layout/           # AppShell
│   ├── pages/            # PageGrid, PageThumbnail
│   ├── toolbar/          # EditorToolbar
│   ├── upload/           # DropZone, FileList
│   ├── viewer/           # PdfViewer, ZoomControl
│   └── ui/               # shadcn/ui primitives
├── hooks/                # usePdf, usePageManager, useMerge, useAiConverter
├── lib/
│   ├── ai/               # providers (claude, gemini, openai), converter, prompt
│   ├── pdf/              # loader, renderer, manipulator, text-extractor, exporter
│   ├── store/            # Zustand pdf-store
│   └── types.ts          # TypeScript SSOT
└── types/
    └── pdf.ts            # re-export barrel → @/lib/types
```

---

## Deploy

The project is pre-configured for Vercel. `vercel.json` sets `--legacy-peer-deps` automatically:

```json
{
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "framework": "nextjs"
}
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftigerjk9%2FPDF-Office)

---

## Known constraints

- **Text editing** is basic — replaces text at a bounding-box level using pdf-lib. Complex layouts may shift.
- **Large PDFs** (100+ pages) will be slow to thumbnail — rendering is synchronous per page.
- **No OCR** — scanned PDFs without embedded text will produce empty Markdown.

---

<div align="center">

Built with [Next.js](https://nextjs.org) · Deployed on [Vercel](https://vercel.com)

</div>
