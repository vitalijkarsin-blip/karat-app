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
    mode: null,   // single | cycle
    step: 'mode', // mode | weeks | tpw | age | kyu | goal | focus | duration | cycle_active | done
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

/* ===== UI ===== */
const mainMenu = () =>
  Markup.keyboard([
    ['🟦 Одна тренировка', '🟩 Цикл'],
    ['ℹ️ Помощь', '🔁 Начать заново']
  ]).resize();

const goalMenu = () =>
  Markup.keyboard([
    ['🏋️ Обычная тренировка', '🏆 Подготовка к турниру'],
    ['🎓 Подготовка к аттестации']
  ]).resize();

const focusMenu = () =>
  Markup.keyboard([
    ['⚡ Физика', '🥋 Техника'],
    ['🧘 Ката', '🤼 Кумите'],
    ['✅ Принять', '➡️ Пропустить']
  ]).resize();

const nextMenu = () =>
  Markup.keyboard([
    ['▶️ Следующая тренировка'],
    ['ℹ️ Помощь', '🔁 Начать заново']
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
    ) {
      out[k] = v;
    }
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
bot.start(ctx => {
  resetSession(ctx.from.id);
  ctx.reply('🥋 AI-Методист\nВыбери формат:', mainMenu());
});

bot.hears('🔁 Начать заново', ctx => {
  resetSession(ctx.from.id);
  ctx.reply('Начинаем заново:', mainMenu());
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

/* ===== TEXT FLOW ===== */
bot.on('text', async ctx => {
  const text = ctx.message.text;
  const s = getSession(ctx.from.id);

  /* === MODE === */
  if (s.step === 'mode') {
    if (text === '🟦 Одна тренировка') {
      s.mode = 'single';
      s.step = 'age';
      return ctx.reply('Укажи возраст (3–70, например: 10 или 10-12):');
    }
    if (text === '🟩 Цикл') {
      s.mode = 'cycle';
      s.step = 'weeks';
      return ctx.reply('Укажи количество недель:');
    }
    return;
  }

  /* === WEEKS === */
  if (s.step === 'weeks') {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > 12) {
      return ctx.reply('❌ Недели: число от 1 до 12');
    }
    s.payload.weeks = n;
    s.step = 'tpw';
    return ctx.reply('Сколько тренировок в неделю? (1–7)');
  }

  /* === TPW === */
  if (s.step === 'tpw') {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1 || n > 7) {
      return ctx.reply('❌ Тренировок в неделю: от 1 до 7');
    }
    s.payload.trainings_per_week = n;
    s.step = 'age';
    return ctx.reply('Укажи возраст (3–70, например: 10 или 10-12):');
  }

  /* === AGE === */
  if (s.step === 'age') {
    const nums = text.match(/\d+/g)?.map(n => parseInt(n, 10));
    if (!nums || nums.length === 0) {
      return ctx.reply('❌ Возраст числом');
    }

    const from = nums[0];
    const to = nums[1] ?? nums[0];

    if (from < 3 || to > 70) {
      return ctx.reply('❌ Возраст должен быть от 3 до 70 лет');
    }

    s.payload.age_from = from;
    s.payload.age_to = to;
    s.step = 'kyu';
    return ctx.reply('Укажи кю (1–11, например: 8 или 8-6):');
  }

  /* === KYU === */
  if (s.step === 'kyu') {
    const nums = text.match(/\d+/g)?.map(n => parseInt(n, 10));
    if (!nums || nums.length === 0) {
      return ctx.reply('❌ Кю числом');
    }

    const from = nums[0];
    const to = nums[1] ?? nums[0];

    if (from < 1 || to > 11) {
      return ctx.reply('❌ Кю должен быть от 1 до 11');
    }

    s.payload.kyu_from = from;
    s.payload.kyu_to = to;
    s.step = 'goal';
    return ctx.reply('Выбери цель тренировки:', goalMenu());
  }

  /* === GOAL === */
  if (s.step === 'goal') {
    if (text.includes('Обычная')) s.payload.goal = 'normal';
    if (text.includes('турниру')) s.payload.goal = 'tournament';
    if (text.includes('аттестации')) s.payload.goal = 'exam';
    s.step = 'focus';
    return ctx.reply('Выбери приоритеты (можно несколько):', focusMenu());
  }

  /* === FOCUS === */
  if (s.step === 'focus') {
    if (text === '➡️ Пропустить' || text === '✅ Принять') {
      s.step = 'duration';
      return ctx.reply('Укажи длительность тренировки (в минутах):');
    }

    if (text.includes('Физика')) s.payload.focus.push('physics');
    if (text.includes('Техника')) s.payload.focus.push('technique');
    if (text.includes('Ката')) s.payload.focus.push('kata');
    if (text.includes('Кумите')) s.payload.focus.push('kumite');

    return ctx.reply('Можно выбрать ещё или нажми «Принять»', focusMenu());
  }

  /* === DURATION === */
  if (s.step === 'duration') {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n)) {
      return ctx.reply('❌ Длительность числом');
    }

    const minAge = s.payload.age_from;
    if (minAge <= 6 && n > 40) {
      return ctx.reply('❌ Для детей до 6 лет максимум 40 минут');
    }

    if (n < 20 || n > 180) {
      return ctx.reply('❌ Длительность от 20 до 180 минут');
    }

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
