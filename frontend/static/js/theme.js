(function () {
  "use strict";

  function updateThemeUI(isLight) {
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.querySelector("span").textContent = isLight ? "Modo Oscuro" : "Modo Claro";
      btn.querySelector("i").className = isLight ? "bi bi-sun-fill me-2" : "bi bi-moon-stars me-2";
    }
    var logo = document.getElementById("sidebar-logo");
    if (logo) logo.src = isLight ? "/static/img/logo_light.png" : "/static/img/logo_dark.png";
    var fav = document.getElementById("favicon-link");
    if (fav) fav.href = isLight ? "/static/img/favicon_light.png" : "/static/img/favicon_dark.png";
  }

  function refreshAllCharts() {
    var appMain = document.getElementById("app-main");
    if (!appMain) return;
  }

  function initThemeManager() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      document.documentElement.classList.toggle("light-mode");
      var isLight = document.documentElement.classList.contains("light-mode");
      updateThemeUI(isLight);
      localStorage.setItem("netowl-theme", isLight ? "light" : "dark");
    });
    var saved = localStorage.getItem("netowl-theme");
    updateThemeUI(saved === "light");
    if (saved === "light") document.documentElement.classList.add("light-mode");
  }

  document.addEventListener("DOMContentLoaded", function () {
    initThemeManager();
  });
})();
