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

const downloadBtn = document.getElementById('downloadBtn');

const output = document.getElementById('output');

/* ===== BUTTON LOADER ===== */
const submitBtn = document.getElementById('submitBtn');
const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
const btnLoader = submitBtn ? submitBtn.querySelector('.btn-loader') : null;


function setLoading(state) {
  if (btnLoader) btnLoader.hidden = !state;
if (submitBtn) submitBtn.disabled = state;
if (btnText) btnText.textContent = state ? 'Думаю…' : 'Сформировать запрос';

}

/* === GAS API === */
const API_URL =
  'https://script.google.com/macros/s/AKfycbzgoa-9hjklCxdhS8WAJRNwqOFiU3Pqno8q0yvZ1WbELmBEL9uLqP7P967MEmDhy2Ii/exec';


/*====== statistica jpen======= */
fetch(API_URL + '?action=stat&event=open_app').catch(()=>{});




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


function buildDownloadText() {
  // Берём заголовок, короткие блоки и полный план (если есть)
  const title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : 'Тренировка';

  const shortList = [];
  if (blocksEl) {
    blocksEl.querySelectorAll('li').forEach(li => {
      const t = (li.textContent || '').trim();
      if (t) shortList.push('• ' + t);
    });
  }

  const full = (detailsContent && detailsContent.textContent)
    ? detailsContent.textContent.trim()
    : '';

  let out = `# ${title}\n\n`;

  if (shortList.length) {
    out += `Кратко:\n${shortList.join('\n')}\n\n`;
  }

  if (full) {
    out += `Полный план:\n${full}\n`;
  } else if (!shortList.length) {
    out += `План пока не сформирован.\n`;
  }

  return out;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function safeFileName(s) {
  return String(s || 'training')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'training';
}

if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    const text = buildDownloadText();
    const name = safeFileName(titleEl ? titleEl.textContent : 'training');
    downloadTextFile(`${name}.txt`, text);
  });
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

  // === НОРМАЛИЗАЦИЯ ВОЗРАСТА ===
  if (age_from !== null && age_from < 3) age_from = 3;
  if (age_to   !== null && age_to   < 3) age_to   = 3;

  // если указан только один возраст
  if (age_from !== null && age_to === null) age_to = age_from;

  // === НОРМАЛИЗАЦИЯ КЮ (1–11) ===
  if (kyu_from !== null) {
    if (kyu_from < 1) kyu_from = 1;
    if (kyu_from > 11) kyu_from = 11;
  }

  if (kyu_to !== null) {
    if (kyu_to < 1) kyu_to = 1;
    if (kyu_to > 11) kyu_to = 11;
  }

  // если указан только один кю
  if (kyu_from !== null && kyu_to === null) kyu_to = kyu_from;

  const duration_minutes = numOrNull(fd.get('duration_minutes'));

  const payload = {
    mode,
    age_from,
    age_to,
    kyu_from,
    kyu_to,
    goal: fd.get('goal') === 'training' ? 'normal' : fd.get('goal'),
    focus,
    duration_minutes
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

if (downloadBtn) downloadBtn.disabled = !hasDetails && !training.short_blocks;

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
    /*==========statistica knopki ===========*/
    fetch(API_URL + '?action=stat&event=generate_click').catch(()=>{});
    /*end   */
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
