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
  btnLoader.hidden = !state;
  submitBtn.disabled = state;
  btnText.textContent = state ? 'Думаю…' : 'Сформировать запрос';
}

/* === GAS API === */
const API_URL =
  'https://script.google.com/macros/s/AKfycbzgoa-9hjklCxdhS8WAJRNwqOFiU3Pqno8q0yvZ1WbELmBEL9uLqP7P967MEmDhy2Ii/exec';

/* ===== state ===== */
let currentSessionId = null;
let cycleIndex = 0;
let cycleTotal = 0;
let cycleFocusText = '';

/* ===== helpers ===== */

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseKyu(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function focusToText(focus) {
  if (!focus) return 'общей подготовке';
  if (focus.includes('physics')) return 'физической подготовке';
  if (focus.includes('technique')) return 'технике';
  if (focus.includes('kata')) return 'ката';
  if (focus.includes('kumite')) return 'кумите';
  return 'общей подготовке';
}

function setCycleTitle() {
  titleEl.textContent = `Тренировка ${cycleIndex} из ${cycleTotal}. Фокус на ${cycleFocusText}`;
}

/* ===== payload ===== */

function buildPayload() {
  const fd = new FormData(form);
  const format = fd.get('format');
  const mode = format && format !== 'single' ? 'cycle' : 'single';

  const focus = fd.getAll('focus');

  let age_from = numOrNull(fd.get('age_from'));
  let age_to   = numOrNull(fd.get('age_to'));
  let kyu_from = parseKyu(fd.get('kyu_from'));
  let kyu_to   = parseKyu(fd.get('kyu_to'));

  if (age_from !== null && age_to === null) age_to = age_from;
  if (kyu_from !== null && kyu_to === null) kyu_to = kyu_from;

  const payload = {
    mode,
    age_from,
    age_to,
    kyu_from,
    kyu_to,
    goal: fd.get('goal') === 'training' ? 'normal' : fd.get('goal'),
    focus
  };

  if (mode === 'cycle') {
    payload.weeks = String(format).includes('2') ? 2 : 4;
    payload.trainings_per_week = numOrNull(fd.get('trainings_per_week'));
  }

  return payload;
}

/* ===== API ===== */

async function callAPI(paramsObj) {
  const params = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') params.set(k, v);
  });
  const res = await fetch(`${API_URL}?${params.toString()}`);
  return await res.json();
}

/* ===== render ===== */

function renderTraining(training) {
  blocksEl.innerHTML = '';

  if (training.short_blocks) {
    String(training.short_blocks)
      .split('→')
      .map(p => p.trim())
      .filter(Boolean)
      .forEach(p => {
        const li = document.createElement('li');
        li.textContent = p;
        blocksEl.appendChild(li);
      });
  }

  const hasDetails = Boolean(training.full_plan);
  detailsContent.textContent = hasDetails ? training.full_plan : '';
  detailsBtn.hidden = !hasDetails;
  trainingDetails.hidden = true;

  if (hasDetails) {
    detailsBtn.textContent = 'Показать полный план';
  }

  form.hidden = true;
  result.hidden = false;
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

    if (data.status !== 'ok') return;

    if (payload.mode === 'cycle') {
      currentSessionId = data.session_id;

      cycleIndex = 0;
      cycleTotal = payload.weeks * payload.trainings_per_week;
      cycleFocusText = focusToText(payload.focus);

      form.hidden = true;
      result.hidden = false;
      blocksEl.innerHTML = '';

      const firstTraining = await callAPI({
        action: 'next',
        session_id: currentSessionId
      });

      if (firstTraining.status === 'ok' && firstTraining.training) {
        cycleIndex = 1;
        renderTraining(firstTraining.training);
        setCycleTitle();
        nextBtn.hidden = false;
      }

      acceptBtn.hidden = true;
      acceptCycleBtn.hidden = true;
      return;
    }

    renderTraining(data.training);
    titleEl.textContent = data.training.title || 'Тренировка';

  } catch {
    setLoading(false);
  }
});

/* ===== next ===== */

nextBtn.addEventListener('click', async () => {
  if (!currentSessionId) return;

  setLoading(true);

  try {
    const data = await callAPI({
      action: 'next',
      session_id: currentSessionId
    });

    setLoading(false);

    if (data.status === 'ok' && data.training) {
      cycleIndex++;
      renderTraining(data.training);
      setCycleTitle();
      return;
    }

    if (data.status === 'done') {
      nextBtn.hidden = true;
      titleEl.textContent = 'Цикл завершён';
    }

  } catch {
    setLoading(false);
  }
});

/* ===== details toggle ===== */

detailsBtn.addEventListener('click', () => {
  const isHidden = trainingDetails.hidden;
  trainingDetails.hidden = !isHidden;
  detailsBtn.textContent = isHidden
    ? 'Скрыть полный план'
    : 'Показать полный план';
});

/* ===== reset ===== */

resetBtn.addEventListener('click', () => {
  currentSessionId = null;
  cycleIndex = 0;
  cycleTotal = 0;

  result.hidden = true;
  form.hidden = false;
  blocksEl.innerHTML = '';
  detailsContent.textContent = '';
});
