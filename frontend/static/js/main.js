(function () {
  "use strict";

  if (typeof ChartDataLabels !== "undefined") { Chart.register(ChartDataLabels); Chart.defaults.plugins.datalabels.display = false; }
  let churnLineChart = null, winbackBarChart = null, arpuBarChart = null;
  let aporteReactBarChart = null, reemplazoLineChart = null, adicionesBarChart = null;
  let churnTrendChart = null, growthChart = null;
  let allHistoricalPeriods = [];

  document.addEventListener("DOMContentLoaded", function () {
    initSpaRouter();
    initThemeManager();
    initMonthPicker();
    loadComparisonPeriods();
    loadAnalyticsPeriodsList();
    initAnalysisExecutor();
    initCSVImporter();
    initResultsDetailsModal();
  });

  function initSpaRouter() {
    document.querySelectorAll("a[data-link]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const href = this.getAttribute("href");
        history.pushState(null, "", href);
        navigate(href);
      });
    });
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".switch-tab-btn");
      if (btn) {
        e.preventDefault();
        let path = btn.dataset.target === "results_list" ? "/results/" : "/";
        history.pushState(null, "", path);
        navigate(path);
      }
    });
    window.addEventListener("popstate", function () { navigate(window.location.pathname); });
    navigate(window.location.pathname);
  }

  function navigate(path) {
    const cleanPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    document.querySelectorAll(".spa-tab").forEach(function (t) { t.classList.add("d-none"); });
    document.querySelectorAll(".sidebar-nav .nav-link").forEach(function (l) { l.classList.remove("active"); });
    if (cleanPath === "" || cleanPath === "/" || cleanPath === "/dashboard") {
      document.getElementById("tab-dashboard").classList.remove("d-none");
      activateNavLink("dashboard");
      loadDashboardData();
    } else if (cleanPath === "/analytics") {
      document.getElementById("tab-analytics").classList.remove("d-none");
      activateNavLink("analytics");
      loadAnalyticsData();
    } else if (cleanPath === "/import/subscriptions" || cleanPath === "/import/logs") {
      document.getElementById("tab-import").classList.remove("d-none");
      activateNavLink("import_subscriptions");
      setImportType(cleanPath.includes("/logs") ? "logs" : "subscriptions");
    } else if (cleanPath.startsWith("/results")) {
      document.getElementById("tab-results").classList.remove("d-none");
      activateNavLink("results_list");
      loadResultsData();
    } else {
      document.getElementById("tab-dashboard").classList.remove("d-none");
      activateNavLink("dashboard");
      loadDashboardData();
    }
  }

  function activateNavLink(v) {
    const el = document.querySelector('.sidebar-nav a[data-link="' + v + '"]');
    if (el) el.classList.add("active");
  }

  function getCsrfToken() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute("content") : "";
  }

  function showToast(msg, type) {
    const el = document.getElementById("status-toast");
    const msgEl = document.getElementById("toast-message");
    if (!el || !msgEl) return;
    msgEl.textContent = msg;
    el.classList.remove("bg-success", "bg-danger", "bg-warning", "bg-info", "bg-dark");
    el.classList.add(type === "success" ? "bg-success" : type === "error" ? "bg-danger" : type === "warning" ? "bg-warning" : "bg-dark");
    new bootstrap.Toast(el, { delay: 5000 }).show();
  }

  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  function showLoading(t) { if (overlay) { if (loadingText) loadingText.textContent = t || "Procesando..."; overlay.classList.remove("d-none"); } }
  function hideLoading() { if (overlay) overlay.classList.add("d-none"); }
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;

  function initThemeManager() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      document.documentElement.classList.toggle("light-mode");
      const isLight = document.documentElement.classList.contains("light-mode");
      updateThemeUI(isLight);
      localStorage.setItem("netowl-theme", isLight ? "light" : "dark");
      refreshAllCharts();
    });
    const saved = localStorage.getItem("netowl-theme");
    updateThemeUI(saved === "light");
    if (saved === "light") document.documentElement.classList.add("light-mode");
  }

  function updateThemeUI(isLight) {
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.querySelector("span").textContent = isLight ? "Modo Oscuro" : "Modo Claro";
      btn.querySelector("i").className = isLight ? "bi bi-sun-fill me-2" : "bi bi-moon-stars me-2";
    }
    const logo = document.getElementById("sidebar-logo");
    if (logo) logo.src = isLight ? "/static/img/logo_light.png" : "/static/img/logo_dark.png";
    const fav = document.getElementById("favicon-link");
    if (fav) fav.href = isLight ? "/static/img/favicon_light.png" : "/static/img/favicon_dark.png";
  }

  function initMonthPicker() {
    const monthS = document.getElementById("month-select");
    const yearS = document.getElementById("year-select");
    const input = document.getElementById("month-input");
    if (!monthS || !yearS || !input) return;
    monthS.innerHTML = '<option value="">Mes</option>';
    for (let m = 1; m <= 12; m++) {
      const o = document.createElement("option");
      o.value = String(m).padStart(2, "0");
      o.textContent = new Date(0, m - 1).toLocaleString("es", { month: "long" });
      monthS.appendChild(o);
    }
    const now = new Date(), curY = now.getFullYear();
    yearS.innerHTML = '<option value="">Ano</option>';
    for (let y = curY - 5; y <= curY + 5; y++) {
      const o = document.createElement("option");
      o.value = y; o.textContent = y; yearS.appendChild(o);
    }
    if (!input.value) {
      monthS.value = String(now.getMonth() + 1).padStart(2, "0");
      yearS.value = curY;
      input.value = curY + "-" + monthS.value;
    }
    function upd() {
      if (monthS.value && yearS.value) input.value = yearS.value + "-" + monthS.value;
      else input.value = "";
    }
    monthS.addEventListener("change", upd);
    yearS.addEventListener("change", upd);
  }

  function loadComparisonPeriods() {
    fetch("/api/periods/").then(r => r.ok ? r.json() : []).then(d => {
      const sel = document.getElementById("comparison-period-select");
      if (!sel) return;
      sel.innerHTML = '<option value="">Periodo</option>';
      (d.periods || []).forEach(p => {
        const o = document.createElement("option");
        o.value = p; o.textContent = p; sel.appendChild(o);
      });
    }).catch(function () {});
  }

  function loadAnalyticsPeriodsList() {
    fetch("/api/periods/").then(r => r.ok ? r.json() : []).then(d => {
      const sel = document.getElementById("analytics-periods-select");
      if (!sel) return;
      sel.innerHTML = "";
      (d.periods || []).forEach(p => {
        const o = document.createElement("option");
        o.value = p; o.textContent = p; sel.appendChild(o);
      });
      sel.addEventListener("change", function () { loadAnalyticsData(); });
      if (d.periods && d.periods.length) sel.value = d.periods[0];
      sel.dispatchEvent(new Event("change"));
    }).catch(function () {});
  }

  function refreshAllCharts() {
    if (!document.getElementById("tab-dashboard").classList.contains("d-none")) loadDashboardData();
    else if (!document.getElementById("tab-analytics").classList.contains("d-none")) loadAnalyticsData();
  }

  // ================================================================
  // DASHBOARD - GRAFICOS
  // ================================================================
  function loadDashboardData() {
    fetch("/api/dashboard-data/")
      .then(r => { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(data => {
        const periodos = data.periodos || [];
        renderDashboardCharts(periodos);
        renderDashboardTable(periodos.slice(0, 6));
        renderChurnComparativo(periodos);
      })
      .catch(function () { showToast("Error cargando dashboard", "error"); });
  }

  function renderChurnComparativo(periodos) {
    const el = document.getElementById("churn-comparativo-value");
    if (!el) return;
    const vals = [];
    periodos.forEach(function (p) {
      (p.metodos || []).forEach(function (m) {
        if (m.metodo === "Financiero") vals.push(m.churn_neto_pct || 0);
      });
    });
    if (!vals.length) { el.textContent = "N/A"; return; }
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var colorClass = avg < 2.5 ? "text-success" : avg <= 3 ? "text-warning" : "text-danger";
    el.textContent = avg.toFixed(2) + "%";
    el.className = "display-5 fw-bold " + colorClass;
  }

  function renderDashboardTable(periodos) {
    const tbody = document.getElementById("dashboard-table-tbody");
    if (!tbody) return;
    if (!periodos.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">Sin datos</td></tr>';
      return;
    }
    let html = "";
    periodos.forEach(p => {
      (p.metodos || []).forEach(m => {
        const cn = m.churn_neto_pct || 0;
        const churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
        html += '<tr><td class="fw-medium">' + p.periodo_reporte + '</td><td><span class="badge ' + (m.metodo === "Financiero" ? "bg-primary-subtle text-primary" : "bg-info-subtle text-info") + ' rounded-pill px-3 py-1">' + m.metodo + '</span></td><td class="text-end">' + (m.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (m.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (m.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">' + (m.churn_bruto_pct || 0).toFixed(2) + '%</td><td class="text-end">$' + (m.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + p.periodo_reporte + '"><i class="bi bi-eye"></i></button></td></tr>';
      });
    });
    tbody.innerHTML = html;
  }

  function renderDashboardCharts(periodos) {
    destroyDashboardCharts();
    if (!periodos.length) return;
    const labels = periodos.map(p => p.periodo_reporte).reverse();
    const finData = {}, opData = {};
    periodos.forEach(p => {
      (p.metodos || []).forEach(m => {
        const target = m.metodo === "Financiero" ? finData : opData;
        if (!target[p.periodo_reporte]) target[p.periodo_reporte] = {};
        target[p.periodo_reporte] = m;
      });
    });
    const isLight = document.documentElement.classList.contains("light-mode");
    const gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";

    function v(d, key) { return d ? d[key] || 0 : 0; }

    // Helper para plugin de bandas de umbral + linea objetivo
    function makeThresholdPlugin(id, zones, targetLine) {
      return {
        id: id,
        beforeDraw: function (chart) {
          var ya = chart.scales.y;
          if (!ya) return;
          var ca = chart.chartArea;
          if (!ca || ca.left === undefined || ca.top === undefined) return;
          var l = ca.left, r = ca.right, t = ca.top, b = ca.bottom;
          var ctx = chart.ctx;
          (zones || []).forEach(function (z) {
            var y0 = ya.getPixelForValue(z.from);
            var y1 = ya.getPixelForValue(z.to);
            if (y0 === undefined || y1 === undefined) return;
            var rectTop = Math.min(y0, y1);
            var rectBottom = Math.max(y0, y1);
            ctx.save();
            ctx.fillStyle = z.color;
            ctx.fillRect(l, Math.max(t, rectTop), r - l, Math.min(b, rectBottom) - Math.max(t, rectTop));
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

    // 1. Churn Neto y Bruto - Financiero solido, Operativo punteado + barras de promedios
    const finNeto = labels.map(l => v(finData[l], "churn_neto_pct"));
    const opNeto = labels.map(l => v(opData[l], "churn_neto_pct"));
    const finBruto = labels.map(l => v(finData[l], "churn_bruto_pct"));
    const opBruto = labels.map(l => v(opData[l], "churn_bruto_pct"));
    const promFin = labels.map((_, i) => (finNeto[i] + finBruto[i]) / 2);
    const promOp = labels.map((_, i) => (opNeto[i] + opBruto[i]) / 2);
    const promGeneral = labels.map((_, i) => (finNeto[i] + opNeto[i] + finBruto[i] + opBruto[i]) / 4);
    const lblColor = tickColor;

    const churnPlugin = makeThresholdPlugin("churnLine", null, { value: 3, color: "#ffffff", label: "Objetivo 3%" });

    function churnSeg(ctx) { if (!ctx || !ctx.p1 || !ctx.p1.parsed) return; var v = ctx.p1.parsed.y; return v < 2.5 ? "#22c55e" : v <= 3 ? "#eab308" : "#ef4444"; }
    function churnPt(v) { return v < 2.5 ? "#22c55e" : v <= 3 ? "#eab308" : "#ef4444"; }
    function churnBar(v) { return v < 2.5 ? "rgba(34,197,94,0.75)" : v <= 3 ? "rgba(234,179,8,0.75)" : "rgba(239,68,68,0.75)"; }

    const ctx1 = document.getElementById("churnLineChart");
    if (ctx1) {
      churnLineChart = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Churn Neto - Financiero", data: finNeto, type: "line", borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: finNeto.map(churnPt) },
            { label: "Churn Neto - Operativo", data: opNeto, type: "line", borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, borderDash: [5, 5], order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: opNeto.map(churnPt) },
            { label: "Churn Bruto - Financiero", data: finBruto, type: "line", borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: finBruto.map(churnPt) },
            { label: "Churn Bruto - Operativo", data: opBruto, type: "line", borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, borderDash: [5, 5], order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: opBruto.map(churnPt) },
            { label: "Prom. Financiero", data: promFin, backgroundColor: promFin.map(churnBar), borderRadius: 3, order: 1, datalabels: { display: true, color: lblColor, anchor: "end", align: "end", font: { size: 14, weight: "bold" }, formatter: function (val) { return val.toFixed(1) + "%"; } } },
            { label: "Prom. Operativo", data: promOp, backgroundColor: promOp.map(churnBar), borderRadius: 3, order: 1, datalabels: { display: true, color: lblColor, anchor: "end", align: "end", font: { size: 14, weight: "bold" }, formatter: function (val) { return val.toFixed(1) + "%"; } } },
            { label: "Prom. General", data: promGeneral, backgroundColor: promGeneral.map(churnBar), borderRadius: 3, order: 1, datalabels: { display: true, color: lblColor, anchor: "end", align: "end", font: { size: 14, weight: "bold" }, formatter: function (val) { return val.toFixed(1) + "%"; } } },
          ]
        },
        options: chartOpts(Object.assign(barOpts(gridColor, tickColor), { plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } } })),
        plugins: [churnPlugin]
      });
    }

    // 2. Winback - Barras solo Financiero (umbral: <80 rojo, 80-90 amarillo, >90 verde)
    const winbackFin = labels.map(l => v(finData[l], "tasa_winback_pct"));
    const winbackPlugin = makeThresholdPlugin("winbackLine", null, { value: 80, color: "#ffffff", label: "Obj. 80%" });
    const ctx2 = document.getElementById("winbackBarChart");
    if (ctx2) {
      winbackBarChart = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Tasa Winback", data: winbackFin, backgroundColor: winbackFin.map(function (v) { return (v || 0) < 80 ? "rgba(239,68,68,0.8)" : (v || 0) <= 90 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [winbackPlugin]
      });
    }

    // 3. ARPU - Barras solo Financiero (umbral: <25 rojo, 25-30 amarillo, >30 verde)
    const arpuFin = labels.map(l => v(finData[l], "arpu"));
    const arpuPlugin = makeThresholdPlugin("arpuLine", null, { value: 25, color: "#ffffff", label: "Obj. 25" });
    const ctx3 = document.getElementById("arpuBarChart");
    if (ctx3) {
      arpuBarChart = new Chart(ctx3, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "ARPU Financiero", data: arpuFin, backgroundColor: arpuFin.map(function (v) { return (v || 0) < 25 ? "rgba(239,68,68,0.8)" : (v || 0) <= 30 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [arpuPlugin]
      });
    }

    // 4. Tasa Aporte Reactivacion - Barras solo Financiero
    const aporteFin = labels.map(l => v(finData[l], "tasa_aporte_react_pct"));
    const ctx4 = document.getElementById("aporteReactBarChart");
    if (ctx4) {
      aporteReactBarChart = new Chart(ctx4, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Tasa Aporte React.", data: aporteFin, backgroundColor: "rgba(37,99,235,0.8)", borderRadius: 4 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor))
      });
    }

    // 5. Indice de Reemplazo - Linea solo Financiero
    const reempFin = labels.map(l => v(finData[l], "indice_reemplazo_react_pct"));
    const ctx5 = document.getElementById("reemplazoLineChart");
    if (ctx5) {
      reemplazoLineChart = new Chart(ctx5, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            { label: "Indice Reemplazo", data: reempFin, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3 },
          ]
        },
        options: chartOpts(lineOpts(gridColor, tickColor))
      });
    }

    // 6. Adiciones Netas y Brutas - Barras solo Financiero (umbral: <0 rojo, 0-1000 amarillo, >1000 verde)
    const adNetasFin = labels.map(l => v(finData[l], "adiciones_netas"));
    const adBrutasFin = labels.map(l => v(finData[l], "adiciones_brutas"));
    function adColors(v) { return (v || 0) < 0 ? "rgba(239,68,68,0.8)" : (v || 0) <= 1000 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }
    const adicionesPlugin = makeThresholdPlugin("adicionesLine", null, { value: 0, color: "#ffffff", label: "Obj. 0" });
    const ctx6 = document.getElementById("adicionesBarChart");
    if (ctx6) {
      adicionesBarChart = new Chart(ctx6, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Adiciones Netas", data: adNetasFin, backgroundColor: adNetasFin.map(adColors), borderRadius: 4 },
            { label: "Adiciones Brutas", data: adBrutasFin, backgroundColor: adBrutasFin.map(adColors), borderRadius: 4 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [adicionesPlugin]
      });
    }
  }

  function destroyDashboardCharts() {
    [churnLineChart, winbackBarChart, arpuBarChart, aporteReactBarChart, reemplazoLineChart, adicionesBarChart].forEach(c => { if (c) { c.destroy(); c = null; } });
    churnLineChart = winbackBarChart = arpuBarChart = aporteReactBarChart = reemplazoLineChart = adicionesBarChart = null;
  }

  function chartOpts(specific) {
    return Object.assign({ responsive: true, maintainAspectRatio: false }, specific || {});
  }

  function lineOpts(gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  }

  function barOpts(gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  }

  // ================================================================
  // ANALYTICS - TARJETAS CON COLORES + GRAFICOS + TABLA + DIMENSIONES
  // ================================================================
  function loadAnalyticsData() {
    const sel = document.getElementById("analytics-periods-select");
    let url = "/api/analytics-data/";
    if (sel && sel.selectedOptions && sel.selectedOptions.length) {
      const vals = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
      if (vals.length) url += "?periods=" + encodeURIComponent(vals.join(","));
    }
    fetch(url)
      .then(r => { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(data => {
        renderAnalyticsCards(data.periodos || []);
        renderAnalyticsCharts(data.periodos || []);
        renderAnalyticsTable(data.periodos || []);
        renderDimensions(data.dimensiones || []);
      })
      .catch(function () { showToast("Error cargando analytics", "error"); });
  }

  function renderAnalyticsCards(periodos) {
    const container = document.getElementById("analytics-cards-container");
    if (!container) return;
    if (!periodos.length) { container.innerHTML = '<div class="col-12 text-center text-muted py-4">Sin datos</div>'; return; }

    function avg(path) {
      const vals = [];
      periodos.forEach(p => (p.metodos || []).forEach(m => {
        const v = path.split(".").reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, m);
        if (v !== undefined) vals.push(Number(v));
      }));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    function colorChurn(v) { return v < 2.5 ? "text-success" : v <= 3 ? "text-warning" : "text-danger"; }
    function colorNuevos(v) { return v > 2500 ? "text-success" : v >= 2000 ? "text-warning" : "text-danger"; }
    function colorBajas(v) { return v < 500 ? "text-success" : v <= 1000 ? "text-warning" : "text-danger"; }
    function colorWinback(v) { return v >= 90 ? "text-success" : v >= 80 ? "text-warning" : "text-danger"; }
    function colorArpu(v) { return v >= 30 ? "text-success" : v >= 25 ? "text-warning" : "text-danger"; }
    function colorAdiciones(v) { return v > 500 ? "text-success" : v >= 1 ? "text-warning" : "text-danger"; }

    const cards = [
      { label: "Churn Neto", val: avg("churn_neto_pct"), fmt: v => v.toFixed(2) + "%", clr: colorChurn },
      { label: "Churn Bruto", val: avg("churn_bruto_pct"), fmt: v => v.toFixed(2) + "%", clr: colorChurn },
      { label: "Nuevos en el Mes", val: avg("nuevos_mes"), fmt: v => Math.round(v).toLocaleString(), clr: colorNuevos },
      { label: "Bajas Netas", val: avg("bajas_netas_balance"), fmt: v => Math.round(v).toLocaleString(), clr: colorBajas },
      { label: "Reactivaciones", val: avg("reactivaciones"), fmt: v => Math.round(v).toLocaleString(), clr: function () { return "text-success"; } },
      { label: "Tasa Winback", val: avg("tasa_winback_pct"), fmt: v => v.toFixed(2) + "%", clr: colorWinback },
      { label: "ARPU", val: avg("arpu"), fmt: v => "$" + v.toFixed(2), clr: colorArpu },
      { label: "Total Billing", val: avg("total_billing"), fmt: v => "$" + Math.round(v).toLocaleString(), clr: function () { return "text-success"; } },
      { label: "Tasa Aporte React.", val: avg("tasa_aporte_react_pct"), fmt: v => v.toFixed(2) + "%", clr: function () { return "text-success"; } },
      { label: "Indice Reemplazo", val: avg("indice_reemplazo_react_pct"), fmt: v => v.toFixed(2) + "%", clr: function () { return "text-success"; } },
      { label: "Adiciones Netas", val: avg("adiciones_netas"), fmt: v => Math.round(v).toLocaleString(), clr: colorAdiciones },
      { label: "Adiciones Brutas", val: avg("adiciones_brutas"), fmt: v => Math.round(v).toLocaleString(), clr: colorAdiciones },
    ];

    let html = "";
    cards.forEach(c => {
      const colorClass = c.clr(c.val);
      html += '<div class="col-xl-3 col-md-4 col-sm-6"><div class="metric-card"><div class="metric-label">' + c.label + '</div><div class="fs-3 fw-bold ' + colorClass + '">' + c.fmt(c.val) + '</div></div></div>';
    });
    container.innerHTML = html;
  }

  function renderAnalyticsCharts(periodos) {
    if (churnTrendChart) { churnTrendChart.destroy(); churnTrendChart = null; }
    if (growthChart) { growthChart.destroy(); growthChart = null; }
    if (!periodos.length) return;
    const labels = periodos.map(p => p.periodo_reporte).reverse();
    const isLight = document.documentElement.classList.contains("light-mode");
    const gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";
    const finData = {}, opData = {};
    periodos.forEach(p => {
      (p.metodos || []).forEach(m => {
        const t = m.metodo === "Financiero" ? finData : opData;
        t[p.periodo_reporte] = m;
      });
    });
    function v(d, k) { return d ? d[k] || 0 : 0; }
    const finChurn = labels.map(l => v(finData[l], "churn_neto_pct"));
    const opChurn = labels.map(l => v(opData[l], "churn_neto_pct"));
    const finAdNetas = labels.map(l => v(finData[l], "adiciones_netas"));
    const opAdNetas = labels.map(l => v(opData[l], "adiciones_netas"));

    const ctx1 = document.getElementById("churnTrendChart");
    if (ctx1) {
      churnTrendChart = new Chart(ctx1, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            { label: "Financiero", data: finChurn, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, fill: true, pointRadius: 3 },
            { label: "Operativo", data: opChurn, borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.05)", borderWidth: 2, tension: 0.35, fill: true, pointRadius: 3 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 11 } } } },
          scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }, x: { grid: { color: gridColor }, ticks: { color: tickColor } } }
        }
      });
    }

    const ctx2 = document.getElementById("growthChart");
    if (ctx2) {
      growthChart = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Financiero", data: finAdNetas, backgroundColor: "rgba(37,99,235,0.8)", borderRadius: 4 },
            { label: "Operativo", data: opAdNetas, backgroundColor: "rgba(16,185,129,0.8)", borderRadius: 4 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 11 } } } },
          scales: { y: { grid: { color: gridColor }, ticks: { color: tickColor } }, x: { grid: { display: false }, ticks: { color: tickColor } } }
        }
      });
    }
  }

  function renderAnalyticsTable(periodos) {
    const tbody = document.getElementById("analytics-table-tbody");
    if (!tbody) return;
    let html = "";
    periodos.forEach(p => {
      (p.metodos || []).forEach(m => {
        const cn = m.churn_neto_pct || 0;
        const churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
        html += '<tr><td class="fw-medium">' + p.periodo_reporte + '</td><td><span class="badge ' + (m.metodo === "Financiero" ? "bg-primary-subtle text-primary" : "bg-info-subtle text-info") + ' rounded-pill px-3 py-1">' + m.metodo + '</span></td><td class="text-end">' + m.activos_inicio.toLocaleString() + '</td><td class="text-end">' + m.activos_final.toLocaleString() + '</td><td class="text-end">' + m.nuevos_mes.toLocaleString() + '</td><td class="text-end">' + m.bajas_netas_balance.toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">' + (m.churn_bruto_pct || 0).toFixed(2) + '%</td><td class="text-end">$' + (m.arpu || 0).toFixed(2) + '</td><td class="text-end">' + (m.tasa_winback_pct || 0).toFixed(2) + '%</td></tr>';
      });
    });
    if (!html) html = '<tr><td colspan="10" class="text-center py-4 text-muted">Sin datos</td></tr>';
    tbody.innerHTML = html;
  }

  function renderDimensions(dimensiones) {
    const grid = document.getElementById("dimensions-grid-container");
    if (!grid) return;
    if (!dimensiones || !dimensiones.length) { grid.innerHTML = '<div class="col-12 text-center text-muted py-3">Sin datos</div>'; return; }
    const dimData = dimensiones[0].dimensiones || {};
    const nameMap = { "zona": "Zona Geografica", "sucursal": "Sucursal", "producto": "Producto / Plan", "municipio": "Municipio", "campana": "Campana" };
    let html = "";
    Object.keys(dimData).forEach(key => {
      const items = dimData[key] || [];
      const title = nameMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
      html += '<div class="col-lg-4 col-md-6"><div class="dimension-card h-100"><h6 class="dimension-title"><i class="bi bi-tag-fill me-2 text-primary"></i>' + title + '</h6><div class="dimension-list">';
      if (!items.length) {
        html += '<div class="text-center py-4 text-muted small">Sin datos</div>';
      } else {
        items.sort(function (a, b) { return b.activos_final - a.activos_final; });
        items.forEach(function (item) {
          const label = (!item.valor || item.valor === "None") ? "N/A" : item.valor;
          const churnCls = (item.churn_neto_pct || 0) < 5 ? "text-success" : (item.churn_neto_pct || 0) < 10 ? "text-warning" : "text-danger";
          html += '<div class="dimension-item mb-2 pb-2 border-bottom"><div class="d-flex justify-content-between align-items-center"><span class="fw-semibold text-truncate me-2" style="max-width:160px" title="' + label + '">' + label + '</span><span class="badge bg-secondary-subtle text-secondary small">' + (item.activos_final || 0).toLocaleString() + '</span></div><div class="d-flex justify-content-between mt-1 small"><span class="' + churnCls + ' fw-medium">' + (item.churn_neto_pct || 0).toFixed(2) + '% Churn</span><span class="text-primary">$' + (item.arpu || 0).toFixed(1) + '</span></div></div>';
        });
      }
      html += '</div></div></div>';
    });
    if (!Object.keys(dimData).length) html = '<div class="col-12 text-center text-muted py-3">Sin dimensiones</div>';
    grid.innerHTML = html;
  }

  // ================================================================
  // EJECUTAR ANALISIS
  // ================================================================
  function initAnalysisExecutor() {
    const form = document.getElementById("run-analysis-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const month = document.getElementById("month-input").value;
      if (!month) { showToast("Seleccione un mes valido", "warning"); return; }
      showLoading("Ejecutando analisis...");
      const cc = document.getElementById("console-container");
      const tl = document.getElementById("terminal-log");
      if (cc) cc.classList.remove("d-none");
      if (tl) tl.textContent = "[SISTEMA] Iniciando analisis para " + month + "...\n";
      fetch("/api/run-analysis/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
        body: JSON.stringify({ month: month })
      }).then(function (r) { hideLoading(); return r.json(); }).then(function (d) {
        if (d.status === "success") {
          showToast("Analisis completado!", "success");
          if (tl) { tl.textContent += d.log_output; tl.scrollTop = tl.scrollHeight; }
          loadDashboardData();
        } else {
          showToast(d.message || "Error", "error");
          if (tl) tl.textContent += "\n[ERROR] " + d.message + "\n";
        }
      }).catch(function () {
        hideLoading();
        showToast("Error de conexion", "error");
        if (tl) tl.textContent += "\n[ERROR] Fallo de red.\n";
      });
    });
    const clearBtn = document.getElementById("clear-console");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        const tl = document.getElementById("terminal-log");
        if (tl) tl.textContent = "Consola limpia.";
      });
    }
  }

  // ================================================================
  // IMPORTADOR CSV
  // ================================================================
  function setImportType(type) {
    document.getElementById("type-" + type).checked = true;
    document.getElementById("format-sub-details").classList.toggle("d-none", type !== "subscriptions");
    document.getElementById("format-log-details").classList.toggle("d-none", type !== "logs");
  }

  function initCSVImporter() {
    document.getElementById("type-subscriptions").addEventListener("change", function () { setImportType("subscriptions"); });
    document.getElementById("type-logs").addEventListener("change", function () { setImportType("logs"); });
    const dropZone = document.getElementById("drop-zone-area");
    const fileInput = document.getElementById("csv-file-input");
    const browseBtn = document.getElementById("browse-files-btn");
    const displayFile = document.getElementById("selected-file-display");
    const displayName = document.getElementById("selected-file-name");
    const removeBtn = document.getElementById("remove-file-btn");
    const submitBtn = document.getElementById("submit-import-btn");
    if (browseBtn && fileInput) browseBtn.addEventListener("click", function () { fileInput.click(); });
    if (fileInput) {
      fileInput.addEventListener("change", function () { if (this.files.length) handleFile(this.files[0]); });
    }
    if (removeBtn) removeBtn.addEventListener("click", clearFile);
    if (dropZone) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
      ["dragenter", "dragover"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.add("dragover"); }); });
      ["dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.remove("dragover"); }); });
      dropZone.addEventListener("drop", function (e) {
        var f = e.dataTransfer.files[0];
        if (f && f.name.endsWith(".csv")) { fileInput.files = e.dataTransfer.files; handleFile(f); }
        else showToast("Solo archivos CSV", "warning");
      });
    }
    function handleFile(f) {
      if (displayName && displayFile && submitBtn) {
        displayName.textContent = f.name + " (" + (f.size / 1024).toFixed(1) + " KB)";
        displayFile.classList.remove("d-none");
        submitBtn.removeAttribute("disabled");
      }
    }
    function clearFile() {
      if (fileInput) fileInput.value = "";
      if (displayFile && submitBtn) { displayFile.classList.add("d-none"); submitBtn.setAttribute("disabled", "true"); }
    }
    document.getElementById("import-csv-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var file = fileInput.files[0];
      if (!file) return;
      showLoading("Cargando archivo...");
      var type = document.querySelector('input[name="import_type"]:checked').value;
      var endpoint = type === "subscriptions" ? "/api/import-subscriptions/" : "/api/import-logs/";
      var fd = new FormData();
      fd.append("csv_file", file);
      var pc = document.getElementById("upload-progress-container");
      var pb = document.getElementById("upload-progress-bar");
      if (pc) pc.classList.remove("d-none");
      if (pb) pb.style.width = "0%";
      submitBtn.setAttribute("disabled", "true");
      var pct = 0;
      var iv = setInterval(function () { pct = Math.min(pct + 10, 90); if (pb) pb.style.width = pct + "%"; }, 150);
      fetch(endpoint, { method: "POST", headers: { "X-CSRFToken": getCsrfToken() }, body: fd })
        .then(function (r) { clearInterval(iv); if (pb) pb.style.width = "100%"; setTimeout(function () { if (pc) pc.classList.add("d-none"); }, 600); if (!r.ok) throw Error("Error"); return r.json(); })
        .then(function (d) {
          hideLoading();
          if (d.status === "success") { showToast(d.message, "success"); clearFile(); setTimeout(function () { history.pushState(null, "", "/"); navigate("/"); }, 1200); }
          else { showToast(d.message || "Error", "error"); submitBtn.removeAttribute("disabled"); }
        })
        .catch(function () {
          clearInterval(iv); if (pc) pc.classList.add("d-none"); submitBtn.removeAttribute("disabled"); hideLoading();
          showToast("Error de conexion", "error");
        });
    });
  }

  // ================================================================
  // HISTORIAL Y MODAL
  // ================================================================
  function loadResultsData() {
    fetch("/api/results/").then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      allHistoricalPeriods = d.periods || [];
      renderResultsTable(allHistoricalPeriods);
      setupSearchFilter();
    }).catch(function () { showToast("Error cargando historial", "error"); });
  }

  function renderResultsTable(periods) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!periods.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periods.forEach(function (r) {
      var cn = r.churn_neto_pct || 0;
      var churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
      html += '<tr><td class="fw-semibold">' + r.periodo + '</td><td><span class="badge ' + (r.metodo === "Financiero" ? "bg-primary-subtle text-primary" : "bg-info-subtle text-info") + ' rounded-pill px-3 py-1">' + r.metodo + '</span></td><td class="text-end">' + (r.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (r.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (r.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">$' + (r.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + r.periodo + '"><i class="bi bi-eye"></i></button></td></tr>';
    });
    tbody.innerHTML = html;
  }

  function setupSearchFilter() {
    var input = document.getElementById("search-results-input");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      renderResultsTable(allHistoricalPeriods.filter(function (r) { return r.periodo.toLowerCase().includes(q) || r.metodo.toLowerCase().includes(q); }));
    });
  }

  function initResultsDetailsModal() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".view-details-btn");
      if (btn && btn.dataset.periodo) openPeriodDetailsModal(btn.dataset.periodo);
    });
  }

  function openPeriodDetailsModal(periodo) {
    showLoading("Consultando " + periodo + "...");
    fetch("/api/results/" + periodo + "/").then(function (r) { hideLoading(); if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      var el = document.getElementById("detailsModal");
      if (!el) return;
      document.getElementById("modal-period-title").textContent = d.periodo;
      renderModalSummaries(d.summaries || []);
      renderModalDimensions(d.dimensions || {});
      new bootstrap.Modal(el).show();
    }).catch(function () { hideLoading(); showToast("Error al obtener detalle", "error"); });
  }

  function renderModalSummaries(summaries) {
    var c = document.getElementById("modal-summaries-container");
    if (!c) return;
    if (!summaries.length) { c.innerHTML = '<div class="col-12 text-center text-muted py-3">Sin resumen</div>'; return; }
    var html = "";
    summaries.forEach(function (s) {
      var isFin = s.metodo === "Financiero";
      html += '<div class="col-md-6"><div class="card h-100 border-1" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-header d-flex justify-content-between align-items-center bg-transparent py-2"><span class="fw-bold text-primary">' + s.metodo + '</span><span class="badge ' + (isFin ? "bg-primary text-white" : "bg-info text-dark") + ' rounded-pill px-2 py-1">' + s.metodo + '</span></div><div class="card-body p-3"><div class="row g-2 text-center"><div class="col-4"><span class="d-block text-muted small">Base Inicio</span><span class="fw-semibold">' + (s.activos_inicio || 0).toLocaleString() + '</span></div><div class="col-4"><span class="d-block text-muted small">Base Final</span><span class="fw-semibold">' + (s.activos_final || 0).toLocaleString() + '</span></div><div class="col-4"><span class="d-block text-muted small">Nuevos</span><span class="fw-semibold">' + (s.nuevos_mes || 0).toLocaleString() + '</span></div></div><hr class="my-2" style="border-top:1px solid var(--border-color)"><div class="row g-2 text-center mt-1"><div class="col-4"><span class="d-block text-muted small">Churn Neto</span><span class="fw-bold text-danger">' + (s.churn_neto_pct || 0).toFixed(2) + '%</span></div><div class="col-4"><span class="d-block text-muted small">ARPU</span><span class="fw-bold text-success">$' + (s.arpu || 0).toFixed(2) + '</span></div><div class="col-4"><span class="d-block text-muted small">Billing</span><span class="fw-bold text-primary">$' + Math.round(s.total_billing || 0).toLocaleString() + '</span></div></div><hr class="my-2" style="border-top:1px solid var(--border-color)"><div class="row g-2 text-center mt-1 small"><div class="col-6"><span class="text-muted">Winback:</span><span class="fw-medium">' + (s.tasa_winback_pct || 0).toFixed(2) + '% (' + (s.reactivaciones || 0) + ')</span></div><div class="col-6"><span class="text-muted">Impagos:</span><span class="fw-medium text-warning">' + (s.corte_impagado || 0) + '</span></div></div></div></div></div>';
    });
    c.innerHTML = html;
  }

  function renderModalDimensions(dimensions) {
    var c = document.getElementById("modal-dimensions-container");
    if (!c) return;
    if (!dimensions || !Object.keys(dimensions).length) { c.innerHTML = '<div class="col-12 text-center text-muted py-3">Sin dimensiones</div>'; return; }
    var nameMap = { "zona": "Zona Geografica", "sucursal": "Sucursal", "producto": "Producto / Plan", "municipio": "Municipio", "campana": "Campana" };
    var html = "";
    Object.keys(dimensions).forEach(function (key) {
      var items = dimensions[key] || [];
      var title = nameMap[key] || key.toUpperCase();
      html += '<div class="col-lg-6"><div class="card h-100" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-header bg-transparent py-2"><span class="fw-bold"><i class="bi bi-tag-fill me-2 text-primary"></i>' + title + '</span></div><div class="card-body p-0"><div class="table-responsive" style="max-height:250px"><table class="table table-sm table-hover align-middle mb-0 table-theme" style="font-size:0.85rem"><thead><tr><th class="ps-3">Valor</th><th class="text-end">Activos</th><th class="text-end">Churn</th><th class="text-end pe-3">ARPU</th></tr></thead><tbody>';
      items.sort(function (a, b) { return (b.activos_final || 0) - (a.activos_final || 0); });
      items.forEach(function (item) {
        var val = (!item.valor || item.valor === "None") ? "N/A" : item.valor;
        var churnCls = (item.churn_neto_pct || 0) < 5 ? "text-success" : (item.churn_neto_pct || 0) < 10 ? "text-warning" : "text-danger";
        html += '<tr><td class="ps-3 fw-medium text-truncate" style="max-width:150px" title="' + val + '">' + val + '</td><td class="text-end">' + (item.activos_final || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnCls + '">' + (item.churn_neto_pct || 0).toFixed(2) + '%</td><td class="text-end pe-3">$' + (item.arpu || 0).toFixed(1) + '</td></tr>';
      });
      html += '</tbody></table></div></div></div></div>';
    });
    c.innerHTML = html;
  }
})();
