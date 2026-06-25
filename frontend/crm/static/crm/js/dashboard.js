(function () {
  "use strict";

  var N = window.NetOwl;

  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function destroyDashboardCharts() {
    [N.tiempoInstalacionChart, N.tiempoEtapaChart, N.efectividadChart, N.probEtapa8Chart, N.probPerdidosChart, N.rescateChart].forEach(function (c) { if (c) { c.destroy(); c = null; } });
    N.tiempoInstalacionChart = N.tiempoEtapaChart = N.efectividadChart = N.probEtapa8Chart = N.probPerdidosChart = N.rescateChart = null;
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
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var primaryColor = getCSSVar("--primary") || "#2563eb";
    var textColor = getCSSVar("--text-primary") || (isLight ? "#0f172a" : "#E6EEF6");

    // Tiempo Instalación
    var tiempoInstData = labels.map(v("tiempo_instalacion.horas_promedio"));
    var ctx1 = document.getElementById("tiempoInstalacionChart");
    if (ctx1) {
      N.tiempoInstalacionChart = new Chart(ctx1, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "Horas Promedio", data: tiempoInstData, backgroundColor: primaryColor + "BF", borderRadius: 4 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

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

    // Efectividad (3 etapas + ventas)
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
        borderColor: palette[i],
        backgroundColor: palette[i] + "20",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: palette[i],
        fill: false,
        spanGaps: true
      });
    });

    var ctxEf = document.getElementById("efectividadChart");
    if (ctxEf) {
      N.efectividadChart = new Chart(ctxEf, {
        type: "line",
        data: { labels: labels, datasets: efDatasets },
        options: N.chartOpts(N.lineOpts(gridColor, tickColor))
      });
    }

    // Probabilidad Etapa 8
    var prob8Data = labels.map(v("probabilidad_etapa8_perdidos.resumen.pct_etapa8"));
    var ctxP8 = document.getElementById("probEtapa8Chart");
    if (ctxP8) {
      N.probEtapa8Chart = new Chart(ctxP8, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "% Etapa 8", data: prob8Data, backgroundColor: prob8Data.map(function(v) { return (v || 0) > 20 ? "rgba(239,68,68,0.8)" : (v || 0) > 10 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    // Probabilidad Perdidos
    var probPerdData = labels.map(v("probabilidad_etapa8_perdidos.resumen.pct_perdidos"));
    var ctxPP = document.getElementById("probPerdidosChart");
    if (ctxPP) {
      N.probPerdidosChart = new Chart(ctxPP, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "% Perdidos", data: probPerdData, backgroundColor: probPerdData.map(function(v) { return (v || 0) > 30 ? "rgba(239,68,68,0.8)" : (v || 0) > 15 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    // Rescate
    var rescateData = labels.map(v("rescate_perdidos.pct_rescate"));
    var ctxR = document.getElementById("rescateChart");
    if (ctxR) {
      N.rescateChart = new Chart(ctxR, {
        type: "bar",
        data: { labels: labels, datasets: [
          { label: "% Rescate", data: rescateData, backgroundColor: rescateData.map(function(v) { return (v || 0) >= 50 ? "rgba(34,197,94,0.8)" : (v || 0) >= 20 ? "rgba(234,179,8,0.8)" : "rgba(239,68,68,0.8)"; }), borderRadius: 4 },
        ] },
        options: N.chartOpts(N.barOpts(gridColor, tickColor))
      });
    }

    // Tiempo por etapa detail eliminado
  }

  function renderResumenValue(periodos) {
    var el = document.getElementById("crm-resumen-value");
    if (!el) return;
    var vals = periodos.map(function (p) { 
      var ti = p.tiempo_instalacion;
      return ti ? Number(ti.horas_promedio || 0) : 0; 
    });
    if (!vals.length) { el.textContent = "N/A"; return; }
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    el.textContent = avg.toFixed(1) + "h";
  }

  function renderDashboardTable(periodos) {
    var tbody = document.getElementById("dashboard-table-tbody");
    if (!tbody) return;
    if (!periodos.length) { tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periodos.forEach(function (p) {
      var ti = p.tiempo_instalacion || {};
      var prob = p.probabilidad_etapa8_perdidos?.resumen || {};
      var rescate = p.rescate_perdidos || {};
      var ef = p.efectividad || [];
      var ef3 = ef.find(function(x) { return x.etapa === "etapa_3_factibilidad"; }) || {};
      var ef4 = ef.find(function(x) { return x.etapa === "etapa_4_adecuaciones"; }) || {};
      var ef5 = ef.find(function(x) { return x.etapa === "etapa_5_gpi"; }) || {};
      var efv = ef.find(function(x) { return x.etapa === "ventas"; }) || {};
      
      html += '<tr>' +
        '<td class="fw-medium">' + p.periodo + '</td>' +
        '<td class="text-end">' + (p.total_clientes || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-success">' + (p.ganados || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-danger">' + (p.perdidos || 0).toLocaleString() + '</td>' +
        '<td class="text-end text-warning">' + (p.etapa_8_count || 0).toLocaleString() + '</td>' +
        '<td class="text-end">' + (ti.horas_promedio ? Number(ti.horas_promedio).toFixed(1) : 0) + '</td>' +
        '<td class="text-end">' + (ef3.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (ef4.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (ef5.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (efv.efectividad_pct || 0).toFixed(1) + '%</td>' +
        '<td class="text-end">' + (rescate.pct_rescate || 0).toFixed(1) + '%</td>' +
        '<td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + p.periodo + '"><i class="bi bi-eye"></i></button></td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  }

  function loadDashboardData() {
    fetch("/crm/api/dashboard-data/")
      .then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(function (data) {
        var periodos = data.periodos || [];
        renderDashboardCharts(periodos);
        renderDashboardTable(periodos.slice(0, 6));
        renderResumenValue(periodos);
      })
      .catch(function () { N.showToast("Error cargando dashboard CRM", "error"); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("tiempoInstalacionChart")) {
      N.initCRMResultsDetailsModal();
      loadDashboardData();
    }
  });
})();