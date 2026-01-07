#!/usr/bin/env node
/**
 * Quick setup script for Telegram webhook
 * Usage: node setup-webhook.js <BOT_TOKEN> <WEBHOOK_URL>
 * Example: node setup-webhook.js 123456:ABC-DEF https://bad-telegram-bot-cz.onrender.com
 */

import axios from 'axios';

const [botToken, webhookUrl] = process.argv.slice(2);

if (!botToken || !webhookUrl) {
    console.error('❌ Usage: node setup-webhook.js <BOT_TOKEN> <WEBHOOK_URL>');
    console.error('Example: node setup-webhook.js 123456:ABC-DEF https://bad-telegram-bot-cz.onrender.com');
    process.exit(1);
}

async function setWebhook() {
    try {
        console.log('🔧 Setting Telegram webhook...');
        console.log(`   Token: ${botToken.slice(0, 10)}...`);
        console.log(`   URL: ${webhookUrl}`);

        const res = await axios.post(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            { url: webhookUrl }
        );

        if (res.data.ok) {
            console.log('✅ Webhook set successfully!');
            console.log(`   URL: ${webhookUrl}`);
            console.log('\n📊 Webhook Info:');
            console.log(JSON.stringify(res.data.result, null, 2));
        } else {
            console.error('❌ Telegram API error:', res.data.description);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Error setting webhook:', err.message);
        process.exit(1);
    }
}

setWebhook();
