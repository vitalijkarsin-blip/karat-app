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

// ===== STATE =====
let currentCycle = null;
let cycleAccepted = false;

// ===== ШАБЛОНЫ ПОДРОБНЫХ ТРЕНИРОВОК =====
const DETAILS_TEMPLATES = {
  adaptation: `
Разминка:
– суставная гимнастика
– лёгкий бег 5 минут

Кихон на месте:
– цуки (сэйкен, моротэ)
– акцент на стойку и баланс

ОФП:
– отжимания 5×10
– пресс 3×20

Заминка:
– растяжка ног и спины
  `,

  load: `
Разминка:
– бег + ускорения
– суставная подготовка

Техника:
– комбинации в движении
– работа в парах

ОФП:
– силовой круг
– работа на выносливость

Заминка:
– дыхание и растяжка
  `,

  specialization: `
Разминка:
– динамика + реакция

Техника:
– удары под цель
– связки под задачу

Спарринги:
– ограниченные задания
– контроль дистанции

Заминка:
– восстановление
  `,

  control: `
Разминка:
– стандартная

Контроль:
– кихон
– физические тесты
– спарринги

Анализ:
– ошибки
– рекомендации
  `
};

// ===== HELPERS =====
function getStageKey(stage) {
  return ['adaptation', 'load', 'specialization', 'control'][stage % 4];
}

// ===== FORM SUBMIT =====
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const fd = new FormData(form);

  const ageFrom = fd.get('age_from');
  const ageTo = fd.get('age_to') || ageFrom;
  const kyuFrom = fd.get('kyu_from');
  const kyuTo = fd.get('kyu_to') || kyuFrom;

  const payload = {
    age: { from: ageFrom, to: ageTo },
    kyu: { from: kyuFrom, to: kyuTo },
    goal: fd.get('goal'),
    format: fd.get('format'),
    focus: fd.getAll('focus')
  };

  output.textContent = JSON.stringify(payload, null, 2);
  detailsWrap.hidden = true;

  if (payload.format === 'single') {
    currentCycle = null;
    cycleAccepted = false;
    acceptBtn.hidden = true;

    renderTraining(getTrainingByStage(0));
    return;
  }

  currentCycle = {
    weeks: payload.format === 'cycle_2w' ? 2 : 4,
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

  renderTraining(getTrainingByStage(currentCycle.stage));
  currentCycle.stage++;
});

// ===== TRAINING =====
function getTrainingByStage(stage) {
  return {
    title: `Тренировка — ${['Адаптация','Нагрузка','Специализация','Контроль'][stage % 4]}`,
    duration: stage === 0 ? '75 минут' : '90 минут',
    blocks: [
      'Разминка',
      'Техника',
      'ОФП / Спарринги',
      'Заминка'
    ],
    stage
  };
}

function renderTraining(data) {
  title.textContent = data.title;
  duration.textContent = data.duration;
  blocks.innerHTML = '';

  data.blocks.forEach(b => {
    const li = document.createElement('li');
    li.textContent = b;
    blocks.appendChild(li);
  });

  const stageKey = getStageKey(data.stage);
  detailsContent.textContent = DETAILS_TEMPLATES[stageKey];

  detailsWrap.hidden = true;
  detailsBtn.hidden = false;
  detailsBtn.textContent = '📋 Подробная тренировка';

  acceptBtn.hidden = !currentCycle;

  form.hidden = true;
  result.hidden = false;
}

// ===== DETAILS TOGGLE =====
detailsBtn.addEventListener('click', () => {
  const isHidden = detailsWrap.hidden;
  detailsWrap.hidden = !isHidden;
  detailsBtn.textContent = isHidden
    ? '⬆️ Скрыть подробный план'
    : '📋 Подробная тренировка';
});

// ===== RESET =====
resetBtn.addEventListener('click', () => {
  currentCycle = null;
  cycleAccepted = false;
  result.hidden = true;
  form.hidden = false;
  detailsWrap.hidden = true;
  output.textContent = '';
});
