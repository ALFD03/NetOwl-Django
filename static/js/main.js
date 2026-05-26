(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // Loading overlay
    var overlay = document.getElementById("loading-overlay");
    if (overlay) {
      window.showLoading = function () {
        overlay.classList.remove("d-none");
      };
      window.hideLoading = function () {
        overlay.classList.add("d-none");
      };
    }

    // Auto-show loading on form submits
    document.querySelectorAll("form[data-loading]").forEach(function (form) {
      form.addEventListener("submit", function () {
        if (typeof window.showLoading === "function") {
          window.showLoading();
        }
      });
    });

    // Flatpickr: month picker
    var monthInput = document.querySelector(".month-picker");
    if (monthInput && typeof flatpickr !== "undefined") {
      flatpickr(monthInput, {
        plugins: [],
        locale: "es",
        dateFormat: "Y-m",
        altInput: true,
        altFormat: "F Y",
        disableMobile: true,
        allowInput: false,
        clickOpens: true,
        onChange: function (selectedDates, dateStr) {
          monthInput.value = dateStr;
        },
      });
    }

    // Tooltips
    var tooltipTriggerList = [].slice.call(
      document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function (el) {
      return new bootstrap.Tooltip(el);
    });
  });
})();
