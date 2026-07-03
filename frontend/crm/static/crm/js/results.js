(function () {
  "use strict";

  var N = window.NetOwl;
  var _detailChart = null;

  function colorTiempo(v) { return v <= 72 ? "text-success" : v <= 120 ? "text-warning" : "text-danger"; }
  function colorEfectividad(v) { return v >= 70 ? "text-success" : v >= 40 ? "text-warning" : "text-danger"; }
  function colorProb(v) { return v <= 30 ? "text-success" : v <= 60 ? "text-warning" : "text-danger"; }
  function colorRescate(v) { return v <= 30 ? "text-danger" : v <= 60 ? "text-warning" : "text-success"; }

  function renderResultsTable(totals, ti, ef, prob, resc) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!totals) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">Sin datos</td></tr>';
      return;
    }
    var ef3 = (ef.find(function(x) { return x.etapa === "etapa_3_factibilidad"; }) || {}).efectividad_pct || 0;
    var ef4 = (ef.find(function(x) { return x.etapa === "etapa_4_adecuaciones"; }) || {}).efectividad_pct || 0;
    var ef5 = (ef.find(function(x) { return x.etapa === "etapa_5_gpi"; }) || {}).efectividad_pct || 0;
    var efv = (ef.find(function(x) { return x.etapa === "ventas"; }) || {}).efectividad_pct || 0;
    var tiHoras = ti.horas_promedio ? Number(ti.horas_promedio) : 0;
    var rescv = resc.pct_rescate || 0;
    tbody.innerHTML = '<tr>' +
      '<td class="fw-semibold">General</td>' +
      '<td class="text-end">' + (totals.total_clientes || 0).toLocaleString() + '</td>' +
      '<td class="text-end text-success">' + (totals.ganados || 0).toLocaleString() + '</td>' +
      '<td class="text-end text-danger">' + (totals.perdidos || 0).toLocaleString() + '</td>' +
      '<td class="text-end text-warning">' + (totals.etapa_8_count || 0).toLocaleString() + '</td>' +
      '<td class="text-end fw-bold ' + colorTiempo(tiHoras) + '">' + tiHoras.toFixed(1) + '</td>' +
      '<td class="text-end fw-bold ' + colorEfectividad(ef3) + '">' + ef3.toFixed(1) + '%</td>' +
      '<td class="text-end fw-bold ' + colorEfectividad(ef4) + '">' + ef4.toFixed(1) + '%</td>' +
      '<td class="text-end fw-bold ' + colorEfectividad(ef5) + '">' + ef5.toFixed(1) + '%</td>' +
      '<td class="text-end fw-bold ' + colorEfectividad(efv) + '">' + efv.toFixed(1) + '%</td>' +
      '<td class="text-end fw-bold ' + colorRescate(rescv) + '">' + rescv.toFixed(1) + '%</td>' +
    '</tr>';
  }

  function renderTiempoInstalacion(ti) {
    if (!ti || !ti.total_instalados) return "";
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-clock me-2"></i>Tiempo Instalacion</h5></div><div class="card-body"><div class="row g-3">';
    function v(val, unit) { return (val !== undefined && val !== null && val !== 0) ? Number(val).toFixed(1) + unit : "0" + unit; }
    function card(label, value, cls) {
      return '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">' + label + '</div><div class="fs-5 fw-bold ' + cls + '">' + value + '</div></div></div></div>';
    }
    html += card("Total Instalados", (ti.total_instalados || 0).toLocaleString(), "text-success");
    html += card("Promedio", v(ti.horas_promedio, "h"), colorTiempo(ti.horas_promedio || 0));
    html += card("Mediana", v(ti.horas_mediana, "h"), colorTiempo(ti.horas_mediana || 0));
    html += card("P25", v(ti.horas_p25, "h"), colorTiempo(ti.horas_p25 || 0));
    html += card("P75", v(ti.horas_p75, "h"), colorTiempo(ti.horas_p75 || 0));
    html += card("Minimo", v(ti.horas_min, "h"), colorTiempo(ti.horas_min || 0));
    html += card("Maximo", v(ti.horas_max, "h"), colorTiempo(ti.horas_max || 0));
    html += card("Desv. Estandar", v(ti.horas_std, "h"), colorTiempo(ti.horas_std || 0));
    html += '</div></div></div>';
    return html;
  }

  function renderTiempoPorEtapa(tpe) {
    if (!tpe) return { html: "" };
    var etapas = ["etapa_1_contacto","etapa_2_recepcion","etapa_3_factibilidad","etapa_4_adecuaciones","etapa_5_gpi","etapa_6_contratistas","etapa_8_devueltos","etapa_9_disponibles","etapa_10_proyectos"];
    var etapaLabels = ["1. Contacto","2. Recepcion","3. Factibilidad","4. Adecuaciones","5. GPI","6. Contratistas","8. Devueltos","9. Disponibles","10. Proyectos"];
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-clock-history me-2"></i>Tiempo por Etapa</h5></div><div class="card-body"><div class="chart-container mb-4" style="position:relative;height:300px"><canvas id="detail-tiempo-chart"></canvas></div><div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Etapa</th><th class="text-end">Promedio (h)</th><th class="text-end">Mediana (h)</th><th class="text-end">Minimo (h)</th><th class="text-end">Maximo (h)</th><th class="text-end">Std (h)</th><th class="text-end">Movimientos</th></tr></thead><tbody>';
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

  function renderProbabilidad(etapa8, perdido, dimensions) {
    var html = '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-pie-chart me-2"></i>Probabilidad Etapa 8 y Perdidas</h5></div><div class="card-body">';
    html += '<div class="row g-3 mb-3">';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Etapa 8</div><div class="fs-4 fw-bold ' + colorProb(etapa8.pct || 0) + '">' + (etapa8.pct || 0).toFixed(1) + '%</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Perdidos</div><div class="fs-4 fw-bold ' + colorProb(perdido.pct || 0) + '">' + (perdido.pct || 0).toFixed(1) + '%</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Total Clientes</div><div class="fs-4 fw-bold text-success">' + ((etapa8.total_clientes || perdido.total_clientes || 0)).toLocaleString() + '</div></div></div></div>';
    html += '<div class="col-md-3 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Etapa 8 Count</div><div class="fs-4 fw-bold text-warning">' + (etapa8.count_etapa8 || 0).toLocaleString() + '</div></div></div></div>';
    html += '</div>';

    if (dimensions && dimensions.devolver_oportunidad && dimensions.devolver_oportunidad.length) {
      html += '<h6 class="text-muted mb-2">Motivos de Devolucion (Etapa 8)</h6><div class="table-responsive" style="max-height:250px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Motivo</th><th class="text-end">Clientes</th><th class="text-end">% Etapa 8</th></tr></thead><tbody>';
      dimensions.devolver_oportunidad.forEach(function (item) {
        html += '<tr><td>' + (item.valor || "N/A") + '</td><td class="text-end">' + (item.total_clientes || 0).toLocaleString() + '</td><td class="text-end fw-bold ' + colorProb(item.pct_etapa8 || 0) + '">' + (item.pct_etapa8 || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    if (dimensions && dimensions.motivo_perdida && dimensions.motivo_perdida.length) {
      html += '<h6 class="text-muted mb-2 mt-2">Motivos de Perdida</h6><div class="table-responsive" style="max-height:250px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-theme"><thead><tr><th>Motivo</th><th class="text-end">Cantidad</th><th class="text-end">%</th></tr></thead><tbody>';
      dimensions.motivo_perdida.forEach(function (m) {
        html += '<tr><td>' + (m.valor || "N/A") + '</td><td class="text-end">' + (m.total_clientes || 0).toLocaleString() + '</td><td class="text-end">' + (m.pct_perdidos || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '</div></div>';
    return html;
  }

  function renderRescate(resc) {
    if (!resc) return "";
    return '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-arrow-repeat me-2"></i>Rescate de Perdidos</h5></div><div class="card-body"><div class="row g-3">' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Total Perdidos</div><div class="fs-4 fw-bold text-danger">' + (resc.total_perdidos || 0).toLocaleString() + '</div></div></div></div>' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">Rescatados</div><div class="fs-4 fw-bold text-success">' + (resc.rescatados || 0).toLocaleString() + '</div></div></div></div>' +
      '<div class="col-md-4 col-6"><div class="card border-1 h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3 text-center"><div class="text-muted small">% Rescate</div><div class="fs-4 fw-bold ' + colorRescate(resc.pct_rescate || 0) + '">' + (resc.pct_rescate || 0).toFixed(1) + '%</div></div></div></div>' +
    '</div></div></div>';
  }

  function mergeDimensions(dimTotals, dimTi, dimEf, dimEtapa8, dimPerdido, dimResc) {
    var all = (dimTotals || []).concat(dimTi || []).concat(dimEf || []).concat(dimEtapa8 || []).concat(dimPerdido || []).concat(dimResc || []);
    var merged = {};
    all.forEach(function (item) {
      var key = item.dimension + "|" + item.valor;
      if (!merged[key]) {
        merged[key] = { dimension: item.dimension, valor: item.valor };
      }
      Object.assign(merged[key], item.data || {});
    });
    var grouped = {};
    Object.keys(merged).forEach(function (k) {
      var d = merged[k];
      if (!grouped[d.dimension]) grouped[d.dimension] = [];
      grouped[d.dimension].push(d);
    });
    return grouped;
  }

  function renderDimensiones(dimensions) {
    if (!dimensions || !Object.keys(dimensions).length) return "";
    var nameMap = { municipio: "Municipio", campana: "Campana", sucursal: "Sucursal", vendedor: "Vendedor", equipo_ventas: "Equipo Ventas" };
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
          '<td class="text-end fw-bold ' + colorTiempo(item.tiempo_instalacion_promedio_horas || item.horas_promedio || 0) + '">' + (item.tiempo_instalacion_promedio_horas || item.horas_promedio || 0).toFixed(1) + '</td>' +
          '<td class="text-end fw-bold ' + colorRescate(item.pct_rescate_perdidos || item.pct_rescate || 0) + '">' + (item.pct_rescate_perdidos || item.pct_rescate || 0).toFixed(1) + '%</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });
    html += '</div></div>';
    return html;
  }

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

  function loadResultsData() {
    function check(r) { if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }
    Promise.all([
      fetch("/crm/api/metricas/totals/").then(check),
      fetch("/crm/api/metricas/tiempo-instalacion/").then(check),
      fetch("/crm/api/metricas/tiempo-por-etapa/").then(check),
      fetch("/crm/api/metricas/efectividad/").then(check),
      fetch("/crm/api/metricas/etapa8/").then(check),
      fetch("/crm/api/metricas/perdido/").then(check),
      fetch("/crm/api/metricas/rescate/").then(check),
      fetch("/crm/api/dimensiones/totals/").then(check),
      fetch("/crm/api/dimensiones/tiempo-instalacion/").then(check),
      fetch("/crm/api/dimensiones/efectividad/").then(check),
      fetch("/crm/api/dimensiones/etapa8/").then(check),
      fetch("/crm/api/dimensiones/perdido/").then(check),
      fetch("/crm/api/dimensiones/rescate/").then(check),
    ])
    .then(function (results) {
      var totals = results[0];
      var ti = results[1];
      var tpe = results[2];
      var ef = results[3];
      var etapa8 = results[4];
      var perdido = results[5];
      var resc = results[6];
      var dimTotals = results[7];
      var dimTi = results[8];
      var dimEf = results[9];
      var dimEtapa8 = results[10];
      var dimPerdido = results[11];
      var dimResc = results[12];

      renderResultsTable(totals, ti, ef, etapa8, resc);

      var dimensions = mergeDimensions(dimTotals, dimTi, dimEf, dimEtapa8, dimPerdido, dimResc);

      var container = document.getElementById("results-detail-container");
      if (container) {
        var html = "";
        html += renderTiempoInstalacion(ti);
        var tpeResult = renderTiempoPorEtapa(tpe);
        html += tpeResult.html;
        var efResult = renderEfectividad(ef);
        html += efResult.html;
        html += renderProbabilidad(etapa8, perdido, dimensions);
        html += renderRescate(resc);
        html += renderDimensiones(dimensions);
        container.innerHTML = html;
        renderTiempoChart(tpeResult.etapas, tpeResult.etapaLabels, tpeResult.data);
      }
    })
    .catch(function (err) {
      N.showToast("Error cargando datos CRM: " + err.message, "error");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("results-table-tbody")) {
      loadResultsData();
    }
  });
})();
