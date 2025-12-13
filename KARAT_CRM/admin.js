/*************************************************
 * ADMIN — общие вещи
 *************************************************/

const API_URL = "https://script.google.com/macros/s/AKfycbydYQAoOMHlIAEZIsSUu3sNALYsltItXaBrc6qYHkUdmRvbfgIAutkhgV1Yowpw46WmFg/exec";   // <-- сюда твой URL /exec
let ADMIN_TABLES = [];

/*************************************************
 * Загружаем AdminTables на всех страницах админа
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const data = localStorage.getItem("trainer");
  if (!data) return;

  const user = JSON.parse(data);

  const info = document.getElementById("adminInfo");
  if (info) info.innerText = "👑 Руководитель: " + (user.name || "");

  loadAdminTables();
});

function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      ADMIN_TABLES = json.tables || [];
      console.log("AdminTables:", ADMIN_TABLES);
    })
    .catch(err => {
      console.log("Ошибка загрузки AdminTables:", err);
    });
}

/*************************************************
 * Открыть ссылку по id (для кнопок в меню)
 *************************************************/
function openLink(id) {
  if (!ADMIN_TABLES.length) return;

  const row = ADMIN_TABLES.find(r => r.id === id);
  if (!row) return;

  // просто переходим на таблицу
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
