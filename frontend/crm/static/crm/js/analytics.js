(function () {
  "use strict";

  var N = window.NetOwl;

  function renderAnalyticsCards(totals, ti, tpe, ef, e8, perd, resc) {
    var container = document.getElementById("analytics-cards-container");
    if (!container) return;
    if (!totals || !totals.total_clientes) { container.innerHTML = '<div class="col-12 text-center text-muted py-4">Sin datos</div>'; return; }

    function colorTiempo(v) { return v <= 72 ? "text-success" : v <= 120 ? "text-warning" : "text-danger"; }
    function colorEfectividad(v) { return v >= 70 ? "text-success" : v >= 40 ? "text-warning" : "text-danger"; }
    function colorProb(v) { return v <= 30 ? "text-success" : v <= 60 ? "text-warning" : "text-danger"; }
    function colorRescate(v) { return v <= 30 ? "text-danger" : v <= 60 ? "text-warning" : "text-success"; }

    function card(c) {
      return '<div class="col-xl-2 col-md-3 col-sm-4"><div class="metric-card"><div class="metric-label">' + c.label + '</div><div class="fs-3 fw-bold ' + c.clr(c.val) + '">' + c.fmt(c.val) + '</div></div></div>';
    }
    function group(title, items) {
      var inner = items.map(function (c) { return c instanceof Array ? card({ label: c[0], val: c[1], fmt: c[2], clr: c[3] }) : card(c); }).join("");
      return '<div class="col-12 mb-3"><h6 class="text-muted mb-2" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px">' + title + '</h6><div class="row g-2">' + inner + '</div></div>';
    }

    function avgEf(etapaKey) {
      if (!ef || !ef.length) return 0;
      var e = ef.find(function(x) { return x.etapa === etapaKey; });
      return e && e.efectividad_pct != null ? Number(e.efectividad_pct) : 0;
    }

    var tiData = ti || {};
    var e8Data = e8 || {};
    var perdData = perd || {};
    var rescData = resc || {};

    var html = "";
    html += group("Tiempo Instalación", [
      ["Promedio", tiData.horas_promedio || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Mediana", tiData.horas_mediana || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["P25", tiData.horas_p25 || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["P75", tiData.horas_p75 || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Probabilidad", tiData.pct_excede_promedio || 0, function (v) { return v.toFixed(1) + "%"; }, colorTiempo],
      ["Mínimo", tiData.horas_min || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Máximo", tiData.horas_max || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Desviación Estándar", tiData.horas_std || 0, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Total Instalados", tiData.total_instalados || 0, function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
    ]);
    html += group("Efectividad", [
      ["Etapa 3", avgEf("etapa_3_factibilidad"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Etapa 4", avgEf("etapa_4_adecuaciones"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Etapa 5", avgEf("etapa_5_gpi"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Ventas", avgEf("ventas"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
    ]);
    html += group("Probabilidad", [
      ["% Etapa 8", e8Data.pct || 0, function (v) { return v.toFixed(1) + "%"; }, colorProb],
      ["% Perdidos", perdData.pct || 0, function (v) { return v.toFixed(1) + "%"; }, colorProb],
    ]);
    html += group("Rescate", [
      ["Rescate Perdidos", rescData.pct_rescate || 0, function (v) { return v.toFixed(1) + "%"; }, colorRescate],
    ]);
    html += group("Totales", [
      ["Total Clientes", totals.total_clientes || 0, function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Ganados", totals.ganados || 0, function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Perdidos", totals.perdidos || 0, function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-danger"; }],
      ["Etapa 8", totals.etapa_8_count || 0, function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-warning"; }],
    ]);
    container.innerHTML = html;
  }

  function mergeDimensionData(dimTotals, dimTi, dimTpe, dimEf, dimE8, dimPerd, dimResc) {
    var merged = {};
    function setField(arr, field) {
      (arr || []).forEach(function (item) {
        var key = item.dimension + "|||" + item.valor;
        if (!merged[key]) merged[key] = { dimension: item.dimension, valor: item.valor };
        merged[key][field] = item.data;
      });
    }
    setField(dimTotals, "totals");
    setField(dimTi, "tiempo_instalacion");
    setField(dimTpe, "tiempo_por_etapa");
    setField(dimEf, "efectividad");
    setField(dimE8, "etapa8");
    setField(dimPerd, "perdido");
    setField(dimResc, "rescate");

    var result = {};
    Object.keys(merged).forEach(function (key) {
      var item = merged[key];
      var dim = item.dimension;
      if (!result[dim]) result[dim] = [];
      var totals = item.totals || {};
      var ti = item.tiempo_instalacion || {};
      var tpe = item.tiempo_por_etapa || [];
      var ef = item.efectividad || [];
      var e8 = item.etapa8 || {};
      var perd = item.perdido || {};
      var resc = item.rescate || {};

      var efVals = {};
      (ef || []).forEach(function (r) { if (r.etapa) efVals[r.etapa] = r.efectividad_pct || 0; });

      result[dim].push({
        valor: item.valor,
        tiempo_instalacion_promedio_horas: ti.horas_promedio || 0,
        pct_etapa8: e8.pct_etapa8 || 0,
        pct_perdidos: perd.pct_perdidos || 0,
        pct_rescate_perdidos: resc.pct_rescate || 0,
        total_clientes: totals.total_clientes || e8.total_clientes || perd.total_clientes || resc.total_clientes || 0,
        ganados: totals.ganados || 0,
        perdidos: totals.perdidos || perd.count_perdido || 0,
        etapa_8_count: totals.etapa_8_count || e8.count_etapa8 || 0,
        rescatados: resc.rescatados || perd.rescatados || 0,
        efecto_3: efVals["etapa_3_factibilidad"] || 0,
        efecto_4: efVals["etapa_4_adecuaciones"] || 0,
        efecto_5: efVals["etapa_5_gpi"] || 0,
        efecto_ventas: efVals["ventas"] || 0,
      });
    });
    return result;
  }

  function renderDimensionCharts(avgData, totals, ti, ef, e8, perd, resc) {
    var container = document.getElementById("analytics-dimension-charts");
    if (!container) return;
    N.dimChartInstances.forEach(function (c) { c.destroy(); });
    N.dimChartInstances = [];
    var dimKeys = Object.keys(avgData).filter(function (k) { return avgData[k].length > 0; });
    if (!dimKeys.length) { container.innerHTML = '<div class="text-center text-muted py-4">Sin datos de dimensiones</div>'; return; }

    var dimLabels = { zona: "Zona", sucursal: "Sucursal", municipio: "Municipio", campana: "Campaña", vendedor: "Vendedor", equipo_ventas: "Equipo Ventas", motivo_perdida: "Motivo Pérdida", devolver_oportunidad: "Devolver Oportunidad" };
    var metrics = [
      { key: "tiempo_instalacion_promedio_horas", label: "Tiempo Instalación (h)", chartType: "hbar", fmt: function (v) { return v.toFixed(1) + "h"; } },
      { key: "pct_etapa8", label: "% Etapa 8", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "pct_perdidos", label: "% Perdidos", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "pct_rescate_perdidos", label: "Rescate %", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "efecto_3", label: "Efectividad Etapa 3", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "efecto_4", label: "Efectividad Etapa 4", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "efecto_5", label: "Efectividad Etapa 5", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
      { key: "efecto_ventas", label: "Efectividad Ventas", chartType: "doughnut", fmt: function (v) { return v.toFixed(1) + "%"; } },
    ];

    var isLight = document.documentElement.classList.contains("light-mode");
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var bgColor = isLight ? "#fff" : "#1e293b";
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var palette = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#d946ef", "#0d9488", "#e11d48", "#7c3aed", "#65a30d", "#0891b2", "#c026d3", "#dc2626", "#ca8a04"];

    var normalDims = ["municipio", "campana", "sucursal", "vendedor", "equipo_ventas"];
    function getApplicableDimKeys(metricKey) {
      if (metricKey === "pct_etapa8") {
        return dimKeys.filter(function (d) { return d === "devolver_oportunidad" || normalDims.indexOf(d) !== -1; });
      } else if (metricKey === "pct_perdidos" || metricKey === "pct_rescate_perdidos") {
        return dimKeys.filter(function (d) { return d === "motivo_perdida" || normalDims.indexOf(d) !== -1; });
      } else {
        return dimKeys.filter(function (d) { return normalDims.indexOf(d) !== -1; });
      }
    }

    function getGlobalMetricVal(metricKey) {
      if (metricKey === "tiempo_instalacion_promedio_horas") return (ti || {}).horas_promedio || 0;
      if (metricKey === "pct_etapa8") return (e8 || {}).pct || 0;
      if (metricKey === "pct_perdidos") return (perd || {}).pct || 0;
      if (metricKey === "pct_rescate_perdidos") return (resc || {}).pct_rescate || 0;
      if (metricKey.indexOf("efecto_") === 0) {
        var etapaMap = { efecto_3: "etapa_3_factibilidad", efecto_4: "etapa_4_adecuaciones", efecto_5: "etapa_5_gpi", efecto_ventas: "ventas" };
        var etapa = etapaMap[metricKey];
        if (etapa && ef) {
          var found = ef.find(function (r) { return r.etapa === etapa; });
          if (found) return found.efectividad_pct || 0;
        }
        return 0;
      }
      return 0;
    }

    var html = "";
    metrics.forEach(function (metric) {
      var metricDimKeys = getApplicableDimKeys(metric.key);
      if (!metricDimKeys.length) return;
      html += '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-pie-chart me-2"></i>' + metric.label + '</h5></div><div class="card-body"><div class="row g-4">';
      metricDimKeys.forEach(function (dimKey) {
        var canvasId = "dimc-" + metric.key + "-" + dimKey;
        html += '<div class="col-lg mb-4"><h6 class="text-muted small text-center mb-2">' + (dimLabels[dimKey] || dimKey) + '</h6><div class="chart-container" style="position:relative;height:280px"><canvas id="' + canvasId + '"></canvas></div></div>';
      });
      html += '</div></div></div>';
    });
    container.innerHTML = html;

    metrics.forEach(function (metric) {
      var metricDimKeys = getApplicableDimKeys(metric.key);
      if (!metricDimKeys.length) return;
      var globalCenterVal = metric.fmt(getGlobalMetricVal(metric.key));
      metricDimKeys.forEach(function (dimKey) {
        var items = avgData[dimKey];
        if (!items || !items.length) return;
        var canvasId = "dimc-" + metric.key + "-" + dimKey;
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (metric.chartType === "doughnut" || metric.chartType === "pie") {
          var totalWeight = 0;
          items.forEach(function (i) { i._w = getWeight(i, metric.key); totalWeight += i._w; });
          if (!totalWeight) return;
          var mainItems = [], othersW = 0, othersMetricSum = 0, othersCount = 0;
          items.forEach(function (i) {
            var pct = (i._w / totalWeight) * 100;
            if (pct < 2.5) { othersW += i._w; othersMetricSum += (i[metric.key] || 0) * i._w; othersCount++; }
            else { mainItems.push(i); }
          });
          if (othersW > 0) { var o = { valor: "Otros", _w: othersCount > 0 ? othersW / othersCount : 0 }; o[metric.key] = othersMetricSum / othersW; mainItems.push(o); }
          mainItems.sort(function (a, b) { return b._w - a._w; });
          var otrosIdx = mainItems.findIndex(function (i) { return i.valor === "Otros"; });
          if (otrosIdx !== -1) { var otrosItem = mainItems.splice(otrosIdx, 1)[0]; mainItems.push(otrosItem); }

          var labels = mainItems.map(function (i) { return i.valor || "N/A"; });
          var values = mainItems.map(function (i) { return i._w; });
          var colors = mainItems.map(function (_, i) { return palette[i % palette.length]; });
          var isPie = metric.chartType === "pie";
          var hoverPlugin = {
            id: "centerText",
            afterDraw: function (chart) {
              if (isPie) return;
              var w = chart.width, h = chart.height, ctx = chart.ctx;
              var active = chart.getActiveElements();
              var text = globalCenterVal;
              if (active.length) { var idx = active[0].index; var item = mainItems[idx]; if (item) text = metric.fmt(item[metric.key] || 0); }
              ctx.save();
              ctx.font = "bold " + Math.round(h / 8) + "px sans-serif";
              ctx.textBaseline = "middle"; ctx.textAlign = "center";
              ctx.fillStyle = tickColor;
              ctx.fillText(text, w / 2, h / 2);
              ctx.restore();
            }
          };

          var chart = new Chart(canvas, {
            type: isPie ? "pie" : "doughnut",
            data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: bgColor, spacing: 8 }] },
            options: { cutout: isPie ? undefined : "60%", responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: "easeOutQuart", animateRotate: true }, plugins: {
              legend: { display: false },
              datalabels: { display: function (ctx) { return mainItems[ctx.dataIndex] && mainItems[ctx.dataIndex].valor !== "Otros"; }, color: "#fff", font: { size: 10, weight: "bold" }, formatter: function (val, ctx) { return (val / ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0) * 100).toFixed(1) + "%"; } },
              tooltip: { callbacks: { label: function (ctx) { var item = mainItems[ctx.dataIndex]; if (!item) return ctx.label; return ctx.label + ": " + metric.fmt(item[metric.key] || 0); } } }
            } },
            plugins: [hoverPlugin]
          });
          N.dimChartInstances.push(chart);
        } else if (metric.chartType === "hbar") {
          var total = items.reduce(function (s, i) { return s + (i[metric.key] || 0); }, 0);
          var main = [], othersSum = 0, othersCount = 0;
          items.forEach(function (i) { var v = i[metric.key] || 0; if (total > 0 && (v / total * 100) < 2.5) { othersSum += v; othersCount++; } else { main.push(i); } });
          if (othersCount > 0) { var o = { valor: "Otros" }; o[metric.key] = othersSum / othersCount; main.push(o); }
          main.sort(function (a, b) { return (b[metric.key] || 0) - (a[metric.key] || 0); });
          var oIdx = main.findIndex(function (i) { return i.valor === "Otros"; });
          if (oIdx !== -1) { var oi = main.splice(oIdx, 1)[0]; main.push(oi); }
          var hlabels = main.map(function (i) { return i.valor || "N/A"; });
          var hvalues = main.map(function (i) { return i[metric.key] || 0; });
          var hcolors = main.map(function (_, i) { return palette[i % palette.length]; });
          N.dimChartInstances.push(new Chart(canvas, {
            type: "bar",
            data: { labels: hlabels, datasets: [{ data: hvalues, backgroundColor: hcolors, borderRadius: 3 }] },
            options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: "easeOutQuart" }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return metric.fmt(ctx.parsed.x); } } } }, scales: { y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } }, x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } } } }
          }));
        } else if (metric.chartType === "bar") {
          var total = items.reduce(function (s, i) { return s + (i[metric.key] || 0); }, 0);
          var main = [], othersSum = 0, othersCount = 0;
          items.forEach(function (i) { var v = i[metric.key] || 0; if (total > 0 && (v / total * 100) < 2.5) { othersSum += v; othersCount++; } else { main.push(i); } });
          if (othersCount > 0) { var o = { valor: "Otros" }; o[metric.key] = othersSum / othersCount; main.push(o); }
          main.sort(function (a, b) { return (b[metric.key] || 0) - (a[metric.key] || 0); });
          var oIdx = main.findIndex(function (i) { return i.valor === "Otros"; });
          if (oIdx !== -1) { var oi = main.splice(oIdx, 1)[0]; main.push(oi); }
          var blabels = main.map(function (i) { return i.valor || "N/A"; });
          var bvalues = main.map(function (i) { return i[metric.key] || 0; });
          var bcolors = main.map(function (_, i) { return palette[i % palette.length]; });
          N.dimChartInstances.push(new Chart(canvas, {
            type: "bar",
            data: { labels: blabels, datasets: [{ data: bvalues, backgroundColor: bcolors, borderRadius: 3 }] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: "easeOutQuart" }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return metric.fmt(ctx.parsed.y); } } } }, scales: { x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } } } }
          }));
        }
      });
    });
  }

  function getWeight(item, metricKey) {
    if (metricKey === "pct_etapa8") return item.etapa_8_count || 0;
    if (metricKey === "pct_perdidos") return item.perdidos || 0;
    if (metricKey === "pct_rescate_perdidos") return item.perdidos || 0;
    return (item.total_clientes || 0);
  }

  function loadAnalyticsData() {
    function check(r) { if (!r.ok) throw Error("HTTP " + r.status); return r.json(); }
    Promise.all([
      fetch("/crm/api/metrics/totals/").then(check),
      fetch("/crm/api/metrics/tiempo-instalacion/").then(check),
      fetch("/crm/api/metrics/tiempo-por-etapa/").then(check),
      fetch("/crm/api/metrics/efectividad/").then(check),
      fetch("/crm/api/metrics/etapa8/").then(check),
      fetch("/crm/api/metrics/perdido/").then(check),
      fetch("/crm/api/metrics/rescate/").then(check),
      fetch("/crm/api/dimensions/totals/").then(check),
      fetch("/crm/api/dimensions/tiempo-instalacion/").then(check),
      fetch("/crm/api/dimensions/efectividad/").then(check),
      fetch("/crm/api/dimensions/etapa8/").then(check),
      fetch("/crm/api/dimensions/perdido/").then(check),
      fetch("/crm/api/dimensions/rescate/").then(check),
    ]).then(function (resps) {
      renderAnalyticsCards(resps[0], resps[1], resps[2], resps[3], resps[4], resps[5], resps[6]);
      var avgData = mergeDimensionData(resps[7], resps[8], null, resps[9], resps[10], resps[11], resps[12]);
      renderDimensionCharts(avgData, resps[0], resps[1], resps[3], resps[4], resps[5], resps[6]);
    }).catch(function () { N.showToast("Error cargando analytics CRM", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("analytics-cards-container")) {
      loadAnalyticsData();
    }
  });
})();
