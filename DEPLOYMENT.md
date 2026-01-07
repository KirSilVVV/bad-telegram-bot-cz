# Deployment Checklist for bad-telegram-bot-cz

## ✅ Pre-deployment (Local)

- [x] `.env.example` created with placeholders
- [x] `.gitignore` configured (excludes `.env`, `node_modules`, etc.)
- [x] `package.json` updated with correct name & metadata
- [x] `render.yaml` configured with Node.js runtime
- [x] `README.md` with setup & deployment instructions
- [x] `.github/copilot-instructions.md` for AI agents
- [x] `setup-webhook.js` utility script
- [x] Git repository initialized with clean commit history
- [x] All source code committed

## 🚀 Deploy to Render (First Time)

1. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/bad-telegram-bot-cz.git
   git branch -M main
   git push -u origin main
   ```

2. **Create Render Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Select your GitHub repository
   - Render will auto-detect `render.yaml` and auto-configure build/start commands

3. **Add Environment Variables in Render Dashboard**
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `VOICEFLOW_API_KEY` = your API key
   - `VOICEFLOW_VERSION_ID` = your version ID
   - Click "Create Web Service"

4. **Wait for Build** (2-3 minutes)
   - Render will install deps (including Canvas compilation)
   - Check the Build & Deployment Logs for any errors
   - Service URL will be shown once deployed (e.g., `https://bad-telegram-bot-cz.onrender.com`)

5. **Set Telegram Webhook**
   ```bash
   node setup-webhook.js YOUR_BOT_TOKEN https://bad-telegram-bot-cz.onrender.com
   ```
   Or manually in PowerShell:
   ```powershell
   $token = "YOUR_BOT_TOKEN"
   $url = "https://bad-telegram-bot-cz.onrender.com"
   Invoke-WebRequest -Method POST "https://api.telegram.org/bot$token/setWebhook?url=$url"
   ```

6. **Test**
   - Send `/start` to your Telegram bot
   - Upload a PDF/image/document
   - Verify it extracts text and responds

## 🔄 Update After Changes

```bash
git add .
git commit -m "your commit message"
git push
```
Render will automatically rebuild and deploy.

## 📊 Monitoring

- **Logs**: https://dashboard.render.com → Your Service → Logs
- **Webhook Info**: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- **Bot Status**: Send `/start` to the bot

## 🛑 Troubleshooting

### Canvas build fails
- Solution: It's normal for first deploy. Render handles it.

### Webhook not receiving messages
- Check: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`
- Redeploy: `node setup-webhook.js <TOKEN> <URL>`

### Bot responds slowly
- OCR takes time for large images
- PDFs with many pages take longer
- This is expected behavior

## 💾 Environment Variables

Keep these safe (use Render's secret vars):
- `TELEGRAM_BOT_TOKEN`
- `VOICEFLOW_API_KEY`
- `VOICEFLOW_VERSION_ID`

Never commit `.env` file! Use `.env.example` as template.
