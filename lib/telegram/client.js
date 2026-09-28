// Telegram Bot API over plain HTTPS. Token and chat id only come from environment variables.
import { createHmac } from 'node:crypto';

export const configured = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const chatId = () => process.env.TELEGRAM_CHAT_ID || null;

// Secret Telegram sends back on every webhook call; derived so no extra variable is needed.
export function webhookSecret() {
  const base = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.SESSION_SECRET || '';
  return createHmac('sha256', base).update('telegram-webhook').digest('hex').slice(0, 48);
}

export async function call(method, body, fetchImpl = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN manquant');
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method} : ${j.description || res.status}`);
  return j.result;
}

export const sendMessage = (text, chat = chatId(), fetchImpl) =>
  call('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, fetchImpl);

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
