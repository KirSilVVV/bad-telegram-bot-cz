# Bad Telegram Bot CZ

Telegram bot for document processing (PDF, images, Word) with OCR and Voiceflow integration.

## Features

- 📄 **PDF Support**: Text extraction + OCR for scanned PDFs (no external dependencies)
- 🖼️ **Image OCR**: Tesseract.js for PNG/JPG with text recognition
- 📝 **Word Documents**: Extract text from .docx files
- 🤖 **Voiceflow Integration**: Send extracted text to Voiceflow chatbot
- 🔒 **Secure**: File type validation, temp file cleanup

## Setup

### Prerequisites
- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Voiceflow account with API key and version ID

### Local Development

1. **Clone & install**
```bash
git clone <your-repo-url>
cd bad-telegram-bot-cz
npm install
```

2. **Create `.env` from template**
```bash
cp .env.example .env
```

3. **Add your credentials to `.env`**
```dotenv
TELEGRAM_BOT_TOKEN=your_token_here
VOICEFLOW_API_KEY=your_key_here
VOICEFLOW_VERSION_ID=your_version_id_here
```

4. **Run locally**
```bash
npm start
```

## Deployment on Render

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Render
- Go to https://dashboard.render.com
- Click "New +" → "Web Service"
- Select GitHub repository
- Configure:
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Environment Variables**:
    - `TELEGRAM_BOT_TOKEN`
    - `VOICEFLOW_API_KEY`
    - `VOICEFLOW_VERSION_ID`

### 3. Deploy
- Click "Create Web Service"
- Wait for build (2-3 minutes, includes Canvas compilation)
- Copy the service URL (e.g., `https://bad-telegram-bot-cz.onrender.com`)

### 4. Set Telegram Webhook
After Render deploys, set the webhook in Telegram:

```bash
curl -X POST \
  "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://bad-telegram-bot-cz.onrender.com"
```

Or in PowerShell:
```powershell
$botToken = "YOUR_BOT_TOKEN"
$webhookUrl = "https://bad-telegram-bot-cz.onrender.com"

Invoke-WebRequest -Method POST `
  "https://api.telegram.org/bot$botToken/setWebhook?url=$webhookUrl"
```

## Usage

1. Send `/start` to the bot in Telegram
2. Upload a file (PDF, image, or Word document)
3. Bot extracts text using OCR/parsing
4. Text is sent to Voiceflow for processing
5. Response appears in Telegram chat

## Architecture

```
Telegram User
    ↓
Telegraf Bot (receives file)
    ↓
File Download & Type Detection
    ↓
Text Extraction Pipeline
  ├─ PDF: pdf-parse + tesseract.js for scanned pages
  ├─ Image: tesseract.js OCR
  └─ Word: mammoth
    ↓
Voiceflow Runtime API
    ↓
Response back to Telegram
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `VOICEFLOW_API_KEY` | ✅ | API key from Voiceflow |
| `VOICEFLOW_VERSION_ID` | ✅ | Version ID of your Voiceflow bot |
| `NODE_ENV` | ❌ | Set to `production` to reduce logging |

## Troubleshooting

### Canvas build fails
- **Solution**: Render handles Canvas compilation automatically. Just ensure `package-lock.json` is committed.

### "File type not supported"
- **Solution**: Check that your file is actually the type it claims. Use real files, not fake extensions.

### Webhook not receiving updates
- **Solution**: Check that webhook is set correctly: `curl -X GET "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`

### OCR timeout
- **Solution**: Large images take longer. Consider adding timeout handling in code.

## License

ISC

## Support

For issues or questions, check the [Voiceflow docs](https://developer.voiceflow.com) and [Telegraf docs](https://telegraf.js.org).
