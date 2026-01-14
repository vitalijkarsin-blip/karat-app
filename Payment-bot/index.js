require('dotenv').config();
const { Telegraf } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAS_API_URL = process.env.GAS_API_URL;

const POLL_QUEUE_EVERY_MS = Number(process.env.POLL_QUEUE_EVERY_MS || 20000);
const QUEUE_BATCH = Number(process.env.QUEUE_BATCH || 20);

if (!BOT_TOKEN || !GAS_API_URL) {
  console.error('ENV missing: BOT_TOKEN or GAS_API_URL');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ================= SESSION ================= */
const sessions = new Map();
function resetSession(chatId) {
  sessions.set(String(chatId), { step: null });
}
function getSession(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) resetSession(key);
  return sessions.get(key);
}

/* ================= GAS HELPER ================= */
async function gasGet(params) {
  const r = await axios.get(GAS_API_URL, { params, timeout: 30000 });
  return r.data;
}

/* ================= BOT LOGIC ================= */
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  const s = getSession(chatId);
  s.step = 'WAIT_CHILD_NAME';
  await ctx.reply('Напиши *Фамилию Имя ребёнка* (полное например Карсин Александр).', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = String(ctx.message.text || '').trim();

  const s = getSession(chatId);

  if (text === '/start') return; // обработает bot.start

  if (s.step === 'WAIT_CHILD_NAME') {
    try {
      const res = await gasGet({
        action: 'bind_parent',
        fio: text,
        chat_id: String(chatId)
      });

      if (res && res.status === 'ok') {
  s.step = null;

  const fio = res.child_fio || s.lastFio || '—';

  await ctx.reply(
    `✅ Готово! Уведомления подключены.\n` +
    `Ребёнок: ${fio}\n\n` +
    `Чтобы привязать другого ребёнка — отправьте /start ещё раз.`
  );

  return;
}


      if (res && res.status === 'not_found') {
        await ctx.reply('Не нашёл ребёнка в базе. Проверь написание и попробуй ещё раз. Или /start заново.');
        return;
      }

      await ctx.reply('Что-то пошло не так. Попробуй ещё раз или /start заново.');
      return;
    } catch (e) {
      console.error('bind_parent error:', e?.response?.data || e.message);
      await ctx.reply('Ошибка связи с сервером. Попробуй ещё раз через минуту.');
      return;
    }
  }

  await ctx.reply('Напиши /start чтобы привязать ребёнка.');
});

/* ================= QUEUE POLLING ================= */
async function pollQueueAndSend() {
  try {
    const data = await gasGet({ action: 'pull_queue', limit: String(QUEUE_BATCH) });

    if (!data || data.status !== 'ok' || !Array.isArray(data.items) || data.items.length === 0) return;

    const sentIds = [];

    for (const it of data.items) {
      const chatId = it.chat_id;
      const text = it.text;

      if (!chatId || !text) continue;

      try {
        await bot.telegram.sendMessage(chatId, text);
        sentIds.push(it.id);
      } catch (e) {
        console.error('sendMessage fail:', chatId, e?.response?.data || e.message);
        // не подтверждаем, чтобы GAS мог вернуть в NEW позже
      }
    }

    if (sentIds.length) {
      await gasGet({ action: 'ack_queue', ids: sentIds.join(',') });
    }
  } catch (e) {
    console.error('pollQueue error:', e?.response?.data || e.message);
  }
}

setInterval(pollQueueAndSend, POLL_QUEUE_EVERY_MS);

/* ================= LAUNCH ================= */
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Payment bot started (long polling)'))
  .catch((e) => {
    console.error('bot.launch error:', e);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));


bot.command('ping', (ctx) => ctx.reply('pong ✅'));
