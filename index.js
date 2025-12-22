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
    mode: null,            // single | cycle
    step: 'select_mode',   // select_mode | age | kyu | duration | cycle_active | done
    payload: {},
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

const nextMenu = () =>
  Markup.keyboard([
    ['▶️ Следующая тренировка'],
    ['ℹ️ Помощь', '🔁 Начать заново']
  ]).resize();

/* ===== HELPERS ===== */
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
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
  ctx.reply('🥋 AI-Методист\nВыбери режим:', mainMenu());
});

bot.hears('🔁 Начать заново', ctx => {
  resetSession(ctx.from.id);
  ctx.reply('Начинаем заново:', mainMenu());
});

bot.hears('ℹ️ Помощь', ctx => {
  ctx.reply(
    'ℹ️ Помощь\n\n' +
    '• Одна тренировка — разовый план\n' +
    '• Цикл — серия тренировок\n' +
    '• Порядок: возраст → кю → время',
    mainMenu()
  );
});

/* ===== NEXT ===== */
bot.hears('▶️ Следующая тренировка', async ctx => {
  const s = getSession(ctx.from.id);
  if (s.step !== 'cycle_active' || !s.session_id) return;

  await ctx.reply('⏭ Запрашиваю следующую тренировку…');

  try {
    const data = await callGAS({
      action: 'next',
      session_id: s.session_id
    });

    if (data.status === 'done') {
      s.step = 'done';
      return ctx.reply('✅ Цикл завершён', mainMenu());
    }

    if (data.status === 'ok' && data.training) {
      s.cycleIndex++;
      await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
      return ctx.reply(renderTraining(data.training), nextMenu());
    }
  } catch {
    return ctx.reply('❌ Ошибка запроса.');
  }
});

/* ===== TEXT FLOW ===== */
bot.on('text', async ctx => {
  const text = ctx.message.text;
  const s = getSession(ctx.from.id);

  /* === SELECT MODE === */
  if (s.step === 'select_mode') {
    if (text === '🟦 Одна тренировка') {
      s.mode = 'single';
      s.step = 'age';
      return ctx.reply('Укажи возраст (например: 10 или 10-12):');
    }
    if (text === '🟩 Цикл') {
      s.mode = 'cycle';
      s.step = 'age';
      return ctx.reply('Укажи возраст (например: 10 или 10-12):');
    }
    return;
  }

  /* === AGE === */
  if (s.step === 'age') {
    const nums = text.match(/\d+/g)?.map(n => parseInt(n, 10));
    if (!nums || nums.length === 0) {
      return ctx.reply('❌ Введи возраст числом (пример: 10 или 10-12)');
    }

    s.payload.age_from = nums[0];
    s.payload.age_to = nums[1] ?? nums[0];
    s.step = 'kyu';
    return ctx.reply('Укажи кю (например: 8 или 8-6):');
  }

  /* === KYU === */
  if (s.step === 'kyu') {
    const nums = text.match(/\d+/g)?.map(n => parseInt(n, 10));
    if (!nums || nums.length === 0) {
      return ctx.reply('❌ Введи кю числом (пример: 8 или 8-6)');
    }

    s.payload.kyu_from = nums[0];
    s.payload.kyu_to = nums[1] ?? nums[0];
    s.step = 'duration';
    return ctx.reply('Укажи длительность тренировки (30–180):');
  }

  /* === DURATION === */
  if (s.step === 'duration') {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 30 || n > 180) {
      return ctx.reply('❌ Введи число от 30 до 180');
    }

    s.payload.duration_minutes = n;

    /* SINGLE */
    if (s.mode === 'single') {
      await ctx.reply('⏳ Формирую тренировку…');
      const data = await callGAS({
        ...s.payload,
        mode: 'single'
      });

      if (data.status === 'ok') {
        s.step = 'done';
        return ctx.reply(renderTraining(data.training), mainMenu());
      }
      return;
    }

    /* CYCLE */
    if (s.mode === 'cycle') {
      await ctx.reply('⏳ Формирую цикл…');

      const data = await callGAS({
        ...s.payload,
        mode: 'cycle',
        weeks: 4,
        trainings_per_week: 3
      });

      s.session_id = data.session_id;
      s.cycleTotal = 12;
      s.cycleIndex = 0;

      const first = await callGAS({
        action: 'next',
        session_id: s.session_id
      });

      if (first.status === 'ok') {
        s.cycleIndex = 1;
        s.step = 'cycle_active';
        await ctx.reply(`🏷 Тренировка 1 из ${s.cycleTotal}`);
        return ctx.reply(renderTraining(first.training), nextMenu());
      }
    }
  }
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('Bot started'))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
