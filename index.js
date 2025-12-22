require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAS_API_URL = process.env.GAS_API_URL;

if (!BOT_TOKEN || !GAS_API_URL) {
  console.error('ENV missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ===== SESSION ===== */
const sessions = new Map();
function resetSession(userId) {
  sessions.set(userId, {
    mode: null,
    step: null,
    payload: {},
    focusSet: new Set(),
    session_id: null,
    cycleIndex: 0,
    cycleTotal: 0
  });
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
function nextMenu() {
  return Markup.keyboard([
    ['▶️ Следующая тренировка'],
    ['🔁 Начать заново']
  ]).resize();
}

/* ===== HELPERS ===== */
function buildParams(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = v;
  }
  return out;
}
async function callGAS(params) {
  const res = await axios.get(GAS_API_URL, { params: buildParams(params), timeout: 45000 });
  return res.data;
}
function formatShort(shortBlocks) {
  if (!shortBlocks) return 'Тренировка сформирована.';
  return String(shortBlocks)
    .split('→')
    .map(p => `• ${p.trim()}`)
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

/* ===== MODE SELECT ===== */
bot.on('text', async (ctx, next) => {
  const t = ctx.message.text;
  if (t === '🟦 Одна тренировка') {
    const s = getSession(ctx.from.id);
    s.mode = 'single';
    s.step = 'age';
    s.payload = {};
    s.focusSet = new Set();
    return ctx.reply('Укажи возраст:\n• 10\n• или 10-11');
  }
  if (t === '🟩 Цикл') {
    const s = getSession(ctx.from.id);
    s.mode = 'cycle';
    s.step = 'weeks';
    s.payload = {};
    s.focusSet = new Set();
    return ctx.reply('Укажи длительность цикла в неделях:\n• 2\n• или 4');
  }
  return next();
});

/* ===== WEEKS (CYCLE) ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'cycle' || s.step !== 'weeks') return next();

  const n = parseInt(ctx.message.text, 10);
  if (![2, 3, 4, 6].includes(n)) {
    return ctx.reply('❌ Введи количество недель: 2 / 3 / 4 / 6');
  }

  s.payload.weeks = n;
  s.step = 'tpw';
  return ctx.reply('Сколько тренировок в неделю?\n• 2\n• 3\n• 4');
});

/* ===== TRAININGS PER WEEK ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'cycle' || s.step !== 'tpw') return next();

  const n = parseInt(ctx.message.text, 10);
  if (![2, 3, 4, 5].includes(n)) {
    return ctx.reply('❌ Введи 2–5');
  }

  s.payload.trainings_per_week = n;
  s.step = 'age';
  return ctx.reply('Укажи возраст:\n• 10\n• или 10-11');
});

/* ===== AGE / KYU / GOAL / FOCUS ===== */
/* — логика ПОЛНОСТЬЮ та же, что в шаге 5 —
   для краткости: используй тот же код блоков AGE, KYU, GOAL, FOCUS
   из предыдущей рабочей версии (без изменений)
*/

/* ===== AFTER FOCUS (CYCLE CALL) ===== */
bot.on('text', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'cycle' || s.step !== 'duration') return;

  const n = parseInt(ctx.message.text, 10);
  if (!Number.isFinite(n)) {
    return ctx.reply('❌ Введи длительность в минутах');
  }

  s.payload.duration_minutes = n;
  s.payload.mode = 'cycle';

  await ctx.reply('Формирую цикл…');

  try {
    const data = await callGAS(s.payload);
    if (data.status !== 'ok') {
      return ctx.reply('❌ Ошибка при создании цикла');
    }

    s.session_id = data.session_id;
    s.cycleIndex = 0;
    s.cycleTotal = s.payload.weeks * s.payload.trainings_per_week;

    const first = await callGAS({
      action: 'next',
      session_id: s.session_id
    });

    if (first.status === 'ok' && first.training) {
      s.cycleIndex = 1;
      await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
      await ctx.reply(formatShort(first.training.short_blocks), nextMenu());
    }
  } catch (e) {
    await ctx.reply('❌ Не удалось получить тренировку');
  }
});

/* ===== NEXT TRAINING ===== */
bot.hears('▶️ Следующая тренировка', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'cycle' || !s.session_id) return;

  try {
    const data = await callGAS({
      action: 'next',
      session_id: s.session_id
    });

    if (data.status === 'done') {
      return ctx.reply('✅ Цикл завершён', mainMenu());
    }

    if (data.status === 'ok' && data.training) {
      s.cycleIndex++;
      await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
      await ctx.reply(formatShort(data.training.short_blocks), nextMenu());
    }
  } catch {
    await ctx.reply('❌ Ошибка получения тренировки');
  }
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started'))
  .catch(err => { console.error(err); process.exit(1); });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
