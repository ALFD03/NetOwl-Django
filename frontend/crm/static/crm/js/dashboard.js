(function () {
  "use strict";

  var N = window.NetOwl;

  function destroyDashboardCharts() {
    [N.tiempoEtapaChart, N.efectividadChart].forEach(function (c) { if (c) { c.destroy(); c = null; } });
    N.tiempoEtapaChart = N.efectividadChart = null;
  }

  function renderDashboardCharts(tiempoPorEtapa, efectividad) {
    destroyDashboardCharts();
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var cssVar = function(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
    var tickColor = cssVar("--text-primary") || (isLight ? "#0f172a" : "#E6EEF6");
    var palette = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#6366f1", "#84cc16"];
    var etapas = ["etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_8_devueltos", "etapa_9_disponibles", "etapa_10_proyectos"];
    var etapaLabels = ["1. Contacto", "2. Recepción", "3. Factibilidad", "4. Adecuaciones", "5. GPI", "6. Contratistas", "8. Devueltos", "9. Disponibles", "10. Proyectos"];
    var tiempoMap = {};
    if (tiempoPorEtapa && !Array.isArray(tiempoPorEtapa)) {
      tiempoMap = tiempoPorEtapa;
    } else {
      (tiempoPorEtapa || []).forEach(function (e) { if (e && e.etapa) tiempoMap[e.etapa] = e; });
    }
    var etGlobalLabels = [];
    var etGlobalData = [];
    var etGlobalColors = [];
    etapas.forEach(function (etapa, i) {
      var rec = tiempoMap[etapa];
      if (rec && rec.tiempo_promedio_horas != null) {
        etGlobalLabels.push(etapaLabels[i]);
        etGlobalData.push(Number(rec.tiempo_promedio_horas));
        etGlobalColors.push(palette[i] + "CC");
      }
    });
    var ctxEtapa = document.getElementById("tiempoEtapaChart");
    if (ctxEtapa) {
      N.tiempoEtapaChart = new Chart(ctxEtapa, {
        type: "bar",
        data: { labels: etGlobalLabels, datasets: [{ label: "Promedio (h)", data: etGlobalData, backgroundColor: etGlobalColors, borderRadius: 4 }] },
        options: N.chartOpts(Object.assign(N.barOpts(gridColor, tickColor), {
          plugins: { legend: { display: false } },
          scales: { x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } }, y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } } }
        }))
      });
    }
    var efectividadEtapas = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"];
    var efectividadLabels = ["Etapa 3 Factibilidad", "Etapa 4 Adecuaciones", "Etapa 5 GPI", "Ventas (Etapa 8)"];
    var efDatasets = [];
    efectividadEtapas.forEach(function (etapa, i) {
      var rec = null;
      if (efectividad && efectividad.length) {
        rec = efectividad.find(function(x) { return x.etapa === etapa; });
      }
      efDatasets.push({
        label: efectividadLabels[i],
        data: [rec ? Number(rec.efectividad_pct || 0) : null],
        backgroundColor: palette[i] + "CC",
        borderColor: palette[i],
        borderWidth: 1,
        borderRadius: 4
      });
    });
    var ctxEf = document.getElementById("efectividadChart");
    if (ctxEf) {
      N.efectividadChart = new Chart(ctxEf, {
        type: "bar",
        data: { labels: ["Global"], datasets: efDatasets },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }
  }

  function renderTiempoGauge(tiempoInstalacion) {
    var numEl = document.getElementById("gauge-number");
    var indEl = document.getElementById("gauge-indicator");
    if (!numEl || !indEl) return;
    var avg = tiempoInstalacion ? Number(tiempoInstalacion.horas_promedio || 0) : 0;
    if (!avg) { numEl.textContent = "N/A"; return; }
    numEl.textContent = avg.toFixed(1);
    var maxH = 168;
    var pct = Math.min((avg / maxH) * 100, 100);
    indEl.style.left = pct + "%";
    var color = avg < 72 ? "#22c55e" : avg <= 120 ? "#eab308" : "#ef4444";
    numEl.style.color = color;
    indEl.style.borderTopColor = color;
  }

  function renderPercentageGauge(containerId, value) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (value === undefined || value === null) { el.innerHTML = '<div class="text-muted py-3">Sin datos</div>'; return; }
    value = Number(value);
    var pct = Math.min(value, 100);
    var color = value < 30 ? "#22c55e" : value < 60 ? "#eab308" : "#ef4444";
    el.innerHTML =
      '<div class="gauge-value">' +
        '<span class="gauge-number" style="color:' + color + '">' + value.toFixed(1) + '</span><span class="unit">%</span>' +
      '</div>' +
      '<div class="gauge-track-wrap">' +
        '<div class="gauge-bar">' +
          '<div class="seg green" style="width:30%"></div>' +
          '<div class="seg yellow" style="width:30%"></div>' +
          '<div class="seg red" style="width:40%"></div>' +
        '</div>' +
        '<div class="gauge-indicator" style="left:' + pct + '%;border-top-color:' + color + '"></div>' +
        '<div class="gauge-ticks">' +
          '<span>0</span><span>30</span><span>60</span><span>100%</span>' +
        '</div>' +
      '</div>';
  }

  function loadDashboardData() {
    function check(r) { if (!r.ok) throw Error(r.status); return r.json(); }
    Promise.all([
      fetch("/crm/api/metricas/tiempo-por-etapa/").then(check),
      fetch("/crm/api/metricas/efectividad/").then(check),
      fetch("/crm/api/metricas/tiempo-instalacion/").then(check),
      fetch("/crm/api/metricas/etapa8/").then(check),
      fetch("/crm/api/metricas/perdido/").then(check),
      fetch("/crm/api/metricas/rescate/").then(check),
    ]).then(function (resps) {
      renderDashboardCharts(resps[0] || [], resps[1] || []);
      renderTiempoGauge(resps[2] || {});
      renderPercentageGauge("probEtapa8Gauge", (resps[3] || {}).pct);
      renderPercentageGauge("probPerdidosGauge", (resps[4] || {}).pct);
      renderPercentageGauge("rescateGauge", (resps[5] || {}).pct_rescate);
    }).catch(function () { N.showToast("Error cargando dashboard CRM", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("gauge-number")) {
      loadDashboardData();
    }
  });
})();
