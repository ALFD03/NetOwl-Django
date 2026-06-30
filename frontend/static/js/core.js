(function () {
  "use strict";

  if (typeof ChartDataLabels !== "undefined") {
    Chart.register(ChartDataLabels);
    Chart.defaults.plugins.datalabels.display = false;
  }

  window.NetOwl = {
    churnLineChart: null, winbackBarChart: null, arpuBarChart: null,
    aporteReactBarChart: null, reemplazoLineChart: null, adicionesBarChart: null,
    cortesReactChart: null, kmSurvivalChartS: null,
    activosInicioChart: null, activosFinalChart: null,
    suspensionChart: null,
    dimChartInstances: [],
    allHistoricalPeriods: [],
  };

  var N = window.NetOwl;

  N.getCsrfToken = function () {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute("content") : "";
  };

  N.showToast = function (msg, type) {
    var el = document.getElementById("status-toast");
    var msgEl = document.getElementById("toast-message");
    if (!el || !msgEl) return;
    msgEl.textContent = msg;
    el.classList.remove("bg-success", "bg-danger", "bg-warning", "bg-info", "bg-dark");
    el.classList.add(type === "success" ? "bg-success" : type === "error" ? "bg-danger" : type === "warning" ? "bg-warning" : "bg-dark");
    new bootstrap.Toast(el, { delay: 5000 }).show();
  };

  N.showLoading = function (t) {
    var overlay = document.getElementById("loading-overlay");
    var text = document.getElementById("loading-text");
    if (overlay) {
      if (text) text.textContent = t || "Procesando...";
      overlay.classList.remove("d-none");
    }
  };

  N.hideLoading = function () {
    var overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.classList.add("d-none");
  };

  window.showLoading = N.showLoading;
  window.hideLoading = N.hideLoading;

  N.chartOpts = function (specific) {
    return Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: "easeOutQuart" } }, specific || {});
  };

  N.lineOpts = function (gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  };

  N.barOpts = function (gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  };

  N.loadComparisonPeriods = function () {
    fetch("/subscriptions/api/periods/").then(function (r) { return r.ok ? r.json() : []; }).then(function (d) {
      var sel = document.getElementById("comparison-period-select");
      if (!sel) return;
      sel.innerHTML = '<option value="">Periodo</option>';
      (d.periods || []).forEach(function (p) {
        var o = document.createElement("option");
        o.value = p; o.textContent = p; sel.appendChild(o);
      });
    }).catch(function () {});
  };

  /* ----- Modal Detail (shared between dashboard & results) ----- */
  N.initResultsDetailsModal = function () {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".view-details-btn");
      if (btn && btn.dataset.periodo) N.openPeriodDetailsModal(btn.dataset.periodo);
    });
  };

  N.openPeriodDetailsModal = function (periodo) {
    N.showLoading("Consultando " + periodo + "...");
    fetch("/subscriptions/api/results/" + periodo + "/")
      .then(function (r) { N.hideLoading(); if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (d) {
        var el = document.getElementById("detailsModal");
        if (!el) return;
        document.getElementById("modal-period-title").textContent = d.periodo;
        N.renderModalSummary(d.summary || {}, {});
        N.renderModalDimensions(d.dimensions || {});
        new bootstrap.Modal(el).show();
      })
      .catch(function () { N.hideLoading(); N.showToast("Error al obtener detalle", "error"); });
  };

  N.renderModalSummary = function (summary) {
    var c = document.getElementById("modal-summary-container");
    if (!c) return;
    if (!summary || !Object.keys(summary).length) {
      c.innerHTML = '<div class="col-12 text-center py-3" style="color:var(--text-secondary)">Sin resumen</div>';
      return;
    }
    var f = function (v, d) { return (v || 0).toLocaleString(undefined, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
    var pct = function (v) { return f(v, 2) + "%"; };
    var usd = function (v) { return "$" + f(v, 2); };
    var intl = function (v) { return f(v, 0); };
    var s = summary;
    var html = '<div class="col-12"><div class="card border-1" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3"><table class="table table-sm mb-0 table-modal-sum" style="font-size:0.8rem"><tbody>';
    html += '<tr><td class="modal-label ps-0">Base Inicio</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.activos_inicio) + '</td><td class="modal-label ps-3">Base Final</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.activos_final) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Nuevos</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.nuevos_mes) + '</td><td class="modal-label ps-3">Bajas Netas</td><td class="text-end modal-value-danger">' + intl(s.bajas_netas) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Bajas Brutas</td><td class="text-end modal-value-danger">' + intl(s.bajas_brutas) + '</td><td class="modal-label ps-3">Churn Neto</td><td class="text-end modal-value-danger">' + pct(s.churn_neto_pct) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Churn Bruto</td><td class="text-end modal-value-danger">' + pct(s.churn_bruto_pct) + '</td><td class="modal-label ps-3">ARPU</td><td class="text-end modal-value-success">' + usd(s.arpu) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Total Billing</td><td class="text-end modal-value-accent">' + usd(s.total_billing) + '</td><td class="modal-label ps-3">Corte Impago</td><td class="text-end modal-value-warning">' + intl(s.corte_impagado) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Winback</td><td class="text-end modal-value-success">' + pct(s.tasa_winback_pct) + '</td><td class="modal-label ps-3">Reactivaciones Totales</td><td class="text-end modal-value-success">' + intl(s.reactivaciones) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">React Canceladas</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_6_churn) + '</td><td class="modal-label ps-3">React + 30 Dias</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_8_30days) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">React En Pausa</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_4_paused) + '</td><td class="modal-label ps-3">Reactivaciones Auditoras</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_val) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">React En Pausa del periodo</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_4_P) + '</td><td class="modal-label ps-3">React En Pausa de Otros periodos</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_4_H) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Aporte React.</td><td class="text-end modal-value-accent">' + pct(s.tasa_aporte_react_pct) + '</td><td class="modal-label ps-3">Indice Reemplazo</td><td class="text-end modal-value-accent">' + pct(s.indice_reemplazo_react_pct) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Adic. Netas</td><td class="text-end modal-value-success">' + intl(s.adiciones_netas) + '</td><td class="modal-label ps-3">Adic. Brutas</td><td class="text-end modal-value-success">' + intl(s.adiciones_brutas) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Porcentaje de Suspenciones</td><td class="text-end modal-value-success">' + pct(s.porcentaje_suspensiones) + '</td><td class="modal-label ps-0">Total Inactivos</td><td class="text-end modal-value-success">' + intl(s.total_inactivos) + '</td></tr>';
    html += '</tbody></table></div></div></div>';
    c.innerHTML = html;
  };





  N.renderModalDimensions = function (dimensions) {
    var c = document.getElementById("modal-dimensions-container");
    if (!c) return;
    if (!dimensions || !Object.keys(dimensions).length) {
      c.innerHTML = '<div class="col-12 text-center py-3" style="color:var(--text-secondary)">Sin dimensiones</div>';
      return;
    }
    var nameMap = { "zona": "Zona Geografica", "sucursal": "Sucursal", "producto": "Producto / Plan", "municipio": "Municipio", "campana": "Campana" };
    var cols = [
      { k: "activos_inicio", label: "Act.Ini", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "activos_final", label: "Act.Fin", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "nuevos", label: "Nuevos", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "bajas_netas", label: "Baj.Net", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "bajas_brutas", label: "Baj.Bru", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "churn_neto_pct", label: "Ch.Net%", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "churn_bruto_pct", label: "Ch.Bru%", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "reactivaciones", label: "Total. React.", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_val", label: "React. Audit", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_4_P", label: "React. En Pausa peri", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_4_H", label: "React. En pausa hist", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_4_paused", label: "React. En pausa", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_6_churn", label: "React. Canceladas", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "react_8_30days", label: "React. +30 dias", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "tasa_winback_pct", label: "Winback", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "arpu", label: "ARPU", fmt: function (v) { return "$" + (v || 0).toFixed(2); } },
      { k: "total_billing", label: "Billing", fmt: function (v) { return "$" + Math.round(v || 0).toLocaleString(); } },
      { k: "tasa_aporte_react_pct", label: "Ap.Reac", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "indice_reemplazo_react_pct", label: "Ind.Reem", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "adiciones_netas", label: "Ad.Net", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "adiciones_brutas", label: "Ad.Bru", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "corte_impagado", label: "Corte", fmt: function (v) { return (v || 0).toLocaleString(); } },
      { k: "porcentaje_suspensiones", label: "Susp.%", fmt: function (v) { return (v || 0).toFixed(2) + "%"; } },
    ];
    var html = "";
    Object.keys(dimensions).forEach(function (key) {
      var items = dimensions[key] || [];
      var title = nameMap[key] || key.toUpperCase();
      html += '<div class="col-12 mb-3"><div class="card" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-header bg-transparent py-2"><span class="fw-bold" style="color:var(--text-primary)"><i class="bi bi-tag-fill me-2 modal-value-accent"></i>' + title + '</span></div><div class="card-body p-0"><div class="table-responsive" style="max-height:400px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-modal-dim" style="font-size:0.75rem;width:100%"><thead><tr>';
      html += '<th class="sticky-col sticky-header" style="left:0;min-width:120px">Valor</th>';
      cols.forEach(function (col) { html += '<th class="text-end sticky-header" style="min-width:75px">' + col.label + '</th>'; });
      html += '</tr></thead><tbody>';
      items.sort(function (a, b) { return (b.activos_final || 0) - (a.activos_final || 0); });
      items.forEach(function (item) {
        var val = (!item.valor || item.valor === "None") ? "N/A" : item.valor;
        html += '<tr><td class="sticky-col fw-medium text-truncate" style="left:0;max-width:120px;color:var(--text-primary)" title="' + val + '">' + val + '</td>';
        cols.forEach(function (col) { html += '<td class="text-end" style="color:var(--text-primary)">' + col.fmt(item[col.k]) + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table></div></div></div></div>';
    });
    c.innerHTML = html;
  };
})();
