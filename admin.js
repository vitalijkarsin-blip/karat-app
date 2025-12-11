/*************************************************
 * ADMIN MENU — загрузка AdminTables + роуты
 *************************************************/

const API_URL = "YOUR_WEB_APP_URL/exec";  // <-- сюда вставь свой URL

let ADMIN_TABLES = null;

/*************************************************
 * Проверка авторизации и роли
 *************************************************/
(function() {
  const trainerData = localStorage.getItem("trainer");
  if (!trainerData) {
    window.location.href = "login.html";
    return;
  }

  const trainer = JSON.parse(trainerData);
  
  if (trainer.role !== "admin") {
    alert("Доступ только для администратора");
    window.location.href = "index.html";
    return;
  }

  // отобразим имя
  const info = document.getElementById("adminInfo");
  if (info) info.innerText = "👑 Руководитель: " + trainer.name;

  loadAdminTables();
})();

/*************************************************
 * Загрузка AdminTables
 *************************************************/
function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      if (!json.ok) {
        console.error("AdminTables ERROR:", json);
        return;
      }
      ADMIN_TABLES = json.tables;
      console.log("AdminTables loaded:", ADMIN_TABLES);
    })
    .catch(err => console.error(err));
}

/*************************************************
 * Открытие ссылки по ID из AdminTables
 *************************************************/
function openLink(id) {
  if (!ADMIN_TABLES) {
    alert("Данные ещё загружаются...");
    return;
  }

  const row = ADMIN_TABLES.find(r => String(r.id) === String(id));

  if (!row) {
    alert("Ссылка не найдена: " + id);
    return;
  }

  if (!row.url) {
    alert("Для пункта нет URL");
    return;
  }

  window.open(row.url, "_blank");
}

/*************************************************
 * Навигация между подменю
 *************************************************/

function openPage(page) {
  window.location.href = page + ".html";
}

function goBack() {
  window.location.href = "admin_menu.html";
}

function logout() {
  localStorage.removeItem("trainer");
  window.location.href = "login.html";
}

