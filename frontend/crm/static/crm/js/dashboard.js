(function () {
  "use strict";

  var N = window.NetOwl;

  function destroyDashboardCharts() {
    [N.tiempoEtapaChart, N.efectividadChart].forEach(function (c) { if (c) { c.destroy(); c = null; } });
    N.tiempoEtapaChart = N.efectividadChart = null;
  }

  function renderDashboardCharts(periodos) {
    destroyDashboardCharts();
    if (!periodos.length) return;
    
    var labels = periodos.map(function (p) { return p.periodo; }).reverse();
    var pdata = {};
    periodos.forEach(function (p) { pdata[p.periodo] = p; });
    
    function v(key) { 
      return function (l) { 
        var d = pdata[l]; 
        if (!d) return 0;
        var v = key.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, d);
        return v !== undefined ? Number(v) : 0; 
      }; 
    }
    
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var cssVar = function(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };
    var tickColor = cssVar("--text-primary") || (isLight ? "#0f172a" : "#E6EEF6");

    // Tiempo por Etapa (barras simples con promedio global, sin etapa_7)
    var etapas = ["etapa_1_contacto", "etapa_2_recepcion", "etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_8_devueltos", "etapa_9_disponibles", "etapa_10_proyectos"];
    var etapaLabels = ["1. Contacto", "2. Recepción", "3. Factibilidad", "4. Adecuaciones", "5. GPI", "6. Contratistas", "8. Devueltos", "9. Disponibles", "10. Proyectos"];
    var palette = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#f97316", "#6366f1", "#84cc16"];

    // Calcular promedio global por etapa
    var etGlobalLabels = [];
    var etGlobalData = [];
    var etGlobalColors = [];
    etapas.forEach(function (etapa, i) {
      var vals = [];
      labels.forEach(function (l) {
        var d = pdata[l];
        if (!d || !d.tiempo_por_etapa) return;
        var etapaData = d.tiempo_por_etapa[etapa];
        if (etapaData && etapaData.tiempo_promedio_horas !== undefined && etapaData.tiempo_promedio_horas !== null) {
          vals.push(Number(etapaData.tiempo_promedio_horas));
        }
      });
      if (vals.length) {
        var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        etGlobalLabels.push(etapaLabels[i]);
        etGlobalData.push(avg);
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

    // Efectividad (3 etapas + ventas) - barras agrupadas
    var efectividadEtapas = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"];
    var efectividadLabels = ["Etapa 3 Factibilidad", "Etapa 4 Adecuaciones", "Etapa 5 GPI", "Ventas (Etapa 8)"];
    var efDatasets = [];
    efectividadEtapas.forEach(function (etapa, i) {
      var data = labels.map(function(l) {
        var d = pdata[l];
        if (!d || !d.efectividad) return null;
        var e = d.efectividad.find(function(x) { return x.etapa === etapa; });
        return e ? Number(e.efectividad_pct || 0) : null;
      });
      efDatasets.push({
        label: efectividadLabels[i],
        data: data,
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
        data: { labels: labels, datasets: efDatasets },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    // Tiempo por etapa detail eliminado
  }

  function renderTiempoGauge(periodos) {
    var numEl = document.getElementById("gauge-number");
    var indEl = document.getElementById("gauge-indicator");
    if (!numEl || !indEl) return;
    var vals = periodos.map(function (p) {
      var ti = p.tiempo_instalacion;
      return ti ? Number(ti.horas_promedio || 0) : 0;
    });
    if (!vals.length) { numEl.textContent = "N/A"; return; }
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
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
    fetch("/crm/api/dashboard-data/")
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (data) {
        var periodos = data.periodos || [];
        renderDashboardCharts(periodos);
        renderTiempoGauge(periodos);
        var vals8 = periodos.map(function(p) {
          var r = p.probabilidad_etapa8_perdidos;
          return r && r.resumen ? Number(r.resumen.pct_etapa8 || 0) : null;
        }).filter(function(v) { return v !== null; });
        renderPercentageGauge("probEtapa8Gauge", vals8.length ? vals8.reduce(function(a,b){return a+b;})/vals8.length : 0);
        var valsP = periodos.map(function(p) {
          var r = p.probabilidad_etapa8_perdidos;
          return r && r.resumen ? Number(r.resumen.pct_perdidos || 0) : null;
        }).filter(function(v) { return v !== null; });
        renderPercentageGauge("probPerdidosGauge", valsP.length ? valsP.reduce(function(a,b){return a+b;})/valsP.length : 0);
        var valsR = periodos.map(function(p) {
          return p.rescate_perdidos ? Number(p.rescate_perdidos.pct_rescate || 0) : null;
        }).filter(function(v) { return v !== null; });
        renderPercentageGauge("rescateGauge", valsR.length ? valsR.reduce(function(a,b){return a+b;})/valsR.length : 0);
      })
      .catch(function () { N.showToast("Error cargando dashboard CRM", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("gauge-number")) {
      loadDashboardData();
    }
  });
})();