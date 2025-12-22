require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/* ===== SESSION ===== */
const sessions = new Map();
function resetSession(userId) {
  sessions.set(userId, { mode: null, step: null, payload: {} , focusSet: new Set()});
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
  await ctx.reply('Следуй шагам. Можно в любой момент начать заново.');
});

/* ===== MODE: SINGLE ===== */
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;
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

  const text = ctx.message.text.trim();
  const single = /^\d{1,2}$/;
  const range = /^\d{1,2}\s*-\s*\d{1,2}$/;

  if (!single.test(text) && !range.test(text)) {
    await ctx.reply('❌ Формат: 10 или 10-11');
    return;
  }

  let from, to;
  if (single.test(text)) {
    from = to = parseInt(text, 10);
  } else {
    [from, to] = text.split('-').map(v => parseInt(v.trim(), 10));
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

  const text = ctx.message.text.trim();
  const single = /^\d{1,2}$/;
  const range = /^\d{1,2}\s*-\s*\d{1,2}$/;

  if (!single.test(text) && !range.test(text)) {
    await ctx.reply('❌ Формат: 8 или 8-7');
    return;
  }

  let from, to;
  if (single.test(text)) {
    from = to = parseInt(text, 10);
  } else {
    [from, to] = text.split('-').map(v => parseInt(v.trim(), 10));
  }

  if (from < 1) from = 1;
  if (to < 1) to = 1;
  if (from > 11) from = 11;
  if (to > 11) to = 11;

  s.payload.kyu_from = from;
  s.payload.kyu_to = to;
  s.step = 'goal';

  await ctx.reply('Выбери цель тренировки:', goalMenu());
});

/* ===== GOAL ===== */
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'goal') return next();

  const text = ctx.message.text;
  let goal = null;
  if (text === 'Обычная тренировка') goal = 'normal';
  if (text === 'Подготовка к турниру') goal = 'tournament';
  if (text === 'Подготовка к экзамену') goal = 'exam';

  if (!goal) {
    await ctx.reply('❌ Выбери цель кнопкой.');
    return;
  }

  s.payload.goal = goal;
  s.step = 'focus';

  await ctx.reply(
    'Выбери фокус (можно несколько). Нажимай кнопки, затем «Готово».',
    focusMenu()
  );
});

/* ===== FOCUS (MULTI) ===== */
bot.on('text', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s.mode !== 'single' || s.step !== 'focus') return;

  const text = ctx.message.text;

  const map = {
    '🥊 Кумите': 'kumite',
    '🏋️ Физика': 'physics',
    '🎯 Техника': 'technique',
    '🧘 Ката': 'kata'
  };

  if (map[text]) {
    s.focusSet.add(map[text]);
    await ctx.reply(`Добавлено: ${map[text]}`);
    return;
  }

  if (text === '✅ Готово') {
    if (s.focusSet.size === 0) {
      await ctx.reply('❌ Выбери хотя бы один фокус.');
      return;
    }
    s.payload.focus = Array.from(s.focusSet);
    s.step = 'done_focus';

    await ctx.reply(
      `✅ Принято:\n` +
      `Возраст: ${s.payload.age_from}-${s.payload.age_to}\n` +
      `Кю: ${s.payload.kyu_from}-${s.payload.kyu_to}\n` +
      `Цель: ${s.payload.goal}\n` +
      `Фокус: ${s.payload.focus.join(', ')}\n\n` +
      `Дальше добавим длительность.`
    );
    return;
  }

  if (text === '🔁 Начать заново') {
    resetSession(ctx.from.id);
    await ctx.reply('Начинаем заново. Выбери режим:', mainMenu());
    return;
  }

  await ctx.reply('Выбирай фокус кнопками или нажми «Готово».');
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started'))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
