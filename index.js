// index.js
// Telegram (Telegraf) → OCR / file text extraction → Voiceflow Runtime API
// ✅ Works on Node 18+ (you have Node 24)
// ✅ Robust PDF text extraction + OCR for scanned PDFs (no external poppler needed)
// ✅ Logs extracted text + DEBUG pipeline logs
// ✅ Voiceflow traces: text / speak / message
//
// Install deps:
// npm i telegraf axios dotenv sharp tesseract.js pdf-parse mammoth file-type
// npm i pdfjs-dist @napi-rs/canvas
//
// package.json must include:
// { "type": "module" }
//
// .env:
// TELEGRAM_BOT_TOKEN=...
// VOICEFLOW_API_KEY=...
// VOICEFLOW_VERSION_ID=...

import 'dotenv/config';
import axios from 'axios';
import { Telegraf } from 'telegraf';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth';
import { fileTypeFromBuffer } from 'file-type';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// pdf-parse is CommonJS function (confirmed in your env)
const pdfParse = require('pdf-parse');

// PDF rendering (pure JS) for OCR of scanned PDFs
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VF_API_KEY = process.env.VOICEFLOW_API_KEY;
const VF_VERSION_ID = process.env.VOICEFLOW_VERSION_ID;

const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[DEBUG]', ...args);

if (!TELEGRAM_BOT_TOKEN || !VF_API_KEY || !VF_VERSION_ID) {
    console.error('❌ Missing .env vars: TELEGRAM_BOT_TOKEN, VOICEFLOW_API_KEY, VOICEFLOW_VERSION_ID');
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

const TMP_DIR = path.join(process.cwd(), 'tmp');
const LOG_DIR = path.join(process.cwd(), 'logs');

const MAX_IMG_MB = 15;
const MAX_DOC_MB = 20;
const VF_MAX_TEXT = 6000;

// If pdf-parse returns less text than this → treat as scan and run OCR
const PDF_TEXT_MIN_LEN = 30;

// OCR limits (avoid huge CPU time)
const PDF_OCR_MAX_PAGES = 3; // increase if needed
const PDF_OCR_SCALE = 2.0;   // 2.0–2.5 usually good

async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch { }
}

function truncate(text, maxLen = VF_MAX_TEXT) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '\n…[obežáno]' : text;
}

function safeShort(text, max = 350) {
    const s = (text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

function sanitizeFilename(name) {
    return String(name || 'file')
        .replace(/[^\w.\-]+/g, '_')
        .slice(0, 120);
}

async function logExtracted({ userId, kind, fileName, extracted }) {
    await ensureDir(LOG_DIR);

    const ts = new Date().toISOString();
    const header = `[${ts}] user=${userId} kind=${kind} file=${fileName || '-'} chars=${(extracted || '').length}`;

    console.log(`🧾 ${header} preview="${safeShort(extracted)}"`);

    const logPath = path.join(LOG_DIR, `responses_${ts.slice(0, 10)}.log`);
    const body =
        `${header}\n` +
        `--- BEGIN ---\n` +
        `${extracted || ''}\n` +
        `--- END ---\n\n`;

    await fs.appendFile(logPath, body, 'utf-8');
}

async function downloadTelegramFile(fileUrl, filename) {
    await ensureDir(TMP_DIR);
    const filePath = path.join(TMP_DIR, filename);

    dbg('Downloading:', { fileUrl, filename });

    const res = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 60000 });
    await fs.writeFile(filePath, res.data);

    const stat = await fs.stat(filePath);
    dbg('Downloaded bytes:', { filePath, size: stat.size });

    return filePath;
}

async function extractTextFromImageBuffer(buf) {
    // preprocess for OCR
    const preprocessed = await sharp(buf)
        .resize({ width: 1600, withoutEnlargement: true })
        .toFormat('png')
        .toBuffer();

    const ocr = await Tesseract.recognize(preprocessed, 'rus+eng');
    return (ocr?.data?.text || '').trim();
}

function looksLikePdf(buf) {
    if (!buf || buf.length < 4) return false;
    return buf.slice(0, 4).toString('utf-8') === '%PDF';
}

async function ocrPdfBuffer(pdfBuf, { maxPages = PDF_OCR_MAX_PAGES, scale = PDF_OCR_SCALE } = {}) {
    dbg('PDF OCR: start', { bytes: pdfBuf.length, maxPages, scale });

    const loadingTask = pdfjsLib.getDocument({ data: pdfBuf });
    const pdf = await loadingTask.promise;

    const numPages = pdf.numPages;
    const pagesToDo = Math.min(numPages, maxPages);

    dbg('PDF OCR: pages', { numPages, pagesToDo });

    let out = '';

    for (let p = 1; p <= pagesToDo; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale });

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');

        // render page to canvas
        await page.render({ canvasContext: ctx, viewport }).promise;

        // canvas -> PNG buffer -> OCR
        const pngBuf = canvas.toBuffer('image/png');

        dbg('PDF OCR: page rendered', { page: p, w: canvas.width, h: canvas.height, pngBytes: pngBuf.length });

        const text = await extractTextFromImageBuffer(pngBuf);
        dbg('PDF OCR: page text length', { page: p, len: text.length });

        if (text) {
            out += `\n\n[PAGE ${p}]\n${text}`;
        }
    }

    return out.trim();
}

async function extractTextFromFile(filePath, hintedNameOrMime = '') {
    const buf = await fs.readFile(filePath);

    dbg('First bytes (hex):', buf.slice(0, 8).toString('hex'));
    const ft = await fileTypeFromBuffer(buf);
    dbg('fileTypeFromBuffer:', ft);

    // 1) Image → OCR
    if (ft && ['image/png', 'image/jpeg', 'image/webp'].includes(ft.mime)) {
        dbg('Extractor branch: image OCR');
        return await extractTextFromImageBuffer(buf);
    }

    // 2) PDF → text, and if scan → OCR
    const isPdf =
        (ft && ft.mime === 'application/pdf') ||
        looksLikePdf(buf) ||
        String(hintedNameOrMime).toLowerCase().includes('application/pdf') ||
        filePath.toLowerCase().endsWith('.pdf');

    if (isPdf) {
        dbg('Extractor branch: PDF');

        // First attempt: text layer
        const data = await pdfParse(buf);
        const txt = (data?.text || '').trim();
        dbg('pdf-parse text length:', txt.length);

        if (txt.length >= PDF_TEXT_MIN_LEN) return txt;

        // Fallback: OCR for scanned PDF
        dbg('PDF seems scanned or empty → OCR fallback');
        const ocrText = await ocrPdfBuffer(buf, { maxPages: PDF_OCR_MAX_PAGES, scale: PDF_OCR_SCALE });
        dbg('PDF OCR total length:', ocrText.length);

        return ocrText; // may still be empty; caller will handle
    }

    // 3) DOCX → text
    if (filePath.toLowerCase().endsWith('.docx')) {
        dbg('Extractor branch: DOCX');
        const result = await mammoth.extractRawText({ path: filePath });
        return (result?.value || '').trim();
    }

    // 4) Plain text fallback
    dbg('Extractor branch: plain text fallback');
    try {
        return buf.toString('utf-8').trim();
    } catch {
        return '';
    }
}

function collectVoiceflowMessages(traces) {
    const messages = [];
    if (!Array.isArray(traces)) return messages;

    for (const t of traces) {
        if (t?.type === 'text' && t?.payload?.message) messages.push(t.payload.message);
        else if (t?.type === 'speak' && t?.payload?.message) messages.push(t.payload.message);
        else if (t?.type === 'message' && t?.payload?.message) messages.push(t.payload.message);
    }
    return messages;
}

async function voiceflowInteract(userId, text) {
    const url = `https://general-runtime.voiceflow.com/state/${VF_VERSION_ID}/user/${userId}/interact`;

    dbg('Sending to Voiceflow chars:', text?.length || 0);
    dbg('Sending preview:', safeShort(text, 500));

    const res = await axios.post(
        url,
        { request: { type: 'text', payload: text } },
        {
            headers: {
                Authorization: VF_API_KEY,
                'Content-Type': 'application/json',
            },
            timeout: 200000,
        }
    );

    const traces = res.data;

    if (Array.isArray(traces)) dbg('Voiceflow traces types:', traces.map((t) => t?.type));
    else dbg('Voiceflow raw response (non-array):', traces);

    const messages = collectVoiceflowMessages(traces);

    if (!messages.length && DEBUG) dbg('Voiceflow raw traces:', JSON.stringify(traces, null, 2));

    return messages.length
        ? messages.join('\n')
        : 'Я получил данные, но ИИ не вернул текстовый ответ. Проверьте, есть ли в сценарии текстовые ответы.';
}

async function sendToVoiceflowAsUserTurn(userId, extractedText) {
    return await voiceflowInteract(userId, extractedText);
}

/* -------------------- Telegram handlers -------------------- */

bot.start(async (ctx) => {
    await ctx.reply(
        'Я автоматический помощник, анализирующий ваше состояние здоровья. Вы можете ответить текстом или отправить PDF/DOCX либо скриншот.'
    );
});

// Text messages: log + send to Voiceflow
bot.on('text', async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text;

    try {
        await logExtracted({ userId, kind: 'text', fileName: '-', extracted: text });
        await ctx.sendChatAction('typing');
        const reply = await voiceflowInteract(userId, text);
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply('Connection error. Check API key / Version ID.');
    }
});

// Photos / screenshots: OCR + log + send extracted text to Voiceflow
bot.on('photo', async (ctx) => {
    const userId = String(ctx.from.id);
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];

    if (best.file_size && best.file_size > MAX_IMG_MB * 1024 * 1024) {
        return ctx.reply(`Файл слишком большой. Пожалуйста, отправьте изображение в ${MAX_IMG_MB} MB.`);
    }

    await ctx.reply('Изображение получено. Извлекаю текст…');

    try {
        const link = await ctx.telegram.getFileLink(best.file_id);
        dbg('PHOTO file link:', link.href);

        const fileName = `photo_${best.file_id}.jpg`;
        const filePath = await downloadTelegramFile(link.href, fileName);

        const extracted = await extractTextFromFile(filePath, 'image');

        await logExtracted({ userId, kind: 'photo', fileName, extracted });

        if (!extracted || !extracted.trim()) {
            return ctx.reply(
                'Не удалось извлечь текст из изображения 😕\n' +
                'Пожалуйста, попробуйте отправить более чёткий скриншот или пришлите PDF/DOCX, либо ответьте текстом'
            );
        }

        await ctx.sendChatAction('typing');
        const reply = await sendToVoiceflowAsUserTurn(userId, truncate(extracted));
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply(
            'Не удалось обработать изображение. Пожалуйста, отправьте более чёткий скриншот или пришлите PDF/DOCX.'
        );
    }
});

// Documents: extract + log + send extracted text to Voiceflow (PDF includes OCR fallback)
bot.on('document', async (ctx) => {
    const userId = String(ctx.from.id);
    const doc = ctx.message.document;

    dbg('DOC meta:', {
        file_id: doc.file_id,
        file_name: doc.file_name,
        mime_type: doc.mime_type,
        file_size: doc.file_size,
    });

    if (doc.file_size && doc.file_size > MAX_DOC_MB * 1024 * 1024) {
        return ctx.reply(`Файл слишком большой. Пожалуйста, отправьте документ в ${MAX_DOC_MB} MB.`);
    }

    await ctx.reply('Файл был принят. Получаю текст…');

    try {
        const link = await ctx.telegram.getFileLink(doc.file_id);
        dbg('DOC file link:', link.href);

        const safeName = sanitizeFilename(doc.file_name || `doc_${doc.file_id}`);
        const savedName = `${doc.file_id}_${safeName}`;
        const filePath = await downloadTelegramFile(link.href, savedName);

        const extracted = await extractTextFromFile(filePath, doc.mime_type || doc.file_name || '');

        await logExtracted({ userId, kind: 'document', fileName: doc.file_name || savedName, extracted });

        if (!extracted || !extracted.trim()) {
            return ctx.reply(
                'Не удалось получить текст из файла 😕\n' +
                'Лучше всего работают PDF (текстовые) или DOCX. Если это скан, отправьте фото или снимки экрана страниц.'
            );
        }

        await ctx.sendChatAction('typing');
        const reply = await sendToVoiceflowAsUserTurn(userId, truncate(extracted));
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply(
            'Файл не удалось обработать. Лучше всего работают PDF (текстовые) или DOCX. Для сканов используйте фотографии или снимки экрана.'
        );
    }
});

/* -------------------- start -------------------- */

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || 'https://bad-telegram-bot-cz.onrender.com';

// Use webhook mode for production (Render)
if (process.env.NODE_ENV === 'production') {
    console.log(`🤖 Bot is running in WEBHOOK mode on port ${PORT}...`);
    console.log(`📊 Webhook URL: ${WEBHOOK_URL}`);
    console.log('📊 PDF text + PDF OCR + OCR images + logging');

    // Use http module for explicit webhook handling
    import('http').then(({ createServer }) => {
        const server = createServer(async (req, res) => {
            // Only handle POST requests
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const update = JSON.parse(body);
                        await bot.handleUpdate(update);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                    } catch (err) {
                        console.error('Webhook error:', err.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: err.message }));
                    }
                });
            } else {
                // Return 403 for non-POST (expected behavior)
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
            }
        });

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ HTTP webhook server listening on port ${PORT}`);

            // Set webhook with Telegram
            bot.telegram.setWebhook(`${WEBHOOK_URL}`).then(() => {
                console.log(`✅ Telegram webhook set to: ${WEBHOOK_URL}`);
            }).catch(err => {
                console.error('❌ Failed to set webhook:', err.message);
            });
        });

        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('Shutting down...');
            bot.stop('SIGINT');
            server.close();
        });
        process.once('SIGTERM', () => {
            console.log('Shutting down...');
            bot.stop('SIGTERM');
            server.close();
        });
    });
} else {
    // Development: polling mode
    console.log('🤖 Bot is running in POLLING mode (PDF text + PDF OCR + OCR images + logging + DEBUG)...');

    bot.launch();

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

