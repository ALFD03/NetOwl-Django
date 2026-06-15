(function () {
  "use strict";

  var N = window.NetOwl;

  function makeThresholdPlugin(id, zones, targetLine) {
    return {
      id: id,
      beforeDraw: function (chart) {
        var ya = chart.scales.y;
        if (!ya) return;
        var ca = chart.chartArea;
        if (!ca || ca.left === undefined) return;
        var l = ca.left, r = ca.right, t = ca.top, b = ca.bottom;
        var ctx = chart.ctx;
        (zones || []).forEach(function (z) {
          var y0 = ya.getPixelForValue(z.from);
          var y1 = ya.getPixelForValue(z.to);
          if (y0 === undefined || y1 === undefined) return;
          ctx.save();
          ctx.fillStyle = z.color;
          ctx.fillRect(l, Math.max(t, Math.min(y0, y1)), r - l, Math.min(b, Math.max(y0, y1)) - Math.max(t, Math.min(y0, y1)));
          ctx.restore();
        });
        if (targetLine) {
          var yTarget = ya.getPixelForValue(targetLine.value);
          if (yTarget !== undefined && yTarget !== null) {
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = targetLine.color || "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(l, yTarget);
            ctx.lineTo(r, yTarget);
            ctx.stroke();
            if (targetLine.label) {
              ctx.fillStyle = targetLine.color || "#ffffff";
              ctx.font = "bold 10px sans-serif";
              ctx.textAlign = "right";
              ctx.fillText(targetLine.label, r - 4, yTarget - 5);
            }
            ctx.restore();
          }
        }
      }
    };
  }

  function destroyDashboardCharts() {
    [N.churnLineChart, N.winbackBarChart, N.arpuBarChart, N.aporteReactBarChart, N.reemplazoLineChart, N.adicionesBarChart, N.cortesReactChart, N.activosInicioChart, N.activosFinalChart].forEach(function (c) { if (c) { c.destroy(); c = null; } });
    N.churnLineChart = N.winbackBarChart = N.arpuBarChart = N.aporteReactBarChart = N.reemplazoLineChart = N.adicionesBarChart = N.cortesReactChart = N.activosInicioChart = N.activosFinalChart = null;
  }

  function renderDashboardCharts(periodos) {
    destroyDashboardCharts();
    if (!periodos.length) return;
    var labels = periodos.map(function (p) { return p.periodo_reporte; }).reverse();
    var pdata = {};
    periodos.forEach(function (p) { pdata[p.periodo_reporte] = p; });
    function v(key) { return function (l) { var d = pdata[l]; return d ? d[key] || 0 : 0; }; }
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var lblColor = tickColor;

    var churnNeto = labels.map(v("churn_neto_pct"));
    var churnBruto = labels.map(v("churn_bruto_pct"));
    var churnAvg = labels.map(function (_, i) { return (churnNeto[i] + churnBruto[i]) / 2; });
    var churnPlugin = makeThresholdPlugin("churnLine", null, { value: 3, color: "#ffffff", label: "Objetivo 3%" });
    function churnSeg(ctx) { if (!ctx || !ctx.p1 || !ctx.p1.parsed) return; var val = ctx.p1.parsed.y; return val < 2.5 ? "#22c55e" : val <= 3 ? "#eab308" : "#ef4444"; }
    function churnPt(v) { return v < 2.5 ? "#22c55e" : v <= 3 ? "#eab308" : "#ef4444"; }
    function churnBar(v) { return v < 2.5 ? "rgba(34,197,94,0.75)" : v <= 3 ? "rgba(234,179,8,0.75)" : "rgba(239,68,68,0.75)"; }

    var ctx1 = document.getElementById("churnLineChart");
    if (ctx1) {
      N.churnLineChart = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Churn Neto", data: churnNeto, type: "line", borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: churnNeto.map(churnPt) },
            { label: "Churn Bruto", data: churnBruto, type: "line", borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: churnBruto.map(churnPt) },
            { label: "Promedio", data: churnAvg, backgroundColor: churnAvg.map(churnBar), borderRadius: 3, order: 1, datalabels: { display: true, color: lblColor, anchor: "end", align: "end", font: { size: 14, weight: "bold" }, formatter: function (val) { return val.toFixed(1) + "%"; } } },
          ]
        },
        options: N.chartOpts(Object.assign(N.barOpts(gridColor, tickColor), { plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } } })),
        plugins: [churnPlugin]
      });
    }

    var activosInicioData = labels.map(v("activos_inicio"));
    var ctxActivosInicio = document.getElementById("activosInicioChart");
    if (ctxActivosInicio) {
      N.activosInicioChart = new Chart(ctxActivosInicio, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Activos Inicio", data: activosInicioData, backgroundColor: "rgba(37,99,235,0.75)", borderRadius: 4 }] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    var activosFinalData = labels.map(v("activos_final"));
    var ctxActivosFinal = document.getElementById("activosFinalChart");
    if (ctxActivosFinal) {
      N.activosFinalChart = new Chart(ctxActivosFinal, {
        type: "bar",
        data: { labels: labels, datasets: [{ label: "Activos Final", data: activosFinalData, backgroundColor: "rgba(16,185,129,0.75)", borderRadius: 4 }] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    var winbackData = labels.map(v("tasa_winback_pct"));
    var winbackPlugin = makeThresholdPlugin("winbackLine", null, { value: 80, color: "#ffffff", label: "Obj. 80%" });
    var ctx2 = document.getElementById("winbackBarChart");
    if (ctx2) {
      N.winbackBarChart = new Chart(ctx2, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "Tasa Winback", data: winbackData, backgroundColor: winbackData.map(function (v) { return (v || 0) < 80 ? "rgba(239,68,68,0.8)" : (v || 0) <= 90 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4, order: 1 },
          { label: "Tendencia", data: winbackData, type: "line", borderColor: "#fff", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fff", fill: false, order: 0 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor)),
        plugins: [winbackPlugin]
      });
    }

    var arpuData = labels.map(v("arpu"));
    var arpuPlugin = makeThresholdPlugin("arpuLine", null, { value: 25, color: "#ffffff", label: "Obj. 25" });
    var ctx3 = document.getElementById("arpuBarChart");
    if (ctx3) {
      N.arpuBarChart = new Chart(ctx3, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "ARPU", data: arpuData, backgroundColor: arpuData.map(function (v) { return (v || 0) < 25 ? "rgba(239,68,68,0.8)" : (v || 0) <= 30 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4, order: 1 },
          { label: "Tendencia", data: arpuData, type: "line", borderColor: "#fff", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fff", fill: false, order: 0 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor)),
        plugins: [arpuPlugin]
      });
    }

    var aporteData = labels.map(v("tasa_aporte_react_pct"));
    var ctx4 = document.getElementById("aporteReactBarChart");
    if (ctx4) {
      N.aporteReactBarChart = new Chart(ctx4, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "Tasa Aporte React.", data: aporteData, backgroundColor: "rgba(37,99,235,0.8)", borderRadius: 4, order: 1 },
          { label: "Tendencia", data: aporteData, type: "line", borderColor: "#fbbf24", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fbbf24", fill: false, order: 0 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    var reempData = labels.map(v("indice_reemplazo_react_pct"));
    var ctx5 = document.getElementById("reemplazoLineChart");
    if (ctx5) {
      N.reemplazoLineChart = new Chart(ctx5, {
        type: "line",
        data: { labels: labels, datasets: [
          { label: "Indice Reemplazo", data: reempData, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3 },
        ] },
        options: N.chartOpts(N.lineOpts(gridColor, tickColor))
      });
    }

    var adNetasData = labels.map(v("adiciones_netas"));
    var adBrutasData = labels.map(v("adiciones_brutas"));
    function adColors(v) { return (v || 0) < 0 ? "rgba(239,68,68,0.8)" : (v || 0) <= 1000 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }
    var adicionesPlugin = makeThresholdPlugin("adicionesLine", null, { value: 0, color: "#ffffff", label: "Obj. 0" });
    var ctx6 = document.getElementById("adicionesBarChart");
    if (ctx6) {
      N.adicionesBarChart = new Chart(ctx6, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "Adiciones Netas", data: adNetasData, backgroundColor: adNetasData.map(adColors), borderRadius: 4 },
          { label: "Adiciones Brutas", data: adBrutasData, backgroundColor: adBrutasData.map(adColors), borderRadius: 4 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor)),
        plugins: [adicionesPlugin]
      });
    }

    var cortesData = labels.map(v("corte_impagado"));
    var reactData = labels.map(v("reactivaciones"));
    var ctx8 = document.getElementById("cortesReactChart");
    if (ctx8) {
      N.cortesReactChart = new Chart(ctx8, {
        type: "line",
        data: { labels: labels, datasets: [
          { label: "Cortes Automaticos", data: cortesData, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#ef4444", fill: true },
          { label: "Reactivaciones", data: reactData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.1)", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#22c55e", fill: true },
        ] },
        options: N.chartOpts(N.lineOpts(gridColor, tickColor))
      });
    }
  }

  function renderChurnComparativo(periodos) {
    var el = document.getElementById("churn-comparativo-value");
    if (!el) return;
    var vals = periodos.map(function (p) { return p.churn_neto_pct || 0; });
    if (!vals.length) { el.textContent = "N/A"; return; }
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var colorClass = avg < 2.5 ? "text-success" : avg <= 3 ? "text-warning" : "text-danger";
    el.textContent = avg.toFixed(2) + "%";
    el.className = "display-5 fw-bold " + colorClass;
  }

  function renderDashboardTable(periodos) {
    var tbody = document.getElementById("dashboard-table-tbody");
    if (!tbody) return;
    if (!periodos.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periodos.forEach(function (p) {
      var cn = p.churn_neto_pct || 0;
      var churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
      html += '<tr><td class="fw-medium">' + p.periodo_reporte + '</td><td class="text-end">' + (p.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (p.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (p.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">' + (p.churn_bruto_pct || 0).toFixed(2) + '%</td><td class="text-end">$' + (p.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + p.periodo_reporte + '"><i class="bi bi-eye"></i></button></td></tr>';
    });
    tbody.innerHTML = html;
  }

  function loadDashboardData() {
    fetch("/subscriptions/api/dashboard-data/")
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (data) {
        var periodos = data.periodos || [];
        renderDashboardCharts(periodos);
        renderDashboardTable(periodos.slice(0, 6));
        renderChurnComparativo(periodos);
      })
      .catch(function () { N.showToast("Error cargando dashboard", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("churnLineChart")) {
      N.loadComparisonPeriods();
      N.initResultsDetailsModal();
      loadDashboardData();
    }
  });
})();
