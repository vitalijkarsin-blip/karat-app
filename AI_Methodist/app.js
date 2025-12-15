const form = document.getElementById('requestForm');
const result = document.getElementById('result');

const titleEl = document.getElementById('trainingTitle');
const durationEl = document.getElementById('trainingDuration');
const blocksEl = document.getElementById('trainingBlocks');

const detailsBtn = document.getElementById('detailsBtn');
const trainingDetails = document.getElementById('trainingDetails');
const detailsContent = document.getElementById('detailsContent');

const resetBtn = document.getElementById('resetBtn');
const output = document.getElementById('output');

/* === GAS API === */
const API_URL =
  'https://script.google.com/macros/s/AKfycbzcq37NZTXwh1CVcZGXtRgN59DVJtnRpO8-JICrXWuPnf6hU0vG0ZZ_uAuclb50p8su/exec';

/* ===== helpers ===== */

function parseKyu(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function buildPayload() {
  const fd = new FormData(form);

  return {
    kyu: parseKyu(fd.get('kyu_from')),
    goal: fd.get('goal') === 'training' ? 'normal' : fd.get('goal')
  };
}

async function callAPI(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => {
    if (v === null || v === undefined) return;
    params.set(k, v);
  });

  const res = await fetch(`${API_URL}?${params.toString()}`);
  return await res.json();
}

/* ===== submit ===== */

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = buildPayload();
  output.textContent = JSON.stringify(payload, null, 2);

  try {
    const data = await callAPI(payload);

    output.textContent += '\n\n--- SERVER ---\n';
    output.textContent += JSON.stringify(data, null, 2);

    if (data.status === 'ok') {
      renderTraining(data.training);
    } else {
      output.textContent += `\n\n[Ошибка]: ${data.message}`;
    }
  } catch (err) {
    output.textContent += `\n\n[Ошибка соединения]: ${err.message}`;
  }
});

/* ===== render ===== */

function renderTraining(training) {
  titleEl.textContent = training.title || 'Тренировка';

  // short_blocks → список
  blocksEl.innerHTML = '';
  if (training.short_blocks) {
    const parts = String(training.short_blocks)
      .split('→')
      .map(p => p.trim())
      .filter(Boolean);

    parts.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p;
      li.style.fontWeight = '600';
      blocksEl.appendChild(li);
    });
  }

  // полный план
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
  result.hidden = true;
  form.hidden = false;

  blocksEl.innerHTML = '';
  detailsContent.textContent = '';
  trainingDetails.hidden = true;
  detailsBtn.hidden = true;

  output.textContent = '';
});
