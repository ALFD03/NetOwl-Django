(function () {
  "use strict";

  var N = window.NetOwl;

  function updateAnalyticsFilterLabel() {
    var label = document.getElementById("analytics-filter-label");
    if (!label) return;
    var checked = document.querySelectorAll("#analytics-periods-checkboxes input:checked").length;
    label.textContent = checked + " periodo" + (checked !== 1 ? "s" : "") + " seleccionado" + (checked !== 1 ? "s" : "");
  }

  function initAnalyticsFilter() {
    var toggle = document.getElementById("analytics-filter-toggle");
    var menu = document.getElementById("analytics-filter-menu");
    var container = document.getElementById("analytics-filter-dropdown");
    if (!toggle || !menu || !container) return;

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("show");
    });

    document.addEventListener("click", function (e) {
      if (!container.contains(e.target) && menu.classList.contains("show")) {
        menu.classList.remove("show");
      }
    });
  }

  function loadAnalyticsPeriodsList() {
    fetch("/subscriptions/api/periods/")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) {
        var container = document.getElementById("analytics-periods-checkboxes");
        if (!container) return;
        container.innerHTML = "";
        var periods = d.periods || [];
        var now = new Date();
        var yearMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
        var existsCur = periods.some(function (p) { return p.indexOf(yearMonth) !== -1; });
        periods.forEach(function (p) {
          var div = document.createElement("div");
          div.className = "form-check";
          var cb = document.createElement("input");
          cb.type = "checkbox"; cb.className = "form-check-input"; cb.value = p; cb.id = "aperiod-" + p;
          if (p.indexOf(yearMonth) !== -1 || (!existsCur && p === periods[0])) cb.checked = true;
          var lb = document.createElement("label");
          lb.className = "form-check-label"; lb.htmlFor = "aperiod-" + p; lb.textContent = p;
          div.appendChild(cb); div.appendChild(lb); container.appendChild(div);
          cb.addEventListener("change", function () {
            var checked = document.querySelectorAll("#analytics-periods-checkboxes input:checked").length;
            if (checked === 0) { this.checked = true; return; }
            loadAnalyticsData();
            updateAnalyticsFilterLabel();
          });
        });
        var resetBtn = document.getElementById("analytics-reset-btn");
        if (resetBtn) {
          resetBtn.addEventListener("click", function () {
            document.querySelectorAll("#analytics-periods-checkboxes input").forEach(function (cb) { cb.checked = cb.value.indexOf(yearMonth) !== -1 || (!existsCur && cb.value === periods[0]); });
            loadAnalyticsData();
            updateAnalyticsFilterLabel();
          });
        }
        if (periods.length) { updateAnalyticsFilterLabel(); loadAnalyticsData(); }
      })
      .catch(function () {});
  }

  function loadAnalyticsData() {
    var cbs = document.querySelectorAll("#analytics-periods-checkboxes input[type=checkbox]:checked");
    var vals = Array.from(cbs).map(function (cb) { return cb.value; }).filter(Boolean);
    var url = "/subscriptions/api/analytics-data/";
    if (vals.length) url += "?periods=" + encodeURIComponent(vals.join(","));
    return fetch(url)
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (data) {
        renderAnalyticsCards(data.periodos || []);
        renderDimensionCharts(data.dimensiones || [], data.periodos || []);
      })
      .catch(function () { N.showToast("Error cargando analytics", "error"); });
  }

  function renderAnalyticsCards(periodos) {
    var container = document.getElementById("analytics-cards-container");
    if (!container) return;
    if (!periodos.length) { container.innerHTML = '<div class="col-12 text-center text-muted py-4">Sin datos</div>'; return; }

    function avg(path) {
      var vals = [];
      periodos.forEach(function (p) {
        var v = path.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, p);
        if (v !== undefined) vals.push(Number(v));
      });
      return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
    }

    function colorChurn(v) { return v < 2.5 ? "text-success" : v <= 3 ? "text-warning" : "text-danger"; }
    function colorNuevos(v) { return v > 2500 ? "text-success" : v >= 2000 ? "text-warning" : "text-danger"; }
    function colorBajas(v) { return v < 500 ? "text-success" : v <= 1000 ? "text-warning" : "text-danger"; }
    function colorWinback(v) { return v >= 90 ? "text-success" : v >= 80 ? "text-warning" : "text-danger"; }
    function colorArpu(v) { return v >= 30 ? "text-success" : v >= 25 ? "text-warning" : "text-danger"; }
    function colorAdiciones(v) { return v > 500 ? "text-success" : v >= 1 ? "text-warning" : "text-danger"; }
    function colorSuspensiones(v) { return v >= 40 ? "text-danger" : v >= 35 ? "text-warning" : "text-success"; }

    function card(label, val, fmt, clr) {
      return '<div class="col-xl-2 col-md-3 col-sm-4"><div class="metric-card"><div class="metric-label">' + label + '</div><div class="fs-3 fw-bold ' + clr(val) + '">' + fmt(val) + '</div></div></div>';
    }
    function group(title, items) {
      var inner = items.map(function (c) { return card(c[0], c[1], c[2], c[3]); }).join("");
      return '<div class="col-12 mb-3"><h6 class="text-muted mb-2" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px">' + title + '</h6><div class="row g-2">' + inner + '</div></div>';
    }

    var html = "";
    html += group("Churn", [
      ["Churn Neto", avg("churn_neto_pct"), function (v) { return v.toFixed(2) + "%"; }, colorChurn],
      ["Churn Bruto", avg("churn_bruto_pct"), function (v) { return v.toFixed(2) + "%"; }, colorChurn],
      ["Bajas Netas", avg("bajas_netas"), function (v) { return Math.round(v).toLocaleString(); }, colorBajas],
      ["Bajas Brutas", avg("bajas_brutas"), function (v) { return Math.round(v).toLocaleString(); }, colorBajas],
      ["Corte Impago", avg("corte_impagado"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["% Suspensiones", avg("porcentaje_suspensiones"), function (v) { return v.toFixed(2) + "%"; }, colorSuspensiones],
    ]);
    html += group("Crecimiento", [
      ["Nuevos en el Mes", avg("nuevos_mes"), function (v) { return Math.round(v).toLocaleString(); }, colorNuevos],
      ["Reactivaciones Totales", avg("reactivaciones"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Reactivaciones", avg("react_val"), function (v) { return Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Tasa Winback", avg("tasa_winback_pct"), function (v) { return v.toFixed(2) + "%"; }, colorWinback],
    ]);
    html += group("Ingresos", [
      ["ARPU", avg("arpu"), function (v) { return "$" + v.toFixed(2); }, colorArpu],
      ["Total Billing", avg("total_billing"), function (v) { return "$" + Math.round(v).toLocaleString(); }, function () { return "text-success"; }],
      ["Tasa Aporte React.", avg("tasa_aporte_react_pct"), function (v) { return v.toFixed(2) + "%"; }, function () { return "text-success"; }],
      ["Indice Reemplazo", avg("indice_reemplazo_react_pct"), function (v) { return v.toFixed(2) + "%"; }, function () { return "text-success"; }],
    ]);
    html += group("Adiciones", [
      ["Adiciones Netas", avg("adiciones_netas"), function (v) { return Math.round(v).toLocaleString(); }, colorAdiciones],
      ["Adiciones Brutas", avg("adiciones_brutas"), function (v) { return Math.round(v).toLocaleString(); }, colorAdiciones],
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
            accum[dimKey][val] = { sum: { churn_neto_pct: 0, churn_bruto_pct: 0, arpu: 0, tasa_winback_pct: 0, adiciones_netas: 0, adiciones_brutas: 0, tasa_aporte_react_pct: 0, corte_impagado: 0, porcentaje_suspensiones: 0, nuevos: 0, activos_final: 0 }, count: 0 };
          }
          ["churn_neto_pct", "churn_bruto_pct", "arpu", "tasa_winback_pct", "adiciones_netas", "adiciones_brutas", "tasa_aporte_react_pct", "corte_impagado", "porcentaje_suspensiones", "nuevos", "activos_final"].forEach(function (m) {
            accum[dimKey][val].sum[m] += (item[m] || 0);
          });
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
    if (metricKey === "adiciones_netas" || metricKey === "adiciones_brutas") return item[metricKey] || 0;
    if (metricKey === "arpu") return (item.activos_final || 0) * (item[metricKey] || 0);
    return (item.activos_final || 0) * (item[metricKey] || 0) / 100;
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
        var af = i.activos_final || 0;
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
    var dimLabels = { zona: "Zona", sucursal: "Sucursal", producto: "Producto", municipio: "Municipio", campana: "Campana" };
    var metrics = [
      { key: "churn_neto_pct", label: "Churn Neto", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "churn_bruto_pct", label: "Churn Bruto", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "arpu", label: "ARPU", chartType: "hbar", fmt: function (v) { return "$" + v.toFixed(2); } },
      { key: "tasa_winback_pct", label: "Tasa Winback", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "adiciones_netas", label: "Adiciones Netas", chartType: "bar", fmt: function (v) { return Math.round(v).toLocaleString(); } },
      { key: "adiciones_brutas", label: "Adiciones Brutas", chartType: "bar", fmt: function (v) { return Math.round(v).toLocaleString(); } },
      { key: "tasa_aporte_react_pct", label: "Aporte React.", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "porcentaje_suspensiones", label: "% Suspensiones", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
    ];

    var isLight = document.documentElement.classList.contains("light-mode");
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var bgColor = isLight ? "#fff" : "#1e293b";
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var palette = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#d946ef", "#0d9488", "#e11d48", "#7c3aed", "#65a30d", "#0891b2", "#c026d3", "#dc2626", "#ca8a04"];

    var html = "";
    metrics.forEach(function (metric) {
      html += '<div class="card mb-4"><div class="card-header"><h5><i class="bi bi-pie-chart me-2"></i>' + metric.label + '</h5></div><div class="card-body"><div class="row g-4">';
      dimKeys.forEach(function (dimKey) {
        var canvasId = "dimc-" + metric.key + "-" + dimKey;
        html += '<div class="col-lg mb-4"><h6 class="text-muted small text-center mb-2">' + (dimLabels[dimKey] || dimKey) + '</h6><div class="chart-container" style="position:relative;height:280px"><canvas id="' + canvasId + '"></canvas></div></div>';
      });
      html += '</div></div></div>';
    });
    container.innerHTML = html;

    var allItemsForFallback = Object.keys(avgData).reduce(function (acc, dk) { return acc.concat(avgData[dk]); }, []);

    metrics.forEach(function (metric) {
      var globalCenterVal = metric.fmt(getGlobalMetric(metric.key, allItemsForFallback));
      dimKeys.forEach(function (dimKey) {
        var items = avgData[dimKey];
        if (!items.length) return;
        var canvasId = "dimc-" + metric.key + "-" + dimKey;
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (metric.chartType === "doughnut" || metric.chartType === "pie") {
          var totalWeight = 0;
          items.forEach(function (i) { i._w = getWeight(i, metric.key); totalWeight += i._w; });
          if (!totalWeight) return;
          var mainItems = [], othersW = 0, othersAct = 0, othersMetricSum = 0, othersCount = 0;
          items.forEach(function (i) {
            var pct = (i._w / totalWeight) * 100;
            if (pct < 2.5) { othersW += i._w; othersAct += (i.activos_final || 0); othersMetricSum += (i[metric.key] || 0) * (i.activos_final || 0); othersCount++; }
            else { mainItems.push(i); }
          });
          if (othersW > 0) { var o = { valor: "Otros", _w: othersCount > 0 ? othersW / othersCount : 0, activos_final: othersAct }; o[metric.key] = othersAct > 0 ? othersMetricSum / othersAct : 0; mainItems.push(o); }
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
    if (document.getElementById("analytics-periods-checkboxes")) {
      initAnalyticsFilter();
      loadAnalyticsPeriodsList();
    }
  });
})();
