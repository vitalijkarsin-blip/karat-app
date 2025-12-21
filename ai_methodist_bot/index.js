require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const GAS_API_URL = process.env.GAS_API_URL;

if (!BOT_TOKEN) {
  console.error('ERROR: BOT_TOKEN is missing. Put it into .env');
  process.exit(1);
}
if (!GAS_API_URL) {
  console.error('ERROR: GAS_API_URL is missing. Put it into .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- In-memory sessions (MVP) ---
const sessions = new Map(); // key: userId -> { mode, step, payload, session_id }

// --- Helpers ---
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { mode: null, step: null, payload: {}, session_id: null });
  }
  return sessions.get(userId);
}

function resetSession(userId) {
  sessions.set(userId, { mode: null, step: null, payload: {}, session_id: null });
}

function mainMenu() {
  return Markup.keyboard([
    ['🟦 Одна тренировка', '🟩 Цикл'],
    ['ℹ️ Помощь', '🔁 Начать заново']
  ]).resize();
}

// --- Basic commands ---
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  resetSession(userId);

  await ctx.reply(
    '🥋 AI_Methodist\nВыбери режим:',
    mainMenu()
  );
});

bot.hears('🔁 Начать заново', async (ctx) => {
  const userId = ctx.from.id;
  resetSession(userId);
  await ctx.reply('Ок, начинаем заново. Выбери режим:', mainMenu());
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply(
    'Команды:\n' +
    '/start — старт\n' +
    '🔁 Начать заново — сброс\n\n' +
    'Режимы:\n' +
    '🟦 Одна тренировка\n' +
    '🟩 Цикл (с кнопкой “Следующая тренировка”)'
  );
});

// --- Mode selection (MVP: только подтверждаем, что бот живой) ---
bot.hears('🟦 Одна тренировка', async (ctx) => {
  const userId = ctx.from.id;
  const s = getSession(userId);
  s.mode = 'single';
  s.step = 'stub';

  await ctx.reply(
    'Ок. Режим: Одна тренировка.\n' +
    'Следующим шагом подключим вопросы (возраст, кю, цель, приоритеты) и вызов GAS.',
    mainMenu()
  );
});

bot.hears('🟩 Цикл', async (ctx) => {
  const userId = ctx.from.id;
  const s = getSession(userId);
  s.mode = 'cycle';
  s.step = 'stub';

  await ctx.reply(
    'Ок. Режим: Цикл.\n' +
    'Следующим шагом подключим вопросы (недели, трен/нед, возраст, кю, цель, приоритеты) + session_id + “Следующая тренировка”.',
    mainMenu()
  );
});

// --- Health ping to GAS (проверка связи, не ломает ничего) ---
bot.command('ping_gas', async (ctx) => {
  try {
    await ctx.reply('Проверяю связь с мозгом (GAS)...');
    const r = await axios.get(GAS_API_URL, { timeout: 15000 });
    const text = typeof r.data === 'string' ? r.data.slice(0, 500) : JSON.stringify(r.data).slice(0, 500);
    await ctx.reply('✅ GAS отвечает. Фрагмент ответа:\n' + text);
  } catch (e) {
    await ctx.reply('❌ Не достучался до GAS. Ошибка:\n' + (e?.message || 'unknown'));
  }
});

// --- Launch ---
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started (long polling).'))
  .catch((err) => {
    console.error('Bot launch error:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
