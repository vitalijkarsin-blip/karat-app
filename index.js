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

function resetSession(uid) {
  sessions.set(uid, {
    mode: null,
    step: 'mode',
    payload: { focus: [] },
    session_id: null,
    cycleIndex: 0,
    cycleTotal: 0
  });
}

function getSession(uid) {
  if (!sessions.has(uid)) resetSession(uid);
  return sessions.get(uid);
}

/* ===== UI (НЕ СВОРАЧИВАЮТСЯ) ===== */
const baseKeyboard = [
  ['🚀 Start'],
  ['ℹ️ Помощь', '🔁 Начать заново']
];

const mainMenu = () =>
  Markup.keyboard([
    ['🟦 Одна тренировка', '🟩 Цикл'],
    ...baseKeyboard
  ]).resize();

const goalMenu = () =>
  Markup.keyboard([
    ['🏋️ Обычная тренировка', '🏆 Подготовка к турниру'],
    ['🎓 Подготовка к аттестации'],
    ...baseKeyboard
  ]).resize();

const focusMenu = () =>
  Markup.keyboard([
    ['⚡ Физика', '🥋 Техника'],
    ['🧘 Ката', '🤼 Кумите'],
    ['✅ Принять', '➡️ Пропустить'],
    ...baseKeyboard
  ]).resize();

const nextMenu = () =>
  Markup.keyboard([
    ['▶️ Следующая тренировка'],
    ...baseKeyboard
  ]).resize();

/* ===== HELPERS ===== */
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (
      v !== null &&
      v !== undefined &&
      v !== '' &&
      !(Array.isArray(v) && v.length === 0)
    ) out[k] = v;
  }
  return out;
}

async function callGAS(params) {
  const res = await axios.get(GAS_API_URL, {
    params: clean(params),
    timeout: 60000
  });
  return res.data;
}

function renderTraining(training) {
  if (!training) return 'Тренировка сформирована.';
  if (training.short_blocks) {
    return training.short_blocks
      .split('→')
      .map(p => `• ${p.trim()}`)
      .join('\n');
  }
  return training.full_plan || 'Тренировка сформирована.';
}

/* ===== START / RESET ===== */
function startFlow(ctx) {
  resetSession(ctx.from.id);
  ctx.reply(
    '🥋 AI-Методист\n\nВыбери формат тренировки:',
    mainMenu()
  );
}

bot.start(startFlow);
bot.hears('🚀 Start', startFlow);

bot.hears('🔁 Начать заново', ctx => {
  startFlow(ctx);
});

/* ===== HELP ===== */
bot.hears('ℹ️ Помощь', ctx => {
  const s = getSession(ctx.from.id);

  ctx.reply(
    'ℹ️ Помощь\n\n' +
    '1️⃣ Выбери формат: одна тренировка или цикл\n' +
    '2️⃣ Отвечай на вопросы по шагам\n' +
    '3️⃣ В цикле используй кнопку «Следующая тренировка»\n\n' +
    'Если что-то пошло не так — нажми «Начать заново»\n' +
    'Или «Start», если чат был очищен.',
    s.step === 'cycle_active' ? nextMenu() : mainMenu()
  );
});

/* ===== NEXT ===== */
bot.hears('▶️ Следующая тренировка', async ctx => {
  const s = getSession(ctx.from.id);
  if (s.step !== 'cycle_active' || !s.session_id) return;

  await ctx.reply('⏭ Запрашиваю следующую тренировку…');

  const data = await callGAS({
    action: 'next',
    session_id: s.session_id
  });

  if (data.status === 'done') {
    s.step = 'done';
    return ctx.reply('✅ Цикл завершён', mainMenu());
  }

  if (data.status === 'ok') {
    s.cycleIndex++;
    await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
    return ctx.reply(renderTraining(data.training), nextMenu());
  }
});

/* ===== TEXT FLOW (ЛОГИКА НЕ МЕНЯЛАСЬ) ===== */
bot.on('text', async ctx => {
  const text = ctx.message.text;
  const s = getSession(ctx.from.id);

  if (s.step === 'mode') {
    if (text === '🟦 Одна тренировка') {
      s.mode = 'single';
      s.step = 'age';
      return ctx.reply('Укажи возраст (3–70):', mainMenu());
    }
    if (text === '🟩 Цикл') {
      s.mode = 'cycle';
      s.step = 'weeks';
      return ctx.reply('Укажи количество недель:', mainMenu());
    }
    return;
  }

  if (s.step === 'weeks') {
    s.payload.weeks = parseInt(text, 10);
    s.step = 'tpw';
    return ctx.reply('Сколько тренировок в неделю?', mainMenu());
  }

  if (s.step === 'tpw') {
    s.payload.trainings_per_week = parseInt(text, 10);
    s.step = 'age';
    return ctx.reply('Укажи возраст (3–70):', mainMenu());
  }

  if (s.step === 'age') {
    const nums = text.match(/\d+/g)?.map(Number);
    if (!nums) return;
    s.payload.age_from = nums[0];
    s.payload.age_to = nums[1] ?? nums[0];
    s.step = 'kyu';
    return ctx.reply('Укажи кю (1–11):', mainMenu());
  }

  if (s.step === 'kyu') {
    const nums = text.match(/\d+/g)?.map(Number);
    if (!nums) return;
    s.payload.kyu_from = nums[0];
    s.payload.kyu_to = nums[1] ?? nums[0];
    s.step = 'goal';
    return ctx.reply('Выбери цель:', goalMenu());
  }

  if (s.step === 'goal') {
    if (text.includes('Обычная')) s.payload.goal = 'normal';
    if (text.includes('турниру')) s.payload.goal = 'tournament';
    if (text.includes('аттестации')) s.payload.goal = 'exam';
    s.step = 'focus';
    return ctx.reply('Выбери приоритеты:', focusMenu());
  }

  if (s.step === 'focus') {
    if (text === '➡️ Пропустить' || text === '✅ Принять') {
      s.step = 'duration';
      return ctx.reply('Укажи длительность тренировки:', mainMenu());
    }

    if (text.includes('Физика')) s.payload.focus.push('physics');
    if (text.includes('Техника')) s.payload.focus.push('technique');
    if (text.includes('Ката')) s.payload.focus.push('kata');
    if (text.includes('Кумите')) s.payload.focus.push('kumite');

    return ctx.reply('Можно выбрать ещё или нажми «Принять»', focusMenu());
  }

  if (s.step === 'duration') {
    const n = parseInt(text, 10);
    s.payload.duration_minutes = n;

    if (s.mode === 'single') {
      await ctx.reply('⏳ Формирую тренировку…');
      const data = await callGAS({ ...s.payload, mode: 'single' });
      s.step = 'done';
      return ctx.reply(renderTraining(data.training), mainMenu());
    }

    if (s.mode === 'cycle') {
      await ctx.reply('⏳ Формирую цикл…');
      const data = await callGAS({ ...s.payload, mode: 'cycle' });

      s.session_id = data.session_id;
      s.cycleTotal = s.payload.weeks * s.payload.trainings_per_week;
      s.cycleIndex = 0;

      await ctx.reply('⏭ Запрашиваю первую тренировку…');
      const first = await callGAS({
        action: 'next',
        session_id: s.session_id
      });

      s.step = 'cycle_active';
      s.cycleIndex = 1;
      await ctx.reply(`🏷 Тренировка 1 из ${s.cycleTotal}`);
      return ctx.reply(renderTraining(first.training), nextMenu());
    }
  }
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates: true });
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
