(function () {
  "use strict";

  function initSidebar() {
    var currentPath = window.location.pathname;
    var moduleLinks = document.querySelectorAll("#module-list .module-link");
    moduleLinks.forEach(function (link) {
      var mod = link.getAttribute("data-module");
      if (currentPath.startsWith("/" + mod + "/")) {
        link.classList.add("active");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initSidebar();
  });
})();
