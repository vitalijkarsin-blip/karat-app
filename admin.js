/*************************************************
 * ADMIN MENU — общее хранилище
 *************************************************/
const API_URL = "AKfycbydYQAoOMHlIAEZIsSUu3sNALYsltItXaBrc6qYHkUdmRvbfgIAutkhgV1Yowpw46WmFg/exec";
let ADMIN_TABLES = [];

/*************************************************
 * Автозагрузка AdminTables на ЛЮБОЙ странице
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  
  // Проверяем вход
  const data = localStorage.getItem("trainer");
  if (!data) return; // подменю тоже могут открываться

  const user = JSON.parse(data);

  // Загружаем таблицу ВСЕГДА
  loadAdminTables();

  // Выводим ФИО если есть поле
  const info = document.getElementById("adminInfo");
  if (info) info.innerText = "👑 Руководитель: " + (user.name || "");
});

/*************************************************
 * Загрузка AdminTables
 *************************************************/
function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      ADMIN_TABLES = json.tables || [];
    })
    .catch(() => {
      alert("Ошибка загрузки AdminTables");
    });
}

/*************************************************
 * Открытие ссылки
 *************************************************/
function openLink(id) {
  if (!ADMIN_TABLES || ADMIN_TABLES.length === 0) {
    alert("Таблица ссылок ещё не загружена");
    return;
  }

  const row = ADMIN_TABLES.find(r => r.id === id);

  if (!row) {
    document.body.innerHTML += 
      `<div style="padding:20px;color:red;">Ошибка: ссылка '${id}' не найдена.</div>`;
    return;
  }

  window.location.href = row.url;
}

/*************************************************
 * Навигация
 *************************************************/
function goBack() {
  window.location.href = "admin_menu.html";
}

function logout() {
  localStorage.removeItem("trainer");
  window.location.href = "login.html";
}
