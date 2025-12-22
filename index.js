require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is missing');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ====== SESSION (MVP) ======
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      mode: null,
      step: null,
      payload: {}
    });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, {
    mode: null,
    step: null,
    payload: {}
  });
}

// ====== UI ======
function mainMenu() {
  return Markup.keyboard([
    ['🟦 Одна тренировка', '🟩 Цикл'],
    ['ℹ️ Помощь', '🔁 Начать заново']
  ]).resize();
}

// ====== START ======
bot.start(async (ctx) => {
  resetSession(ctx.from.id);
  await ctx.reply(
    '🥋 AI_Methodist\nВыбери режим:',
    mainMenu()
  );
});

bot.hears('🔁 Начать заново', async (ctx) => {
  resetSession(ctx.from.id);
  await ctx.reply('Начинаем заново. Выбери режим:', mainMenu());
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply(
    'Помощь:\n' +
    '🟦 Одна тренировка — сформировать одну тренировку\n' +
    '🟩 Цикл — серия тренировок\n\n' +
    'Можно в любой момент нажать «Начать заново».'
  );
});

// ====== ONE TRAINING: STEP 1 (AGE) ======
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (!text.includes('Одна тренировка')) return;

  const session = getSession(ctx.from.id);

  session.mode = 'single';
  session.step = 'age';
  session.payload = {};

  await ctx.reply(
    'Укажи возраст:\n' +
    '• одно число (например: 10)\n' +
    '• или диапазон (например: 10-11)'
  );
});


// ====== AGE INPUT ======
bot.on('text', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (session.mode !== 'single') return;
  if (session.step !== 'age') return;

  const text = ctx.message.text.trim();

  // допустимые форматы: 10 или 10-11
  const singleAge = /^\\d{1,2}$/;
  const rangeAge = /^\\d{1,2}\\s*-\\s*\\d{1,2}$/;

  if (!singleAge.test(text) && !rangeAge.test(text)) {
    await ctx.reply(
      '❌ Неверный формат.\n' +
      'Введи:\n' +
      '• 10\n' +
      '• или 10-11'
    );
    return;
  }

  session.payload.age = text;
  session.step = 'done_age';

  await ctx.reply(
    `✅ Возраст принят: ${text}\n\n` +
    'На следующем шаге добавим **кю**.'
  );
});

// ====== LAUNCH ======
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started (long polling).'))
  .catch((err) => {
    console.error('Bot launch error:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
