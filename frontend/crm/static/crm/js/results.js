(function () {
  "use strict";

  var N = window.NetOwl;
  var allHistoricalPeriods = [];
  function colorTiempo(v) { return v <= 72 ? "text-success" : v <= 120 ? "text-warning" : "text-danger"; }
  function colorEfectividad(v) { return v <= 30 ? "text-success" : v <= 60 ? "text-warning" : "text-danger"; }
  function colorProb(v) { return v <= 30 ? "text-success" : v <= 60 ? "text-warning" : "text-danger"; }
  function colorRescate(v) { return v <= 30 ? "text-danger" : v <= 60 ? "text-warning" : "text-success"; }

  function renderResultsTable(periods) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!periods.length) { tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
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

      var tiHoras = ti.horas_promedio ? Number(ti.horas_promedio) : 0;
      var ef3v = ef3.efectividad_pct || 0;
      var ef4v = ef4.efectividad_pct || 0;
      var ef5v = ef5.efectividad_pct || 0;
      var efvv = efv.efectividad_pct || 0;
      var rescv = rescate.pct_rescate || 0;
      html += '<tr>' +
        '<td class="fw-semibold">' + r.periodo + '</td>' +
        '<td class="text-end">' + (r.total_clientes || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-success">' + (r.ganados || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-danger">' + (r.perdidos || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-warning">' + (r.etapa_8_count || 0).toLocaleString() + '</td>' +
        '<td class="text-end fw-bold ' + colorTiempo(tiHoras) + '">' + tiHoras.toFixed(1) + '</td>' +
        '<td class="text-end fw-bold ' + colorEfectividad(ef3v) + '">' + ef3v.toFixed(1) + '%</td>' +
        '<td class="text-end fw-bold ' + colorEfectividad(ef4v) + '">' + ef4v.toFixed(1) + '%</td>' +
        '<td class="text-end fw-bold ' + colorEfectividad(ef5v) + '">' + ef5v.toFixed(1) + '%</td>' +
        '<td class="text-end fw-bold ' + colorEfectividad(efvv) + '">' + efvv.toFixed(1) + '%</td>' +
        '<td class="text-end fw-bold ' + colorRescate(rescv) + '">' + rescv.toFixed(1) + '%</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  // -----------------------------------------------------------------------
  // Detail sections
  // -----------------------------------------------------------------------

  function renderTiempoInstalacion(ti) {
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-clock me-2"></i>Tiempo Instalación</h5></div><div class="card-body"><div class="row g-3">';
    function v(val, unit) { return (val !== undefined && val !== null && val !== 0) ? Number(val).toFixed(1) + unit : "0" + unit; }
    function card(label, value, cls) {
      return '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">' + label + '</div><div class="fs-5 fw-bold ' + cls + '">' + value + '</div></div></div></div>';
    }
    html += card("Total Instalados", (ti.total_instalados || 0).toLocaleString(), "text-success");
    html += card("Promedio", v(ti.horas_promedio, "h"), colorTiempo(ti.horas_promedio || 0));
    html += card("Mediana", v(ti.horas_mediana, "h"), colorTiempo(ti.horas_mediana || 0));
    html += card("P25", v(ti.horas_p25, "h"), colorTiempo(ti.horas_p25 || 0));
    html += card("P75", v(ti.horas_p75, "h"), colorTiempo(ti.horas_p75 || 0));
    html += card("Mínimo", v(ti.horas_min, "h"), colorTiempo(ti.horas_min || 0));
    html += card("Máximo", v(ti.horas_max, "h"), colorTiempo(ti.horas_max || 0));
    html += card("Desv. Estándar", v(ti.horas_std, "h"), colorTiempo(ti.horas_std || 0));
    html += '</div></div></div>';
    return html;
  }

  function renderTiempoPorEtapa(tpe) {
    var etapas = ["etapa_1_contacto","etapa_2_recepcion","etapa_3_factibilidad","etapa_4_adecuaciones","etapa_5_gpi","etapa_6_contratistas","etapa_8_devueltos","etapa_9_disponibles","etapa_10_proyectos"];
    var etapaLabels = ["1. Contacto","2. Recepción","3. Factibilidad","4. Adecuaciones","5. GPI","6. Contratistas","8. Devueltos","9. Disponibles","10. Proyectos"];
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-clock-history me-2"></i>Tiempo por Etapa</h5></div><div class="card-body"><div class="chart-container mb-4" style="position:relative;height:300px"><canvas id="detail-tiempo-chart"></canvas></div><div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Etapa</th><th class="text-end">Promedio (h)</th><th class="text-end">Mediana (h)</th><th class="text-end">Mínimo (h)</th><th class="text-end">Máximo (h)</th><th class="text-end">Std (h)</th><th class="text-end">Movimientos</th></tr></thead><tbody>';
    etapas.forEach(function (e, i) {
      var d = tpe[e];
      if (!d) { html += '<tr><td>' + etapaLabels[i] + '</td><td class="text-end" colspan="6" class="text-muted">-</td></tr>'; return; }
      html += '<tr><td>' + etapaLabels[i] + '</td>' +
        '<td class="text-end">' + (d.tiempo_promedio_horas ? Number(d.tiempo_promedio_horas).toFixed(1) : "-") + '</td>' +
        '<td class="text-end">' + (d.tiempo_mediana_horas ? Number(d.tiempo_mediana_horas).toFixed(1) : "-") + '</td>' +
        '<td class="text-end">' + (d.tiempo_min_horas ? Number(d.tiempo_min_horas).toFixed(1) : "-") + '</td>' +
        '<td class="text-end">' + (d.tiempo_max_horas ? Number(d.tiempo_max_horas).toFixed(1) : "-") + '</td>' +
        '<td class="text-end">' + (d.tiempo_std_horas ? Number(d.tiempo_std_horas).toFixed(1) : "-") + '</td>' +
        '<td class="text-end">' + (d.total_movimientos || 0) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    return { html: html, etapas: etapas, etapaLabels: etapaLabels, data: tpe };
  }

  function renderEfectividad(ef) {
    if (!ef || !ef.length) return { html: "" };
    var efLabels = { "etapa_3_factibilidad": "Etapa 3 Factibilidad", "etapa_4_adecuaciones": "Etapa 4 Adecuaciones", "etapa_5_gpi": "Etapa 5 GPI", "ventas": "Ventas (Etapa 8)" };
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-check-circle me-2"></i>Efectividad por Etapa</h5></div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Etapa</th><th class="text-end">Salidas</th><th class="text-end">Retornos</th><th class="text-end">Exitosos</th><th class="text-end">Fallidos</th><th class="text-end">Retornan</th><th class="text-end">P. Directa</th><th class="text-end">Efectividad</th></tr></thead><tbody>';
    ef.forEach(function (e) {
      html += '<tr><td>' + (efLabels[e.etapa] || e.etapa) + '</td>' +
        '<td class="text-end">' + (e.total_salidas || 0).toLocaleString() + '</td>' +
        '<td class="text-end">' + (e.retornos || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-success fw-bold">' + (e.exitosos ?? 0).toLocaleString() + '</td>' +
        '<td class="text-end text-danger fw-bold">' + (e.fallidos ?? 0).toLocaleString() + '</td>' +
        '<td class="text-end text-warning fw-bold">' + (e.retornan ?? 0).toLocaleString() + '</td>' +
        '<td class="text-end text-danger">' + (e.perdida_directa ?? 0).toLocaleString() + '</td>' +
        '<td class="text-end fw-bold ' + colorEfectividad(e.efectividad_pct || 0) + '">' + (e.efectividad_pct || 0).toFixed(1) + '%</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    return { html: html };
  }

  function renderEfectividadEstadisticas(est) {
    if (!est || !est.length) return "";
    var efLabels = { "etapa_3_factibilidad": "Etapa 3", "etapa_4_adecuaciones": "Etapa 4", "etapa_5_gpi": "Etapa 5", "ventas": "Ventas" };
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-bar-chart me-2"></i>Efectividad por Cliente (Estadísticas)</h5></div><div class="card-body"><div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Etapa</th><th class="text-end">Clientes</th><th class="text-end">Salidas</th><th class="text-end">Retornos</th><th class="text-end">Promedio</th><th class="text-end">Std</th></tr></thead><tbody>';
    est.forEach(function (e) {
      html += '<tr><td>' + (efLabels[e.etapa] || e.etapa) + '</td>' +
        '<td class="text-end">' + (e.total_clientes || 0).toLocaleString() + '</td>' +
        '<td class="text-end">' + (e.total_salidas || 0).toLocaleString() + '</td>' +
        '<td class="text-end">' + (e.total_retornos || 0).toLocaleString() + '</td>' +
        '<td class="text-end fw-bold">' + (e.efectividad_promedio || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (e.efectividad_std || 0).toFixed(1) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    return html;
  }

  function renderProbabilidad(prob, dimensions) {
    var pr = prob.resumen || {};
    var motivos = prob.motivos_perdida || [];
    var devolverItems = (dimensions && dimensions.devolver_oportunidad) || [];
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-pie-chart me-2"></i>Probabilidad Etapa 8 y Pérdidas</h5></div><div class="card-body">';
    html += '<div class="row g-3 mb-3">';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Etapa 8</div><div class="fs-4 fw-bold ' + colorProb(pr.pct_etapa8 || 0) + '">' + (pr.pct_etapa8 || 0).toFixed(1) + '%</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Perdidos</div><div class="fs-4 fw-bold ' + colorProb(pr.pct_perdidos || 0) + '">' + (pr.pct_perdidos || 0).toFixed(1) + '%</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Total Clientes</div><div class="fs-4 fw-bold text-success">' + (pr.total_clientes || 0).toLocaleString() + '</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Etapa 8 Count</div><div class="fs-4 fw-bold text-warning">' + (pr.count_etapa8 || 0).toLocaleString() + '</div></div></div></div>';
    html += '</div>';

    if (devolverItems.length) {
      html += '<h6 class="text-muted mb-2">Motivos de Devolución (Etapa 8)</h6><div class="table-responsive" style="max-height:250px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Motivo</th><th class="text-end">Clientes</th><th class="text-end">% Etapa 8</th></tr></thead><tbody>';
      devolverItems.forEach(function (item) {
        html += '<tr><td>' + (item.valor || "N/A") + '</td><td class="text-end">' + (item.total_clientes || 0).toLocaleString() + '</td><td class="text-end fw-bold ' + colorProb(item.pct_etapa8 || 0) + '">' + (item.pct_etapa8 || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (motivos.length) {
      html += '<h6 class="text-muted mb-2 mt-2">Motivos de Pérdida</h6><div class="table-responsive" style="max-height:250px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Motivo</th><th class="text-end">Cantidad</th><th class="text-end">%</th></tr></thead><tbody>';
      motivos.forEach(function (m) {
        html += '<tr><td>' + (m.motivo_perdida || "N/A") + '</td><td class="text-end">' + (m.cantidad || 0).toLocaleString() + '</td><td class="text-end">' + (m.pct || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '</div></div>';
    return html;
  }

  function renderRescate(resc) {
    return '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-arrow-repeat me-2"></i>Rescate de Perdidos</h5></div><div class="card-body"><div class="row g-3">' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Total Perdidos</div><div class="fs-4 fw-bold text-danger">' + (resc.total_perdidos || 0).toLocaleString() + '</div></div></div></div>' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Rescatados</div><div class="fs-4 fw-bold text-success">' + (resc.rescatados || 0).toLocaleString() + '</div></div></div></div>' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Rescate</div><div class="fs-4 fw-bold ' + colorRescate(resc.pct_rescate || 0) + '">' + (resc.pct_rescate || 0).toFixed(1) + '%</div></div></div></div>' +
    '</div></div></div>';
  }

  function renderDimensiones(dimensions) {
    if (!dimensions || !Object.keys(dimensions).length) return "";
    var nameMap = { municipio: "Municipio", campana: "Campaña", sucursal: "Sucursal", vendedor: "Vendedor", equipo_ventas: "Equipo Ventas" };
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-layers me-2"></i>Desglose por Dimensiones</h5></div><div class="card-body">';
    var excludeKeys = { devolver_oportunidad: 1, motivo_perdida: 1 };
    Object.keys(dimensions).forEach(function (key) {
      if (excludeKeys[key]) return;
      var items = dimensions[key] || [];
      var title = nameMap[key] || key;
      html += '<div class="mb-3"><h6 class="text-muted">' + title + '</h6><div class="table-responsive" style="max-height:300px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Valor</th><th class="text-end">Clientes</th><th class="text-end">Ganados</th><th class="text-end">Perdidos</th><th class="text-end">% E8</th><th class="text-end">% Perd</th><th class="text-end">Ti Inst (h)</th><th class="text-end">Rescate %</th></tr></thead><tbody>';
      items.forEach(function (item) {
        html += '<tr><td>' + (item.valor || "N/A") + '</td>' +
          '<td class="text-end">' + (item.total_clientes || 0).toLocaleString() + '</td>' +
          '<td class="text-end text-success">' + (item.ganados || 0).toLocaleString() + '</td>' +
          '<td class="text-end text-danger">' + (item.perdidos || 0).toLocaleString() + '</td>' +
          '<td class="text-end fw-bold ' + colorProb(item.pct_etapa8 || 0) + '">' + (item.pct_etapa8 || 0).toFixed(1) + '%</td>' +
          '<td class="text-end fw-bold ' + colorProb(item.pct_perdidos || 0) + '">' + (item.pct_perdidos || 0).toFixed(1) + '%</td>' +
          '<td class="text-end fw-bold ' + colorTiempo(item.tiempo_instalacion_promedio_horas || 0) + '">' + (item.tiempo_instalacion_promedio_horas || 0).toFixed(1) + '</td>' +
          '<td class="text-end fw-bold ' + colorRescate(item.pct_rescate_perdidos || 0) + '">' + (item.pct_rescate_perdidos || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });
    html += '</div></div>';
    return html;
  }

  // -----------------------------------------------------------------------
  // Chart rendering
  // -----------------------------------------------------------------------

  var _detailChart = null;

  function renderTiempoChart(etapas, etapaLabels, data) {
    var canvas = document.getElementById("detail-tiempo-chart");
    if (!canvas) return;
    if (_detailChart) { _detailChart.destroy(); _detailChart = null; }

    var labels = [], vals = [], palette = ["#2563eb","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16"];
    etapas.forEach(function (e, i) {
      var d = data[e];
      if (d && d.tiempo_promedio_horas) { labels.push(etapaLabels[i]); vals.push(Number(d.tiempo_promedio_horas)); }
    });
    if (!labels.length) return;

    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var tickColor = isLight ? "#64748b" : "#94a3b8";

    _detailChart = new Chart(canvas, {
      type: "bar",
      data: { labels: labels, datasets: [{ data: vals, backgroundColor: palette.slice(0, vals.length), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }, x: { grid: { display: false }, ticks: { color: tickColor } } } }
    });
  }

  // -----------------------------------------------------------------------
  // Load & render all
  // -----------------------------------------------------------------------

  function loadResultsData() {
    fetch("/crm/api/results/")
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (d) {
        allHistoricalPeriods = d.periods || [];
        renderResultsTable(allHistoricalPeriods);
        return fetch("/crm/api/results/completo/");
      })
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (detail) {
        renderDetail(detail);
      })
      .catch(function () { N.showToast("Error cargando datos CRM", "error"); });
  }

  function renderDetail(detail) {
    var container = document.getElementById("results-detail-container");
    if (!container) return;

    var s = detail.summary || {};
    var d = detail.dimensions || {};
    var html = "";

    html += renderTiempoInstalacion(s.tiempo_instalacion || {});

    var tpeResult = renderTiempoPorEtapa(s.tiempo_por_etapa || {});
    html += tpeResult.html;

    var efResult = renderEfectividad(s.efectividad || []);
    html += efResult.html;

    html += renderEfectividadEstadisticas(s.efectividad_estadisticas || []);

    html += renderProbabilidad(s.probabilidad_etapa8_perdidos || {}, d);

    html += renderRescate(s.rescate_perdidos || {});

    html += renderDimensiones(d);

    container.innerHTML = html;

    renderTiempoChart(tpeResult.etapas, tpeResult.etapaLabels, tpeResult.data);
  }

  // -----------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("results-table-tbody")) {
      loadResultsData();
    }
  });
})();