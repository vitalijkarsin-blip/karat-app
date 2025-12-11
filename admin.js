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
 * Загрузка AdminTables
 *************************************************/
function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      ADMIN_TABLES = json.tables;
      console.log("AdminTables загружены:", ADMIN_TABLES);
    })
    .catch(err => console.error(err));
}

/*************************************************
 * Открытие ссылки по ID (без подтверждения)
 *************************************************/
function openLink(id) {
  if (!ADMIN_TABLES) {
    alert("Данные ещё загружаются...");
    return;
  }

  const row = ADMIN_TABLES.find(r => String(r.id) === String(id));

  if (!row || !row.url) {
    alert("Ссылка не найдена: " + id);
    return;
  }

  // Открываем ссылку как будто нажали реальную кнопку
  const a = document.createElement("a");
  a.href = row.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/*************************************************
 * Навигация
 *************************************************/
function goBack() {
  location.href = "admin_menu.html";
}

function openPage(page) {
  location.href = page + ".html";
}

function logout() {
  localStorage.removeItem("trainer");
  location.href = "login.html";
}
