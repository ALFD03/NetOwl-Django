(function () {
  "use strict";

  var N = window.NetOwl;
  var lifecycleCharts = { activo: null, reactivacion: null };

  window.runLifecycleAnalysis = function () {
    N.showLoading("Ejecutando analisis de ciclo de vida...");
    fetch("/subscriptions/api/lifecycle/run/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": N.getCsrfToken() },
    })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        N.hideLoading();
        if (resp.status === "success") {
          loadLifecycleResults();
        } else {
          N.showToast("Error: " + (resp.message || "Desconocido"), "error");
        }
      })
      .catch(function () { N.hideLoading(); N.showToast("Error de conexion", "error"); });
  };

  function loadLifecycleResults() {
    fetch("/subscriptions/api/lifecycle/results/")
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp.status === "success") {
          renderLifecycleResults(resp.data);
          loadSurvivalPage();
        }
      })
      .catch(function () {});
  }

  function renderLifecycleResults(data) {
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var tickColor = isLight ? "#64748b" : "#94a3b8";

    var statsHtml = "";
    function statBox(label, value, color, unit) {
      if (unit === undefined) unit = " d";
      if (value == null || (typeof value === "number" && isNaN(value))) value = "-";
      else value = String(Math.round(value)) + unit;
      return '<div class="col text-center px-2 py-2 border-end" style="border-color:' + gridColor + '"><div class="small text-secondary">' + label + '</div><div class="fw-bold fs-5" style="color:' + color + '">' + value + '</div></div>';
    }
    function sepRow() { return '</div></div><div class="col-12 mt-2"><div class="d-flex flex-wrap border rounded-3" style="border-color:' + gridColor + '">'; }

    statsHtml += '<div class="col-12"><div class="d-flex flex-wrap border rounded-3" style="border-color:' + gridColor + '">';
    statsHtml += statBox("Mediana Activo", data.mediana_activo, "#2563eb");
    statsHtml += statBox("Promedio Activo", data.promedio_activo, "#3b82f6");
    statsHtml += statBox("P25 Activo", data.p25_activo, "#64748b");
    statsHtml += statBox("P75 Activo", data.p75_activo, "#94a3b8");
    statsHtml += statBox("Ciclos x Sub (prom)", data.ciclos_por_suscriptor && data.ciclos_por_suscriptor.promedio != null ? data.ciclos_por_suscriptor.promedio : "-", "#8b5cf6", "");
    statsHtml += statBox("Subs. Totales", data.suscriptores_totales, "#94a3b8", "");
    statsHtml += statBox("Nunca Inactivos", data.suscriptores_nunca_inactivos, "#94a3b8", "");

    statsHtml += sepRow();
    statsHtml += statBox("Mediana Reactivacion", data.mediana_reactivacion, "#10b981");
    statsHtml += statBox("Promedio Reactivacion", data.promedio_reactivacion, "#34d399");
    statsHtml += statBox("P25 Reactivacion", data.p25_reactivacion, "#64748b");
    statsHtml += statBox("P75 Reactivacion", data.p75_reactivacion, "#94a3b8");
    statsHtml += statBox("Total Reactivaciones", data.n_total_reactivacion, "#94a3b8", "");
    statsHtml += '</div></div>';
    document.getElementById("lifecycleStatsRow").innerHTML = statsHtml;

    var opts = N.chartOpts({
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false, callbacks: { label: function (tc) { return tc.dataset.label + ": " + (tc.parsed ? (tc.parsed.y * 100).toFixed(1) + "%" : ""); } } },
      },
      scales: {
        y: { min: 0, max: 1.05, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, callback: function (v) { return (v * 100).toFixed(0) + "%"; } } },
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: "Dias", color: tickColor, font: { size: 10 } } },
      },
    });

    function drawLifecycleChart(canvasId, curve, color) {
      var key = canvasId === "lifecycleChartActivo" ? "activo" : "reactivacion";
      if (lifecycleCharts[key]) { lifecycleCharts[key].destroy(); lifecycleCharts[key] = null; }
      var ctx = document.getElementById(canvasId);
      if (!ctx || !curve || !curve.length) return;
      lifecycleCharts[key] = new Chart(ctx, {
        type: "line",
        data: {
          labels: curve.map(function (p) { return p.tiempo; }),
          datasets: [{ label: "Supervivencia", data: curve.map(function (p) { return p.sup; }), borderColor: color, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, stepped: "before", fill: false, tension: 0 }],
        },
        options: opts,
      });
    }

    drawLifecycleChart("lifecycleChartActivo", data.curva_activo, "#2563eb");
    drawLifecycleChart("lifecycleChartReactivacion", data.curva_reactivacion, "#10b981");
  }

  function initSurvivalPage() {
    document.querySelectorAll('input[name="kmTipoS"]').forEach(function (r) { r.addEventListener("change", loadSurvivalPage); });
    var dimSel = document.getElementById("survivalDim");
    if (dimSel) dimSel.addEventListener("change", loadSurvivalPage);
    loadSurvivalPage();
  }

  function loadSurvivalPage() {
    var dim = document.getElementById("survivalDim");
    var dimVal = dim ? dim.value : "";
    var url = "/subscriptions/api/survival/global/";
    if (dimVal) url += "?dim=" + encodeURIComponent(dimVal);
    fetch(url).then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (data) {
      renderKMSurvivalChartS(data);
      renderKMRiskTableS(data);
      renderKMStatsS(data);
    }).catch(function () { N.showToast("Error cargando supervivencia", "error"); });
  }

  function renderKMSurvivalChartS(data) {
    if (N.kmSurvivalChartS) { N.kmSurvivalChartS.destroy(); N.kmSurvivalChartS = null; }
    var ctx = document.getElementById("kmSurvivalChartS");
    if (!ctx) return;
    var tipo = document.querySelector('input[name="kmTipoS"]:checked');
    var sufijo = (tipo && tipo.value) || "activo";
    var curve = data["curva_" + sufijo] || [];
    if (!curve.length) {
      if (N.kmSurvivalChartS) { N.kmSurvivalChartS.destroy(); N.kmSurvivalChartS = null; }
      return;
    }
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var datasets = [];
    datasets.push({
      label: "Global", data: curve.map(function (p) { return p.sup; }),
      borderColor: "#2563eb", backgroundColor: "transparent",
      borderWidth: 2.5, stepped: "before", pointRadius: 0, fill: false, tension: 0, order: 1,
    });
    datasets.push({
      label: "IC 95%", data: curve.map(function (p) { return p.ci_high; }),
      borderColor: "rgba(37,99,235,0.2)", backgroundColor: "rgba(37,99,235,0.08)",
      borderWidth: 1, pointRadius: 0, fill: "+1", stepped: "before", order: 3,
    });
    datasets.push({
      label: "IC 95%", data: curve.map(function (p) { return p.ci_low; }),
      borderColor: "transparent", backgroundColor: "transparent",
      pointRadius: 0, fill: false, stepped: "before", order: 4,
    });
    var dimCurves = (data.curvas_dimension || {})[sufijo] || {};
    var dimIdx = 0;
    var dimPalette = ["#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#84cc16"];
    Object.keys(dimCurves).forEach(function (dimVal) {
      var cData = dimCurves[dimVal] || [];
      if (!cData.length) return;
      datasets.push({
        label: dimVal, data: cData.map(function (p) { return p.sup; }),
        borderColor: dimPalette[dimIdx % dimPalette.length], backgroundColor: "transparent",
        borderWidth: 2, borderDash: [4, 3], stepped: "before", pointRadius: 0, fill: false, tension: 0, order: 2,
      });
      dimIdx++;
    });
    N.kmSurvivalChartS = new Chart(ctx, {
      type: "line",
      data: { labels: curve.map(function (p) { return p.tiempo; }), datasets: datasets },
      options: N.chartOpts({
        plugins: {
          legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } },
          tooltip: { mode: "index", intersect: false, callbacks: { label: function (tc) { var raw = tc.parsed ? tc.parsed.y : 0; return tc.dataset.label + ": " + (raw * 100).toFixed(1) + "%"; } } },
        },
        scales: {
          y: { min: 0, max: 1.05, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, callback: function (v) { return (v * 100).toFixed(0) + "%"; } } },
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: "Dias", color: tickColor, font: { size: 10 } } },
        },
      }),
    });
  }

  function renderKMRiskTableS(data) {
    var container = document.getElementById("kmRiskTableContainerS");
    if (!container) return;
    var tipo = document.querySelector('input[name="kmTipoS"]:checked');
    var sufijo = (tipo && tipo.value) || "activo";
    var curve = data["curva_" + sufijo] || [];
    if (!curve.length) { container.innerHTML = ""; return; }
    var keyTimes = [0, 30, 60, 90, 120, 180, 365, 540, 730];
    var maxT = curve[curve.length - 1].tiempo;
    keyTimes = keyTimes.filter(function (t) { return t <= maxT; });
    var cumMap = [];
    var running = 0;
    for (var i = 0; i < curve.length; i++) {
      running += curve[i].n_eventos;
      cumMap.push({tiempo: curve[i].tiempo, cum: running});
    }
    function lastAtOrBefore(arr, target) {
      var best = null;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].tiempo <= target) best = arr[i];
        else break;
      }
      return best;
    }
    var html = '<div class="table-responsive"><table class="table table-sm mb-0 table-theme table-modal-dim" style="font-size:0.72rem;width:100%"><thead><tr>';
    html += '<th class="sticky-header" style="min-width:80px">Tiempo (d)</th>';
    keyTimes.forEach(function (t) { html += '<th class="text-end sticky-header" style="min-width:65px">' + t + '</th>'; });
    html += '</tr></thead><tbody>';
    html += '<tr><td class="fw-medium" style="color:var(--text-primary)">Supervivencia</td>';
    keyTimes.forEach(function (t) {
      var pt = t === 0 ? {sup: 1.0} : (lastAtOrBefore(curve, t) || {sup: curve[0].sup});
      html += '<td class="text-end" style="color:var(--text-primary)">' + (pt.sup * 100).toFixed(1) + '%</td>';
    });
    html += '</tr>';
    html += '<tr><td class="fw-medium" style="color:var(--text-secondary)">IC 95%</td>';
    keyTimes.forEach(function (t) {
      if (t === 0) { html += '<td class="text-end" style="color:var(--text-secondary)">—</td>'; return; }
      var pt = lastAtOrBefore(curve, t);
      if (!pt) { html += '<td class="text-end" style="color:var(--text-secondary)">—</td>'; return; }
      var dLow = (pt.sup - pt.ci_low) * 100;
      var dHigh = (pt.ci_high - pt.sup) * 100;
      var delta = Math.max(dLow, dHigh);
      html += '<td class="text-end" style="color:var(--text-secondary)">' + (delta < 0.001 ? '\u2014' : '\u00B1' + delta.toFixed(1) + '%') + '</td>';
    });
    html += '</tr>';
    html += '<tr><td class="fw-medium" style="color:var(--text-primary)">Churnes acum.</td>';
    keyTimes.forEach(function (t) {
      var cum = t === 0 ? 0 : (lastAtOrBefore(cumMap, t) || {cum: 0}).cum;
      html += '<td class="text-end" style="color:var(--text-primary)">' + cum.toLocaleString() + '</td>';
    });
    html += '</tr>';
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function renderKMStatsS(data) {
    var container = document.getElementById("kmStatsRowS");
    if (!container) return;
    var stats = data.stats || {};
    var tipo = document.querySelector('input[name="kmTipoS"]:checked');
    var sufijo = (tipo && tipo.value) || "activo";
    var medKey = "mediana_" + sufijo;
    var promKey = "promedio_" + sufijo;
    var p25Key = "p25_" + sufijo;
    var p75Key = "p75_" + sufijo;
    var html = '<div class="d-flex flex-wrap gap-4 justify-content-center align-items-center py-2" style="font-size:0.85rem">';
    function statBox(label, value, color, unit) {
      if (unit === undefined) unit = " d";
      if (value == null) value = "-";
      else value = value.toFixed(0) + unit;
      return '<div class="text-center px-3"><div class="small" style="color:var(--text-secondary)">' + label + '</div><div class="fw-bold fs-5" style="color:' + color + '">' + value + '</div></div>';
    }
    html += statBox("Mediana", stats[medKey], "#2563eb");
    html += statBox("Promedio", stats[promKey], "#3b82f6");
    html += statBox("P25", stats[p25Key], "#64748b");
    html += statBox("P75", stats[p75Key], "#94a3b8");
    if (stats.total_suscriptores != null) html += statBox("Total", stats.total_suscriptores, "#94a3b8", "");
    if (stats.total_eventos != null) html += statBox("Eventos", stats.total_eventos, "#94a3b8", "");
    if (stats.tasa_censura != null) html += statBox("Censura", stats.tasa_censura * 100, "#94a3b8", "%");
    if (stats.tiempo_maximo != null) html += statBox("Tiempo max", stats.tiempo_maximo, "#94a3b8");
    html += '</div>';
    container.innerHTML = html;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("kmSurvivalChartS")) {
      loadLifecycleResults();
      initSurvivalPage();
    }
  });
})();
