require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAS_API_URL = process.env.GAS_API_URL;

if (!BOT_TOKEN || !GAS_API_URL) {
  console.error('ENV missing: BOT_TOKEN or GAS_API_URL');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ===== SESSION ===== */
const sessions = new Map();
function resetSession(userId) {
  sessions.set(userId, { mode: null, step: null, payload: {}, focusSet: new Set() });
}
function getSession(userId) {
  if (!sessions.has(userId)) resetSession(userId);
  return sessions.get(userId);
}

/* ===== UI ===== */
function mainMenu() {
  return Markup.keyboard([
    ['🟦 Одна тренировка', '🟩 Цикл'],
    ['ℹ️ Помощь', '🔁 Начать заново']
  ]).resize();
}
function goalMenu() {
  return Markup.keyboard([
    ['Обычная тренировка'],
    ['Подготовка к турниру'],
    ['Подготовка к экзамену'],
    ['🔁 Начать заново']
  ]).resize();
}
function focusMenu() {
  return Markup.keyboard([
    ['🥊 Кумите', '🏋️ Физика'],
    ['🎯 Техника', '🧘 Ката'],
    ['✅ Готово', '🔁 Начать заново']
  ]).resize();
}

/* ===== HELPERS ===== */
function buildQueryParams(obj) {
  // как в сайте: выкидываем null/undefined/''
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    // массивы оставляем массивами (focus)
    out[k] = v;
  }
  return out;
}

async function callGAS(payload) {
  const params = buildQueryParams(payload);
  const res = await axios.get(GAS_API_URL, { params, timeout: 45000 });
  return res.data;
}

function formatShortBlocks(shortBlocks) {
  if (!shortBlocks) return '';
  return String(shortBlocks)
    .split('→')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `• ${p}`)
    .join('\n');
}

/* ===== START ===== */
bot.start(async (ctx) => {
  resetSession(ctx.from.id);
  await ctx.reply('🥋 AI_Methodist\nВыбери режим:', mainMenu());
});

bot.hears('🔁 Начать заново', async (ctx) => {
  resetSession(ctx.from.id);
  await ctx.reply('Начинаем заново. Выбери режим:', mainMenu());
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply('Следуй шагам. Можно начать заново.');
});

/* ===== MODE: SINGLE ===== */
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text || '';
  if (!text.includes('Одна тренировка')) return next();

  const s = getSession(ctx.from.id);
  s.mode = 'single';
  s.step = 'age';
  s.payload = {};
  s.focusSet = new Set();

  await ctx.reply('Укажи возраст:\n• 10\n• или 10-11');
});

/* ===== AGE ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'age') return next();

  const t = (ctx.message.text || '').trim();
  const single = /^\d{1,2}$/;
  const range = /^\d{1,2}\s*-\s*\d{1,2}$/;

  if (!single.test(t) && !range.test(t)) {
    await ctx.reply('❌ Формат: 10 или 10-11');
    return;
  }

  let from, to;
  if (single.test(t)) {
    from = to = parseInt(t, 10);
  } else {
    [from, to] = t.split('-').map(v => parseInt(v.trim(), 10));
  }

  if (from < 3) from = 3;
  if (to < 3) to = 3;

  s.payload.age_from = from;
  s.payload.age_to = to;
  s.step = 'kyu';

  await ctx.reply('Укажи кю:\n• 8\n• или 8-7');
});

/* ===== KYU ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'kyu') return next();

  const t = (ctx.message.text || '').trim();
  const single = /^\d{1,2}$/;
  const range = /^\d{1,2}\s*-\s*\d{1,2}$/;

  if (!single.test(t) && !range.test(t)) {
    await ctx.reply('❌ Формат: 8 или 8-7');
    return;
  }

  let from, to;
  if (single.test(t)) {
    from = to = parseInt(t, 10);
  } else {
    [from, to] = t.split('-').map(v => parseInt(v.trim(), 10));
  }

  from = Math.min(11, Math.max(1, from));
  to   = Math.min(11, Math.max(1, to));

  s.payload.kyu_from = from;
  s.payload.kyu_to = to;
  s.step = 'goal';

  await ctx.reply('Выбери цель тренировки:', goalMenu());
});

/* ===== GOAL ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'goal') return next();

  const t = ctx.message.text;
  const map = {
    'Обычная тренировка': 'normal',
    'Подготовка к турниру': 'tournament',
    'Подготовка к экзамену': 'exam'
  };
  if (!map[t]) {
    await ctx.reply('❌ Выбери цель кнопкой.');
    return;
  }

  s.payload.goal = map[t];
  s.step = 'focus';

  await ctx.reply('Выбери фокус (можно несколько), затем «Готово».', focusMenu());
});

/* ===== FOCUS (MULTI) ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'focus') return next();

  const t = ctx.message.text;

  const map = {
    '🥊 Кумите': 'kumite',
    '🏋️ Физика': 'physics',
    '🎯 Техника': 'technique',
    '🧘 Ката': 'kata'
  };

  if (map[t]) {
    s.focusSet.add(map[t]);
    await ctx.reply(`Добавлено: ${map[t]}`);
    return;
  }

  if (t === '✅ Готово') {
    if (s.focusSet.size === 0) {
      await ctx.reply('❌ Выбери хотя бы один фокус.');
      return;
    }

    s.payload.focus = Array.from(s.focusSet);
    s.payload.mode = 'single';

    const isYoung = s.payload.age_to <= 6;

    // <=6: сразу вызываем GAS (не ждём ввода длительности)
    if (isYoung) {
      // duration_minutes не передаём вообще (как на сайте: null -> параметр отсутствует)
      s.payload.duration_minutes = null;

      await ctx.reply('Возраст ≤ 6. Формирую тренировку (30–40 минут)…');

      try {
        const data = await callGAS(s.payload);
        if (data?.status !== 'ok') {
          await ctx.reply(`❌ Ошибка API: ${data?.message || 'unknown'}`);
          return;
        }
        const title = data.training?.title || 'Тренировка';
        const shortText = formatShortBlocks(data.training?.short_blocks);
        await ctx.reply(`🏷 ${title}`);
        await ctx.reply(shortText || 'Тренировка сформирована.');
        s.step = 'done';
      } catch (e) {
        await ctx.reply(`❌ Не удалось получить тренировку: ${e?.message || 'unknown'}`);
      }
      return;
    }

    // >6: спрашиваем длительность
    s.step = 'duration';
    await ctx.reply('Укажи длительность в минутах (например: 95)');
    return;
  }

  await ctx.reply('Выбирай фокус кнопками или нажми «Готово».');
});

/* ===== DURATION (>6) + CALL GAS ===== */
bot.on('text', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'duration') return;

  const t = (ctx.message.text || '').trim();
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 30 || n > 180) {
    await ctx.reply('❌ Введи число минут (30–180).');
    return;
  }

  s.payload.duration_minutes = n;
  s.payload.mode = 'single';

  await ctx.reply('Формирую тренировку…');

  try {
    const data = await callGAS(s.payload);
    if (data?.status !== 'ok') {
      await ctx.reply(`❌ Ошибка API: ${data?.message || 'unknown'}`);
      return;
    }

    const title = data.training?.title || 'Тренировка';
    const shortText = formatShortBlocks(data.training?.short_blocks);

    await ctx.reply(`🏷 ${title}`);
    await ctx.reply(shortText || 'Тренировка сформирована.');
    s.step = 'done';
  } catch (e) {
    await ctx.reply(`❌ Не удалось получить тренировку: ${e?.message || 'unknown'}`);
  }
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started'))
  .catch(err => { console.error(err); process.exit(1); });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
