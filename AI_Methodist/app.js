const form = document.getElementById('requestForm');
const result = document.getElementById('result');

const titleEl = document.getElementById('trainingTitle');
const blocksEl = document.getElementById('trainingBlocks');

const detailsBtn = document.getElementById('detailsBtn');
const trainingDetails = document.getElementById('trainingDetails');
const detailsContent = document.getElementById('detailsContent');

const acceptBtn = document.getElementById('acceptBtn');
const acceptCycleBtn = document.getElementById('acceptCycleBtn');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');

const output = document.getElementById('output');

/* ===== BUTTON LOADER ===== */
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoader = submitBtn.querySelector('.btn-loader');

function setLoading(state) {
  if (state) {
    btnLoader.hidden = false;
    submitBtn.disabled = true;
    btnText.textContent = 'Думаю…';
  } else {
    btnLoader.hidden = true;
    submitBtn.disabled = false;
    btnText.textContent = 'Сформировать запрос';
  }
}

/* === GAS API === */
const API_URL =
  'https://script.google.com/macros/s/AKfycbzgoa-9hjklCxdhS8WAJRNwqOFiU3Pqno8q0yvZ1WbELmBEL9uLqP7P967MEmDhy2Ii/exec';

/* ===== state ===== */
let currentSessionId = null;

/* ===== helpers ===== */

function parseKyu(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/* ===== payload ===== */

function buildPayload() {
  const fd = new FormData(form);

  const format = fd.get('format');
  const mode = format && format.startsWith('cycle') ? 'cycle' : 'single';

  const ageFrom = numOrNull(fd.get('age_from'));
  let ageTo = numOrNull(fd.get('age_to'));
  if (ageFrom !== null && ageTo === null) ageTo = ageFrom;

  const kyuFrom = parseKyu(fd.get('kyu_from'));
  let kyuTo = parseKyu(fd.get('kyu_to'));
  if (kyuFrom !== null && kyuTo === null) kyuTo = kyuFrom;

  const focus = fd.getAll('focus').join(',');

  const payload = {
    mode,
    age_from: ageFrom,
    age_to: ageTo,
    kyu_from: kyuFrom,
    kyu_to: kyuTo,
    goal: fd.get('goal') === 'training' ? 'normal' : fd.get('goal'),
    focus
  };

  if (mode === 'cycle') {
    payload.weeks = numOrNull(fd.get('weeks'));
    payload.trainings_per_week = numOrNull(fd.get('trainings_per_week'));
  }

  return payload;
}

/* ===== API ===== */

async function callAPI(paramsObj) {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      params.set(k, v);
    }
  });

  const res = await fetch(`${API_URL}?${params.toString()}`);
  return await res.json();
}

/* ===== submit ===== */

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = buildPayload();
  output.textContent = JSON.stringify(payload, null, 2);

  setLoading(true);

  try {
    const data = await callAPI(payload);
    setLoading(false);

    output.textContent += '\n\n--- SERVER ---\n';
    output.textContent += JSON.stringify(data, null, 2);

    if (data.status !== 'ok') {
      output.textContent += `\n\n[Ошибка]: ${data.message}`;
      return;
    }

    // === СТАРТ ЦИКЛА ===
    if (payload.mode === 'cycle') {
      currentSessionId = data.session_id;

      form.hidden = true;
      result.hidden = false;

      titleEl.textContent = 'Цикл тренировок запущен';
      blocksEl.innerHTML = '';
      detailsContent.textContent = '';

      acceptBtn.hidden = true;
      acceptCycleBtn.hidden = true;
      nextBtn.hidden = false;
      return;
    }

    // === РАЗОВАЯ ТРЕНИРОВКА ===
    renderTraining(data.training);
    currentSessionId = null;

    acceptBtn.hidden = false;
    acceptCycleBtn.hidden = true;
    nextBtn.hidden = true;

  } catch (err) {
    setLoading(false);
    output.textContent += `\n\n[Ошибка соединения]: ${err.message}`;
  }
});

/* ===== render ===== */

function renderTraining(training) {
  titleEl.textContent = training.title || 'Тренировка';

  blocksEl.innerHTML = '';
  if (training.short_blocks) {
    String(training.short_blocks)
      .split('→')
      .map(p => p.trim())
      .filter(Boolean)
      .forEach(p => {
        const li = document.createElement('li');
        li.textContent = p;
        li.style.fontWeight = '600';
        blocksEl.appendChild(li);
      });
  }

  if (training.full_plan) {
    detailsContent.textContent = training.full_plan;
    detailsBtn.hidden = false;
    trainingDetails.hidden = true;
    detailsBtn.textContent = 'Показать полный план';
  } else {
    detailsBtn.hidden = true;
    trainingDetails.hidden = true;
    detailsContent.textContent = '';
  }

  form.hidden = true;
  result.hidden = false;
}

/* ===== buttons ===== */

acceptBtn.addEventListener('click', () => {
  acceptBtn.hidden = true;
});

nextBtn.addEventListener('click', async () => {
  if (!currentSessionId) return;

  setLoading(true);

  try {
    const data = await callAPI({
      action: 'next',
      session_id: currentSessionId
    });

    setLoading(false);

    if (data.status === 'ok') {
      renderTraining(data.training);
      nextBtn.hidden = false;
    }

    if (data.status === 'done') {
      nextBtn.hidden = true;
      titleEl.textContent = 'Цикл завершён';
    }

  } catch (e) {
    setLoading(false);
    alert('Ошибка получения следующей тренировки');
  }
});

/* ===== details toggle ===== */

detailsBtn.addEventListener('click', () => {
  const show = trainingDetails.hidden;
  trainingDetails.hidden = !show;
  detailsBtn.textContent = show
    ? 'Скрыть полный план'
    : 'Показать полный план';
});

/* ===== reset ===== */

resetBtn.addEventListener('click', () => {
  currentSessionId = null;

  result.hidden = true;
  form.hidden = false;

  blocksEl.innerHTML = '';
  detailsContent.textContent = '';
  trainingDetails.hidden = true;
  detailsBtn.hidden = true;

  acceptBtn.hidden = false;
  acceptCycleBtn.hidden = true;
  nextBtn.hidden = true;

  output.textContent = '';
});
