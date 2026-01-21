require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
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

/* ================= UI MENU ================= */
const BTN_BIND = '✅ Привязать ребёнка';
const BTN_BIND_MORE = '➕ Привязать ещё одного';
const BTN_UNBIND = '❌ Отвязать ребёнка';

const mainMenu = () =>
  Markup.keyboard([
    [BTN_BIND],
    [BTN_BIND_MORE, BTN_UNBIND]
  ]).resize();

/* ================= SESSION ================= */
const sessions = new Map();

function resetSession(chatId) {
  sessions.set(String(chatId), { step: null, pendingFio: null });
}

function getSession(chatId) {
  const key = String(chatId);
  if (!sessions.has(key)) resetSession(key);
  return sessions.get(key);
}

/* ================= GAS HELPER ================= */
async function gasGet(params) {
  const r = await axios.get(GAS_API_URL, { params, timeout: 90000 });
  return r.data;
}

/* ================= HELPERS ================= */
async function askChildName(ctx) {
  const chatId = ctx.chat.id;
  const s = getSession(chatId);
  s.step = 'WAIT_CHILD_NAME';
  s.pendingFio = null;

  await ctx.reply(
    'Напишите Фамилию Имя ребёнка.\n(полное, например: Карсин Александр)',
    mainMenu()
  );
}

/* ================= BOT LOGIC ================= */
bot.start(async (ctx) => {
  resetSession(ctx.chat.id);
  await ctx.reply('Выберите действие 👇', mainMenu());
});

bot.command('menu', async (ctx) => {
  await ctx.reply('Меню 👇', mainMenu());
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = String(ctx.message.text || '').trim();
  const s = getSession(chatId);

  if (text === '/start') return; // обработает bot.start

  /* ===== кнопки меню ===== */
  if (text === BTN_BIND || text === BTN_BIND_MORE) {
    await askChildName(ctx);
    return;
  }

  if (text === BTN_UNBIND) {
    await ctx.reply('❌ Отвязка пока в разработке.\nЕсли нужно — напишите тренеру.', mainMenu());
    return;
  }

  /* ===== Шаг 2: ждём PIN для перепривязки ===== */
  if (s.step === 'WAIT_PIN') {
    const pin = text;

    if (!/^\d{4,6}$/.test(pin)) {
      await ctx.reply('PIN должен быть 4–6 цифр. Попробуйте ещё раз.', mainMenu());
      return;
    }

    if (!s.pendingFio) {
      s.step = null;
      await ctx.reply('Не вижу, какого ребёнка перепривязывать. Нажмите "Привязать ребёнка".', mainMenu());
      return;
    }

    try {
      const res2 = await gasGet({
        action: 'rebind_parent',
        fio: s.pendingFio,
        chat_id: String(chatId),
        pin
      });

      if (res2 && res2.status === 'bad_pin') {
        await ctx.reply('❌ Неверный PIN. Попробуйте ещё раз или нажмите "Привязать ребёнка".', mainMenu());
        return;
      }

      if (res2 && res2.status === 'not_found') {
        s.step = null;
        s.pendingFio = null;
        await ctx.reply('Не нашёл ребёнка в базе. Проверьте написание и попробуйте снова.\nНажмите "Привязать ребёнка".', mainMenu());
        return;
      }

      if (res2 && res2.status === 'ok') {
        s.step = null;
        const fio = res2.child_fio || s.pendingFio || '—';
        s.pendingFio = null;

        await ctx.reply(
          `✅ Готово! Привязка обновлена.\n` +
          `Ребёнок: ${fio}`,
          mainMenu()
        );
        return;
      }

      s.step = null;
      s.pendingFio = null;
      await ctx.reply('Не получилось перепривязать. Нажмите "Привязать ребёнка" и попробуйте заново.', mainMenu());
      return;

    } catch (e) {
      console.error('rebind_parent error:', e?.response?.data || e.message);
      await ctx.reply('Ошибка связи с сервером. Попробуйте ещё раз через минуту.', mainMenu());
      return;
    }
  }

  /* ===== Шаг 1: ждём ФИО ребёнка ===== */
  if (s.step === 'WAIT_CHILD_NAME') {
    try {
      const res = await gasGet({
        action: 'bind_parent',
        fio: text,
        chat_id: String(chatId)
      });

      if (res && res.status === 'ok') {
        s.step = null;
        s.pendingFio = null;

        const fio = res.child_fio || text || '—';

        await ctx.reply(
          `✅ Готово! Уведомления подключены.\n` +
          `Ребёнок: ${fio}`,
          mainMenu()
        );
        return;
      }

      if (res && res.status === 'already_bound') {
        // Требуем PIN тренера для перепривязки
        s.step = 'WAIT_PIN';
        s.pendingFio = res.child_fio || text;

        await ctx.reply(
          `⚠️ Этот ребёнок уже привязан к другому номеру.\n\n` +
          `Если нужно перепривязать — запросите PIN КОД у тренера и введите его.`,
          mainMenu()
        );
        return;
      }

      if (res && res.status === 'not_found') {
        await ctx.reply(
          'Не нашёл ребёнка в базе. Проверьте написание и попробуйте ещё раз.\n' +
          'Если не получается — напишите тренеру.',
          mainMenu()
        );
        return;
      }

      await ctx.reply('Что-то пошло не так. Нажмите "Привязать ребёнка" и попробуйте ещё раз.', mainMenu());
      return;

    } catch (e) {
      console.error('bind_parent error:', e?.response?.data || e.message);
      await ctx.reply('Ошибка связи с сервером. Попробуйте ещё раз через минуту.', mainMenu());
      return;
    }
  }

  /* ===== если человек пишет что-то не по сценарию ===== */
  await ctx.reply('Выберите действие 👇', mainMenu());
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
