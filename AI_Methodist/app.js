const form = document.getElementById('requestForm');
const result = document.getElementById('result');
const title = document.getElementById('trainingTitle');
const duration = document.getElementById('trainingDuration');
const blocks = document.getElementById('trainingBlocks');
const resetBtn = document.getElementById('resetBtn');
const acceptBtn = document.getElementById('acceptBtn');
const output = document.getElementById('output');

let currentCycle = null;
let cycleAccepted = false;

/* ===== SUBMIT FORM ===== */
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

  // DEBUG JSON
  output.textContent = JSON.stringify(payload, null, 2);

  /* ===== SINGLE TRAINING ===== */
  if (payload.format === 'single') {
    currentCycle = null;
    cycleAccepted = false;
    acceptBtn.hidden = true;

    renderTraining(getTrainingByStage(0));
    return;
  }

  /* ===== CYCLE ===== */
  currentCycle = {
    weeks: payload.format === 'cycle_2w' ? 2 : 4,
    stage: 0
  };

  cycleAccepted = false;
  renderCycleStructure();
});

/* ===== RENDER CYCLE STRUCTURE ===== */
function renderCycleStructure() {
  title.textContent = `Цикл на ${currentCycle.weeks} недели`;
  duration.textContent = 'Структура цикла';
  blocks.innerHTML = '';

  const stages = ['Адаптация', 'Нагрузка', 'Специализация', 'Контроль'];

  stages.forEach((stage, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${stage}`;
    blocks.appendChild(li);
  });

  acceptBtn.textContent = '✅ Принять цикл';
  acceptBtn.hidden = false;

  form.hidden = true;
  result.hidden = false;
}

/* ===== ACCEPT / NEXT TRAINING ===== */
acceptBtn.addEventListener('click', () => {
  if (!currentCycle) return;

  // первое нажатие — принять цикл
  if (!cycleAccepted) {
    cycleAccepted = true;
    output.textContent += '\n\n[Цикл принят]';
    acceptBtn.textContent = '➡️ Следующая тренировка';
    return;
  }

  // последующие — следующая тренировка
  renderTraining(getTrainingByStage(currentCycle.stage));
  currentCycle.stage++;
});

/* ===== TRAINING DATA ===== */
function getTrainingByStage(stage) {
  const plans = [
    {
      title: 'Тренировка — Адаптация',
      duration: '75 минут',
      blocks: [
        'Лёгкая разминка',
        'Базовая техника',
        'ОФП',
        'Растяжка'
      ]
    },
    {
      title: 'Тренировка — Нагрузка',
      duration: '90 минут',
      blocks: [
        'Интенсивная разминка',
        'Комбинации',
        'Силовая работа',
        'Заминка'
      ]
    },
    {
      title: 'Тренировка — Специализация',
      duration: '90 минут',
      blocks: [
        'Техника под цель',
        'Работа в парах',
        'Физическая подготовка',
        'Заминка'
      ]
    },
    {
      title: 'Тренировка — Контроль',
      duration: '80 минут',
      blocks: [
        'Разминка',
        'Контрольные задания',
        'Спарринги',
        'Анализ'
      ]
    }
  ];

  return plans[stage % plans.length];
}

/* ===== RENDER TRAINING ===== */
function renderTraining(data) {
  title.textContent = data.title;
  duration.textContent = data.duration;
  blocks.innerHTML = '';

  data.blocks.forEach(b => {
    const li = document.createElement('li');
    li.textContent = b;
    blocks.appendChild(li);
  });

  // кнопка только если это цикл
  acceptBtn.hidden = !currentCycle;

  form.hidden = true;
  result.hidden = false;
}

/* ===== RESET ===== */
resetBtn.addEventListener('click', () => {
  currentCycle = null;
  cycleAccepted = false;

  result.hidden = true;
  form.hidden = false;
  output.textContent = '';
});
