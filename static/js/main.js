/**
 * main.js — Funcionalidad JavaScript de Churn Rate Analyzer
 *
 * IIFE (Immediately Invoked Function Expression) para evitar contaminar
 * el ámbito global. Expone window.showLoading / hideLoading para el
 * overlay de carga.
 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    // ------------------------------------------------------------------
    // Overlay de carga (loading spinner)
    // ------------------------------------------------------------------
    /**
     * showLoading() / hideLoading()
     * Muestra u oculta el overlay #loading-overlay quitando/agregando la
     * clase Bootstrap d-none. Se exponen globalmente para que puedan ser
     * llamados desde cualquier contexto (ej. eventos AJAX).
     */
    var overlay = document.getElementById("loading-overlay");
    if (overlay) {
      window.showLoading = function () {
        overlay.classList.remove("d-none");
      };
      window.hideLoading = function () {
        overlay.classList.add("d-none");
      };
    }

    // ------------------------------------------------------------------
    // Auto-show loading al enviar formularios con data-loading
    // ------------------------------------------------------------------
    /**
     * Escucha el evento submit de todo formulario que tenga el atributo
     * data-loading. Al enviarse, invoca showLoading() si está disponible.
     */
    document.querySelectorAll("form[data-loading]").forEach(function (form) {
      form.addEventListener("submit", function () {
        if (typeof window.showLoading === "function") {
          window.showLoading();
        }
      });
    });

    // ------------------------------------------------------------------
    // Inicialización de Flatpickr (selector de mes)
    // ------------------------------------------------------------------
    /**
     * Configura Flatpickr en modo mes-año sobre inputs con clase
     * .month-picker. Usa locale español, formato interno Y-m y
     * formato alternativo legible (ej. "Enero 2025").
     */
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

    // ------------------------------------------------------------------
    // Inicialización de tooltips de Bootstrap
    // ------------------------------------------------------------------
    /**
     * Activa tooltips de Bootstrap 5 para todos los elementos que tengan
     * el atributo data-bs-toggle="tooltip".
     */
    var tooltipTriggerList = [].slice.call(
      document.querySelectorAll('[data-bs-toggle="tooltip"]')
    );
    tooltipTriggerList.map(function (el) {
      return new bootstrap.Tooltip(el);
    });
  });
})();
