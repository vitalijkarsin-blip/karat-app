/*************************************************
 * ADMIN MENU — загрузка AdminTables + роуты
 *************************************************/

const API_URL = "YOUR_WEB_APP_URL/exec"; 
let ADMIN_TABLES = null;

/*************************************************
 * Проверка роли
 *************************************************/
(function () {
  const data = localStorage.getItem("trainer");
  if (!data) { location.href = "login.html"; return; }

  const user = JSON.parse(data);
  if (user.role !== "admin") { 
    alert("Доступ запрещён");
    location.href = "index.html"; 
    return;
  }

  const info = document.getElementById("adminInfo");
  if (info) info.innerText = "👑 Руководитель: " + user.name;

  loadAdminTables();
})();

/*************************************************
 * Загрузка таблицы
 *************************************************/
function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      ADMIN_TABLES = json.tables;
      renderLinks();
    })
    .catch(err => console.error(err));
}

/*************************************************
 * Автоматическое создание <a href="...">
 *************************************************/
function renderLinks() {
  const blocks = document.querySelectorAll("[data-block]");

  blocks.forEach(block => {
    const blockName = block.dataset.block;

    // фильтруем строки таблицы
    const rows = ADMIN_TABLES.filter(r => r.block === blockName);

    rows.forEach(row => {
      const a = document.createElement("a");
      a.className = "btn";
      a.href = row.url;               // ❤️ А ВОТ ОНО — обычная ссылка!
      a.innerText = row.title;

      block.appendChild(a);
    });
  });
}

/*************************************************
 * Навигация
 *************************************************/
function goBack() {
  location.href = "admin_menu.html";
}

function logout() {
  localStorage.removeItem("trainer");
  location.href = "login.html";
}
