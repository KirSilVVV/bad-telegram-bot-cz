# Bad Telegram Bot CZ: AI Coding Agent Guidelines

## Project Overview
**bad-telegram-bot-cz** is a Node.js Telegraf bot that extracts text from documents (PDF, images, Word) using OCR/text parsing, then sends extracted text to **Voiceflow** for conversational AI processing.

### Core Architecture
- **Telegraf** (Telegram bot framework) → handles user messages & file uploads
- **File Processing Pipeline** (OCR + text extraction)
  - PDFs: `pdf-parse` for text + `pdfjs-dist` for OCR on scanned pages
  - Images: `tesseract.js` for OCR
  - Word: `mammoth` for .docx extraction
  - Images (general): `sharp` for preprocessing
- **Voiceflow Runtime API** → processes extracted text as conversation

### Data Flow
```
User sends file (PDF/image/Word)
  ↓
File downloaded to tmp/
  ↓
Text extraction (pdf-parse OR tesseract.js OR mammoth)
  ↓
POST to Voiceflow Runtime API
  ↓
Voiceflow response sent back to Telegram
```

## Key Implementation Patterns

### File Type Detection
- Uses `file-type` package to detect actual file type (not just extension)
- Prevents security issues with misnamed files
- Handles: PDF, PNG, JPG, DOCX, others

### PDF Processing (Hybrid Approach)
```javascript
// 1. Try pdf-parse (works for text PDFs)
// 2. If text is empty → render each page to canvas + OCR
// ✅ Handles both native PDFs and scanned images-as-PDF
```

### Logging & Debugging
- `DEBUG=true` in code enables detailed logging
- Logs: extracted text, OCR results, Voiceflow requests/responses
- Files saved to `logs/` directory
- Consider disabling in production or use `NODE_ENV=production`

### Error Handling
- File download failures → user-friendly error message
- OCR timeouts → graceful fallback or partial text
- Voiceflow API errors → logged + error message to user
- Temp files cleaned up after processing

## Environment Configuration

```dotenv
TELEGRAM_BOT_TOKEN      # Required: Bot token from BotFather
VOICEFLOW_API_KEY       # Required: Voiceflow API key
VOICEFLOW_VERSION_ID    # Required: Voiceflow version/bot ID
NODE_ENV                # Optional: 'production' to reduce logging
```

## Build & Run

```bash
npm install              # Install deps (includes Canvas build)
npm start               # node index.js
```

⚠️ **Canvas Installation:** `@napi-rs/canvas` requires native compilation. On first install, it will:
- Download pre-built binaries for your OS
- If no pre-built available, it will compile (requires C++ build tools)
- On Render, this is handled automatically during build

## Dependencies to Know

| Package | Purpose | Notes |
|---------|---------|-------|
| `telegraf` | Telegram bot framework | Handles webhook/polling setup |
| `tesseract.js` | OCR engine | Browser-compatible, runs in Node.js |
| `pdf-parse` | PDF text extraction | Fast for native PDFs |
| `pdfjs-dist` | PDF rendering for OCR | Converts scanned PDFs to images |
| `sharp` | Image processing | Resize, compress before OCR |
| `mammoth` | Word (.docx) extraction | Preserves formatting |
| `@napi-rs/canvas` | Canvas for rendering | Used by pdfjs for page rendering |

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Canvas build fails on Render | Native compilation not available | Render handles this automatically; ensure `package-lock.json` is committed |
| "Webhook failed" error | Bot webhook not set correctly | Set via Telegram API or Telegraf `launch()` |
| OCR timeout (tesseract) | Large image or slow CPU | Add timeout: `Tesseract.recognize(img, lang, { timeout: 30000 })` |
| Empty text from PDF | Scanned PDF not recognized | Fallback to OCR pipeline kicks in automatically |
| Memory leak in tmp/ | Temp files not cleaned | `fs.unlink(tmpPath)` called after processing |

## Deployment (Render)

1. Push to GitHub (with `render.yaml` in root)
2. Connect Render → GitHub repository
3. Create Web Service, select Node environment
4. Add environment variables: `TELEGRAM_BOT_TOKEN`, `VOICEFLOW_API_KEY`, `VOICEFLOW_VERSION_ID`
5. Render auto-builds and deploys

**First build may take 2-3 minutes** (Canvas compilation). Subsequent builds are faster.

## Files to Know
- **[index.js](index.js)** — Main bot logic (399 lines, all-in-one)
- **[package.json](package.json)** — Dependencies
- **[render.yaml](render.yaml)** — Render configuration
- **[.env.example](.env.example)** — Environment template

## External Integrations
- **Telegram Bot API** — `setWebhook`, `editMessageReplyMarkup`, file downloads
- **Voiceflow General Runtime** — `POST /state/{versionId}/user/{userId}/interact`
