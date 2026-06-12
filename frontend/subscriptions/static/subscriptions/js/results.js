(function () {
  "use strict";

  var N = window.NetOwl;
  var allHistoricalPeriods = [];

  function renderResultsTable(periods) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!periods.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periods.forEach(function (r) {
      var cn = r.churn_neto_pct || 0;
      var churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
      html += '<tr><td class="fw-semibold">' + r.periodo_reporte + '</td><td class="text-end">' + (r.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (r.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (r.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">$' + (r.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + r.periodo_reporte + '"><i class="bi bi-eye"></i></button></td></tr>';
    });
    tbody.innerHTML = html;
  }

  function setupSearchFilter() {
    var input = document.getElementById("search-results-input");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      renderResultsTable(allHistoricalPeriods.filter(function (r) { return r.periodo_reporte.toLowerCase().includes(q); }));
    });
  }

  function loadResultsData() {
    fetch("/subscriptions/api/results/").then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      allHistoricalPeriods = d.periods || [];
      renderResultsTable(allHistoricalPeriods);
      setupSearchFilter();
    }).catch(function () { N.showToast("Error cargando historial", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("results-table-tbody")) {
      N.initResultsDetailsModal();
      loadResultsData();
    }
  });
})();
