/*************************************************
 * ADMIN MENU — проверки + загрузка AdminTables
 *************************************************/

const API_URL = "YOUR_WEB_APP_URL/exec"; 
let ADMIN_TABLES = null;

/*************************************************
 * Проверка роли администратора
 *************************************************/
(function () {
  const data = localStorage.getItem("trainer");

  if (!data) {
    location.href = "login.html";
    return;
  }

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
 * Загрузка AdminTables и сохранение в localStorage
 *************************************************/
function loadAdminTables() {
  fetch(API_URL + "?admintables=1")
    .then(r => r.json())
    .then(json => {
      ADMIN_TABLES = json.tables;
      
      // Сохраняем таблицу локально, чтобы ved_*.html могли её использовать
      localStorage.setItem("adminTables", JSON.stringify(ADMIN_TABLES));

      console.log("AdminTables загружены:", ADMIN_TABLES);
    })
    .catch(err => console.error(err));
}

/*************************************************
 * Открытие формы или страницы (локальной)
 *************************************************/
function openPage(page) {
  location.href = page + ".html";
}

/*************************************************
 * Открытие внешней ссылки (если нужно где-то)
 * ДЕЛАТЬ ТАК НЕ БУДЕМ ДЛЯ ВЕДОМОСТЕЙ,
 * оставлено для совместимости.
 *************************************************/
function openExternal(url) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/*************************************************
 * Назад в меню
 *************************************************/
function goBack() {
  location.href = "admin_menu.html";
}

/*************************************************
 * Выход
 *************************************************/
function logout() {
  localStorage.removeItem("trainer");
  location.href = "login.html";
}
