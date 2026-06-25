(function () {
  "use strict";

  var N = window.NetOwl;
  var allHistoricalPeriods = [];

  function renderResultsTable(periods) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!periods.length) { tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periods.forEach(function (r) {
      var ef = r.efectividad || [];
      var ef3 = ef.find(function(x) { return x.etapa === "etapa_3_factibilidad"; }) || {};
      var ef4 = ef.find(function(x) { return x.etapa === "etapa_4_adecuaciones"; }) || {};
      var ef5 = ef.find(function(x) { return x.etapa === "etapa_5_gpi"; }) || {};
      var efv = ef.find(function(x) { return x.etapa === "ventas"; }) || {};
      var prob = r.probabilidad_etapa8_perdidos?.resumen || {};
      var rescate = r.rescate_perdidos || {};
      var ti = r.tiempo_instalacion || {};

      html += '<tr>' +
        '<td class="fw-semibold">' + r.periodo + '</td>' +
        '<td class="text-end">' + (r.total_clientes || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-success">' + (r.ganados || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-danger">' + (r.perdidos || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-warning">' + (r.etapa_8_count || 0).toLocaleString() + '</td>' +
        '<td class="text-end">' + (ti.horas_promedio ? Number(ti.horas_promedio).toFixed(1) : 0) + '</td>' +
        '<td class="text-end">' + (ef3.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (ef4.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (ef5.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (efv.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (rescate.pct_rescate || 0).toFixed(1) + '%</td>' +
        '<td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + r.periodo + '"><i class="bi bi-eye"></i></button></td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  function setupSearchFilter() {
    var input = document.getElementById("search-results-input");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      renderResultsTable(allHistoricalPeriods.filter(function (r) { return r.periodo.toLowerCase().includes(q); }));
    });
  }

  function loadResultsData() {
    fetch("/crm/api/results/").then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      allHistoricalPeriods = d.periods || [];
      renderResultsTable(allHistoricalPeriods);
      setupSearchFilter();
    }).catch(function () { N.showToast("Error cargando historial CRM", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("results-table-tbody")) {
      N.initCRMResultsDetailsModal();
      loadResultsData();
    }
  });
})();
