(function () {
  "use strict";

  var N = window.NetOwl;

  function loadAnalyticsData() {
    return fetch("/crm/api/analytics-data/")
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (data) {
        renderAnalyticsCards(data.periodos || []);
        renderDimensionCharts(data.dimensiones || [], data.periodos || []);
      })
      .catch(function () { N.showToast("Error cargando analytics CRM", "error"); });
  }

  function renderAnalyticsCards(periodos) {
    var container = document.getElementById("analytics-cards-container");
    if (!container) return;
    if (!periodos.length) { container.innerHTML = '<div class="col-12 text-center text-muted py-4">Sin datos</div>'; return; }

    function avg(path) {
      var vals = [];
      periodos.forEach(function (p) {
        var v = path.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, p);
        if (v !== undefined && v !== null) vals.push(Number(v));
      });
      return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
    }

    function avgEfectividad(etapaKey) {
      var vals = [];
      periodos.forEach(function (p) {
        var ef = p.efectividad || [];
        var e = ef.find(function(x) { return x.etapa === etapaKey; });
        if (e && e.efectividad_pct !== undefined && e.efectividad_pct !== null) vals.push(Number(e.efectividad_pct));
      });
      return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
    }

    function colorChurn(v) { return v < 2.5 ? "text-success" : v <= 3 ? "text-warning" : "text-danger"; }
    function colorTiempo(v) { return v < 24 ? "text-success" : v <= 48 ? "text-warning" : "text-danger"; }
    function colorEfectividad(v) { return v >= 90 ? "text-success" : v >= 70 ? "text-warning" : "text-danger"; }
    function colorProb(v) { return v < 10 ? "text-success" : v <= 20 ? "text-warning" : "text-danger"; }
    function colorRescate(v) { return v >= 50 ? "text-success" : v >= 20 ? "text-warning" : "text-danger"; }

    function card(c) {
      return '<div class="col-xl-2 col-md-3 col-sm-4"><div class="metric-card"><div class="metric-label">' + c.label + '</div><div class="fs-3 fw-bold ' + c.clr(c.val) + '">' + c.fmt(c.val) + '</div></div></div>';
    }
    function group(title, items) {
      var inner = items.map(function (c) { return c instanceof Array ? card({ label: c[0], val: c[1], fmt: c[2], clr: c[3] }) : card(c); }).join("");
      return '<div class="col-12 mb-3"><h6 class="text-muted mb-2" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px">' + title + '</h6><div class="row g-2">' + inner + '</div></div>';
    }

    var tiProm = avg("tiempo_instalacion.horas_promedio");
    var tiMed = avg("tiempo_instalacion.horas_mediana");
    var tip25 = avg("tiempo_instalacion.horas_p25");
    var tip75 = avg("tiempo_instalacion.horas_p75");
    var tiMin = avg("tiempo_instalacion.horas_min");
    var tiMax = avg("tiempo_instalacion.horas_max");
    var tiStd = avg("tiempo_instalacion.horas_std");

    var html = "";
    html += group("Tiempo Instalación", [
      ["Promedio", tiProm, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Mediana", tiMed, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["P25", tip25, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["P75", tip75, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Mínimo", tiMin, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Máximo", tiMax, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Desviación Estándar", tiStd, function (v) { return v.toFixed(1) + "h"; }, colorTiempo],
      ["Total Instalados", avg("tiempo_instalacion.total_instalados"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
    ]);
    html += group("Efectividad", [
      ["Etapa 3", avgEfectividad("etapa_3_factibilidad"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Etapa 4", avgEfectividad("etapa_4_adecuaciones"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Etapa 5", avgEfectividad("etapa_5_gpi"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
      ["Ventas", avgEfectividad("ventas"), function (v) { return v.toFixed(1) + "%"; }, colorEfectividad],
    ]);
    html += group("Probabilidad", [
      ["% Etapa 8", avg("probabilidad_etapa8_perdidos.resumen.pct_etapa8"), function (v) { return v.toFixed(1) + "%"; }, colorProb],
      ["% Perdidos", avg("probabilidad_etapa8_perdidos.resumen.pct_perdidos"), function (v) { return v.toFixed(1) + "%"; }, colorProb],
    ]);
    html += group("Rescate", [
      ["Rescate Perdidos", avg("rescate_perdidos.pct_rescate"), function (v) { return v.toFixed(1) + "%"; }, colorRescate],
    ]);
    html += group("Totales", [
      ["Total Clientes", avg("total_clientes"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Ganados", avg("ganados"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Perdidos", avg("perdidos"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-danger"; }],
      ["Etapa 8", avg("etapa_8_count"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-warning"; }],
    ]);
    container.innerHTML = html;
  }

  function averageDimensionData(dimensiones) {
    var accum = {};
    dimensiones.forEach(function (period) {
      var dims = period.dimensiones || {};
      Object.keys(dims).forEach(function (dimKey) {
        if (!accum[dimKey]) accum[dimKey] = {};
        (dims[dimKey] || []).forEach(function (item) {
          var val = item.valor || "N/A";
          if (!accum[dimKey][val]) {
            accum[dimKey][val] = { 
              sum: { 
                tiempo_instalacion_promedio_horas: 0, pct_etapa8: 0, pct_perdidos: 0, 
                pct_rescate_perdidos: 0, total_clientes: 0, ganados: 0, perdidos: 0,
                etapa_8_count: 0, efecto_3: 0, efecto_4: 0, efecto_5: 0, efecto_ventas: 0
              }, 
              count: 0 
            };
          }
          ["tiempo_instalacion_promedio_horas", "pct_etapa8", "pct_perdidos", "pct_rescate_perdidos", "total_clientes", "ganados", "perdidos", "etapa_8_count"].forEach(function (m) {
            accum[dimKey][val].sum[m] += (item[m] || 0);
          });
          // Efectividad
          var ef = item.efectividad || {};
          accum[dimKey][val].sum.efecto_3 += (ef["etapa_3_factibilidad"] || 0);
          accum[dimKey][val].sum.efecto_4 += (ef["etapa_4_adecuaciones"] || 0);
          accum[dimKey][val].sum.efecto_5 += (ef["etapa_5_gpi"] || 0);
          accum[dimKey][val].sum.efecto_ventas += (ef["ventas"] || 0);
          accum[dimKey][val].count++;
        });
      });
    });
    var result = {};
    Object.keys(accum).forEach(function (dimKey) {
      result[dimKey] = [];
      Object.keys(accum[dimKey]).forEach(function (valor) {
        var entry = { valor: valor };
        Object.keys(accum[dimKey][valor].sum).forEach(function (m) {
          entry[m] = accum[dimKey][valor].sum[m] / accum[dimKey][valor].count;
        });
        result[dimKey].push(entry);
      });
    });
    return result;
  }

  function getWeight(item, metricKey) {
    if (metricKey === "tiempo_instalacion_promedio_horas") return item.total_clientes || 0;
    return (item.total_clientes || 0);
  }

  function getGlobalMetric(metricKey, fallbackItems) {
    var vals = [];
    if (window.lastPeriodos) {
      window.lastPeriodos.forEach(function (p) {
        var v = p[metricKey];
        if (v !== undefined && v !== null) vals.push(Number(v));
      });
    }
    if (vals.length) return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    if (fallbackItems && fallbackItems.length) {
      var totalAct = 0, totalWeighted = 0;
      fallbackItems.forEach(function (i) {
        var af = i.total_clientes || 0;
        totalAct += af;
        totalWeighted += af * (i[metricKey] || 0);
      });
      if (totalAct > 0) return totalWeighted / totalAct;
    }
    return 0;
  }

  function renderDimensionCharts(dimensiones, periodos) {
    window.lastPeriodos = periodos;
    var container = document.getElementById("analytics-dimension-charts");
    if (!container) return;
    N.dimChartInstances.forEach(function (c) { c.destroy(); });
    N.dimChartInstances = [];
    if (!dimensiones || !dimensiones.length) { container.innerHTML = '<div class="text-center text-muted py-4">Sin datos de dimensiones</div>'; return; }

    var avgData = averageDimensionData(dimensiones);
    var dimKeys = Object.keys(avgData).filter(function (k) { return avgData[k].length > 0; });
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

    var allItemsForFallback = Object.keys(avgData).reduce(function (acc, dk) { return acc.concat(avgData[dk]); }, []);

    metrics.forEach(function (metric) {
      var metricDimKeys = getApplicableDimKeys(metric.key);
      if (!metricDimKeys.length) return;
      var globalCenterVal = metric.fmt(getGlobalMetric(metric.key, allItemsForFallback));
      metricDimKeys.forEach(function (dimKey) {
        var items = avgData[dimKey];
        if (!items.length) return;
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

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("analytics-cards-container")) {
      loadAnalyticsData();
    }
  });
})();
