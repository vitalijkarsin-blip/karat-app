// ===== DOM =====
const form = document.getElementById('requestForm');
const result = document.getElementById('result');
const title = document.getElementById('trainingTitle');
const duration = document.getElementById('trainingDuration');
const blocks = document.getElementById('trainingBlocks');
const resetBtn = document.getElementById('resetBtn');
const acceptBtn = document.getElementById('acceptBtn');
const detailsBtn = document.getElementById('detailsBtn');
const detailsWrap = document.getElementById('trainingDetails');
const detailsContent = document.getElementById('detailsContent');
const output = document.getElementById('output');

// ===== ВСТАВЬ СЮДА URL ШАБЛОННОГО GAS =====
const TEMPLATES_API_URL = 'https://script.google.com/macros/s/AKfycbxWYN4u_a0IzV76m3V4tjB7ufzO7UTQjmVFBezY3skT867gj2UQ90K7T_nQtdc5EeHO/exec';

// ===== STATE =====
let currentCycle = null;
let cycleAccepted = false;
let lastPayload = null;
let lastTraining = null;

// ===== LOCAL FALLBACK TEMPLATES =====
const DETAILS_TEMPLATES = {
  adaptation: `Разминка:\n– суставная гимнастика\n– лёгкий бег 5 минут\n\nТехника:\n– кихон на месте\n– стойки, баланс\n\nОФП:\n– отжимания 5×10\n– пресс 3×20\n\nЗаминка:\n– растяжка`,
  load: `Разминка:\n– бег + ускорения\n\nТехника:\n– комбинации в движении\n– работа в парах\n\nОФП:\n– силовой круг\n\nЗаминка:\n– дыхание и растяжка`,
  specialization: `Разминка:\n– динамика + реакция\n\nТехника:\n– удары под цель\n\nСпарринги:\n– задания\n\nЗаминка:\n– восстановление`,
  control: `Разминка:\n– стандартная\n\nКонтроль:\n– кихон\n– тесты\n– спарринги\n\nАнализ:\n– ошибки и рекомендации`
};

function getStageKey(stage) {
  return ['adaptation', 'load', 'specialization', 'control'][stage % 4];
}

// ===== SUBMIT =====
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const fd = new FormData(form);

  const ageFrom = fd.get('age_from');
  const ageTo = fd.get('age_to') || ageFrom;
  const kyuFrom = fd.get('kyu_from');
  const kyuTo = fd.get('kyu_to') || kyuFrom;

  lastPayload = {
    age: { from: ageFrom, to: ageTo },
    kyu: { from: kyuFrom, to: kyuTo },
    goal: fd.get('goal'),
    format: fd.get('format'),
    focus: fd.getAll('focus')
  };

  output.textContent = JSON.stringify(lastPayload, null, 2);
  detailsWrap.hidden = true;

  if (lastPayload.format === 'single') {
    currentCycle = null;
    cycleAccepted = false;
    acceptBtn.hidden = true;

    lastTraining = makeTraining(0);
    renderTraining(lastTraining);
    return;
  }

  currentCycle = {
    weeks: lastPayload.format === 'cycle_2w' ? 2 : 4,
    stage: 0
  };

  cycleAccepted = false;
  renderCycleStructure();
});

// ===== CYCLE STRUCTURE =====
function renderCycleStructure() {
  title.textContent = `Цикл на ${currentCycle.weeks} недели`;
  duration.textContent = 'Структура цикла';
  blocks.innerHTML = '';

  ['Адаптация', 'Нагрузка', 'Специализация', 'Контроль'].forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${s}`;
    blocks.appendChild(li);
  });

  acceptBtn.textContent = '✅ Принять цикл';
  acceptBtn.hidden = false;
  detailsBtn.hidden = true;

  form.hidden = true;
  result.hidden = false;
}

// ===== ACCEPT / NEXT =====
acceptBtn.addEventListener('click', () => {
  if (!currentCycle) return;

  if (!cycleAccepted) {
    cycleAccepted = true;
    acceptBtn.textContent = '➡️ Следующая тренировка';
    output.textContent += '\n\n[Цикл принят]';
    return;
  }

  lastTraining = makeTraining(currentCycle.stage);
  renderTraining(lastTraining);
  currentCycle.stage++;
});

// ===== TRAINING MAKER =====
function makeTraining(stage) {
  return {
    title: `Тренировка — ${['Адаптация','Нагрузка','Специализация','Контроль'][stage % 4]}`,
    duration: stage === 0 ? '75 минут' : '90 минут',
    blocks: ['Разминка', 'Техника', 'ОФП / Спарринги', 'Заминка'],
    stage
  };
}

// ===== RENDER TRAINING =====
function renderTraining(data) {
  title.textContent = data.title;
  duration.textContent = data.duration;
  blocks.innerHTML = '';

  data.blocks.forEach(b => {
    const li = document.createElement('li');
    li.textContent = b;
    blocks.appendChild(li);
  });

  // 🔴 ВАЖНО: сбрасываем подробный план
  detailsWrap.hidden = true;
  detailsContent.textContent = '';
  detailsBtn.hidden = false;
  detailsBtn.textContent = '📋 Подробная тренировка';

  acceptBtn.hidden = !currentCycle;

  form.hidden = true;
  result.hidden = false;
}

// ===== DETAILS (fetch from Sheets via GAS) =====
detailsBtn.addEventListener('click', async () => {
  const isHidden = detailsWrap.hidden;

  // toggle close
  if (!isHidden) {
    detailsWrap.hidden = true;
    detailsBtn.textContent = '📋 Подробная тренировка';
    return;
  }

  // open + load
  detailsWrap.hidden = false;
  detailsBtn.textContent = '⬆️ Скрыть подробный план';

  const stageKey = getStageKey(lastTraining?.stage ?? 0);
  const goal = (lastPayload?.goal || 'training');
  const focus = lastPayload?.focus || [];

  const type = (goal === 'tournament' || focus.includes('sparring')) ? 'combat' : 'technical';

  // если API не вставлен — показываем локальный
  if (!TEMPLATES_API_URL || TEMPLATES_API_URL.startsWith('ВСТАВЬ')) {
    detailsContent.textContent = DETAILS_TEMPLATES[stageKey] || 'Нет шаблона';
    return;
  }

  detailsContent.textContent = 'Загружаю шаблон из базы...';

  try {
    const url = `${TEMPLATES_API_URL}?action=template&goal=${encodeURIComponent(goal)}&stage=${encodeURIComponent(stageKey)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url);
    const data = await res.json();

    output.textContent += '\n\n--- TEMPLATE RESPONSE ---\n';
    output.textContent += JSON.stringify(data, null, 2);

    if (data.status === 'ok' && data.template && data.template.full_plan) {
      detailsContent.textContent = data.template.full_plan;
    } else {
      detailsContent.textContent = DETAILS_TEMPLATES[stageKey] || 'Нет шаблона';
    }
  } catch (e) {
    detailsContent.textContent = DETAILS_TEMPLATES[stageKey] || 'Нет шаблона';
  }
});

// ===== RESET =====
resetBtn.addEventListener('click', () => {
  currentCycle = null;
  cycleAccepted = false;
  lastPayload = null;
  lastTraining = null;

  result.hidden = true;
  form.hidden = false;
  detailsWrap.hidden = true;
  output.textContent = '';
});
