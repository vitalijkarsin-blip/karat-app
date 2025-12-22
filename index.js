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
function resetSession(uid){
  sessions.set(uid,{
    mode:null, step:null, payload:{},
    focusSet:new Set(),
    session_id:null, cycleIndex:0, cycleTotal:0
  });
}
function getSession(uid){
  if(!sessions.has(uid)) resetSession(uid);
  return sessions.get(uid);
}

/* ===== UI ===== */
const mainMenu = () => Markup.keyboard([
  ['🟦 Одна тренировка','🟩 Цикл'],
  ['🔁 Начать заново']
]).resize();

const goalMenu = () => Markup.keyboard([
  ['Обычная тренировка'],
  ['Подготовка к турниру'],
  ['Подготовка к экзамену'],
  ['🔁 Начать заново']
]).resize();

const focusMenu = () => Markup.keyboard([
  ['🥊 Кумите','🏋️ Физика'],
  ['🎯 Техника','🧘 Ката'],
  ['✅ Готово','🔁 Начать заново']
]).resize();

const nextMenu = () => Markup.keyboard([
  ['▶️ Следующая тренировка'],
  ['🔁 Начать заново']
]).resize();

/* ===== HELPERS ===== */
const clean = o => {
  const r={}; for(const[k,v] of Object.entries(o)){
    if(v===null||v===undefined||v==='') continue; r[k]=v;
  } return r;
};
const callGAS = async params =>
  (await axios.get(GAS_API_URL,{params:clean(params),timeout:45000})).data;

const fmtShort = s =>
  s ? String(s).split('→').map(p=>`• ${p.trim()}`).join('\n')
    : 'Тренировка сформирована.';

/* ===== START / RESET ===== */
bot.start(async ctx=>{
  resetSession(ctx.from.id);
  await ctx.reply('🥋 AI_Methodist\nВыбери режим:', mainMenu());
});
bot.hears('🔁 Начать заново', async ctx=>{
  resetSession(ctx.from.id);
  await ctx.reply('Начинаем заново:', mainMenu());
});

/* ===== MODE ===== */
bot.on('text', async (ctx,next)=>{
  const t = ctx.message.text;
  const s = getSession(ctx.from.id);

  if(t==='🟦 Одна тренировка'){
    s.mode='single'; s.step='age'; s.payload={}; s.focusSet=new Set();
    return ctx.reply('Укажи возраст:\n• 10\n• или 10-11');
  }
  if(t==='🟩 Цикл'){
    s.mode='cycle'; s.step='weeks'; s.payload={}; s.focusSet=new Set();
    return ctx.reply('Сколько недель в цикле?\n• 2 • 3 • 4 • 6');
  }
  return next();
});

/* ===== CYCLE: WEEKS ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(s.mode!=='cycle'||s.step!=='weeks') return next();
  const n=parseInt(ctx.message.text,10);
  if(![2,3,4,6].includes(n)) return ctx.reply('❌ 2 / 3 / 4 / 6');
  s.payload.weeks=n; s.step='tpw';
  return ctx.reply('Тренировок в неделю?\n• 2 • 3 • 4 • 5');
});

/* ===== CYCLE: TPW ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(s.mode!=='cycle'||s.step!=='tpw') return next();
  const n=parseInt(ctx.message.text,10);
  if(![2,3,4,5].includes(n)) return ctx.reply('❌ 2–5');
  s.payload.trainings_per_week=n;
  s.step='age';
  return ctx.reply('Укажи возраст:\n• 10\n• или 10-11');
});

/* ===== AGE (ОБЩИЙ ДЛЯ SINGLE И CYCLE) ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(!['single','cycle'].includes(s.mode)||s.step!=='age') return next();
  const t=ctx.message.text.trim();
  const single=/^\d{1,2}$/; const range=/^\d{1,2}\s*-\s*\d{1,2}$/;
  if(!single.test(t)&&!range.test(t)) return ctx.reply('❌ 10 или 10-11');
  let from,to;
  if(single.test(t)) from=to=parseInt(t,10);
  else [from,to]=t.split('-').map(v=>parseInt(v.trim(),10));
  if(from<3) from=3; if(to<3) to=3;
  s.payload.age_from=from; s.payload.age_to=to;
  s.step='kyu';
  return ctx.reply('Укажи кю:\n• 8\n• или 8-7');
});

/* ===== KYU ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(!['single','cycle'].includes(s.mode)||s.step!=='kyu') return next();
  const t=ctx.message.text.trim();
  const single=/^\d{1,2}$/; const range=/^\d{1,2}\s*-\s*\d{1,2}$/;
  if(!single.test(t)&&!range.test(t)) return ctx.reply('❌ 8 или 8-7');
  let from,to;
  if(single.test(t)) from=to=parseInt(t,10);
  else [from,to]=t.split('-').map(v=>parseInt(v.trim(),10));
  from=Math.min(11,Math.max(1,from));
  to=Math.min(11,Math.max(1,to));
  s.payload.kyu_from=from; s.payload.kyu_to=to;
  s.step='goal';
  return ctx.reply('Выбери цель:', goalMenu());
});

/* ===== GOAL ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(!['single','cycle'].includes(s.mode)||s.step!=='goal') return next();
  const map={
    'Обычная тренировка':'normal',
    'Подготовка к турниру':'tournament',
    'Подготовка к экзамену':'exam'
  };
  const g=map[ctx.message.text];
  if(!g) return ctx.reply('❌ Кнопкой');
  s.payload.goal=g; s.step='focus';
  return ctx.reply('Выбери фокус(ы), затем «Готово».', focusMenu());
});

/* ===== FOCUS ===== */
bot.on('text', async (ctx,next)=>{
  const s=getSession(ctx.from.id);
  if(!['single','cycle'].includes(s.mode)||s.step!=='focus') return next();
  const map={'🥊 Кумите':'kumite','🏋️ Физика':'physics','🎯 Техника':'technique','🧘 Ката':'kata'};
  const t=ctx.message.text;
  if(map[t]){ s.focusSet.add(map[t]); return ctx.reply(`Добавлено: ${map[t]}`); }
  if(t!=='✅ Готово') return ctx.reply('Выбирай кнопками.');
  if(!s.focusSet.size) return ctx.reply('❌ Выбери фокус.');
  s.payload.focus=[...s.focusSet];
  s.step='duration';
  return ctx.reply('Укажи длительность (мин), например 95');
});

/* ===== DURATION + CALL ===== */
bot.on('text', async (ctx)=>{
  const s=getSession(ctx.from.id);
  if(!['single','cycle'].includes(s.mode)||s.step!=='duration') return;
  const n=parseInt(ctx.message.text,10);
  if(!Number.isFinite(n)||n<30||n>180) return ctx.reply('❌ 30–180');
  s.payload.duration_minutes=n;

  if(s.mode==='single'){
    s.payload.mode='single';
    await ctx.reply('Формирую тренировку…');
    const data=await callGAS(s.payload);
    if(data.status!=='ok') return ctx.reply('❌ Ошибка API');
    await ctx.reply(`🏷 ${data.training?.title||'Тренировка'}`);
    await ctx.reply(fmtShort(data.training?.short_blocks));
    s.step='done';
    return;
  }

  // === CYCLE ===
  s.payload.mode='cycle';
  await ctx.reply('Формирую цикл…');
  const data=await callGAS(s.payload);
  if(data.status!=='ok') return ctx.reply('❌ Ошибка цикла');
  s.session_id=data.session_id;
  s.cycleIndex=0;
  s.cycleTotal=s.payload.weeks*s.payload.trainings_per_week;

  const first=await callGAS({action:'next',session_id:s.session_id});
  if(first.status==='ok'&&first.training){
    s.cycleIndex=1;
    await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
    await ctx.reply(fmtShort(first.training.short_blocks), nextMenu());
  }
});

/* ===== NEXT ===== */
bot.hears('▶️ Следующая тренировка', async ctx=>{
  const s=getSession(ctx.from.id);
  if(s.mode!=='cycle'||!s.session_id) return;
  const data=await callGAS({action:'next',session_id:s.session_id});
  if(data.status==='done') return ctx.reply('✅ Цикл завершён', mainMenu());
  if(data.status==='ok'&&data.training){
    s.cycleIndex++;
    await ctx.reply(`🏷 Тренировка ${s.cycleIndex} из ${s.cycleTotal}`);
    await ctx.reply(fmtShort(data.training.short_blocks), nextMenu());
  }
});

/* ===== LAUNCH ===== */
bot.launch({ dropPendingUpdates:true })
  .then(()=>console.log('Bot started'))
  .catch(e=>{console.error(e);process.exit(1);});

process.once('SIGINT',()=>bot.stop('SIGINT'));
process.once('SIGTERM',()=>bot.stop('SIGTERM'));
