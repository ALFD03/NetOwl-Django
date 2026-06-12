/**
 * NetOwl Churn Analysis – Frontend main script.
 *
 * Handles SPA routing, dashboard/analytics chart rendering, CSV import,
 * theme toggling, and historical results display.  All code runs inside an
 * IIFE to avoid polluting the global scope.
 */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  Chart.js datalabels plugin – register once, disabled by default    */
  /* ------------------------------------------------------------------ */
  if (typeof ChartDataLabels !== "undefined") { Chart.register(ChartDataLabels); Chart.defaults.plugins.datalabels.display = false; }

  /* ---------- Global chart instance references (one per canvas) ------ */
  let churnLineChart = null, winbackBarChart = null, arpuBarChart = null;
  let aporteReactBarChart = null, reemplazoLineChart = null, adicionesBarChart = null;
  let cortesReactChart = null, kmSurvivalChartS = null;
  /* Array of dimension chart instances (analytics tab) */
  let dimChartInstances = [];
  /* Cached list of all historical periods for client-side search filtering */
  let allHistoricalPeriods = [];

  /* ================================================================ */
  /*  INIT – runs once the DOM is ready                               */
  /* ================================================================ */
  document.addEventListener("DOMContentLoaded", function () {
    initSpaRouter();
    initThemeManager();
    initMonthPicker();
    loadComparisonPeriods();
    loadAnalyticsPeriodsList();
    initAnalyticsFilter();
    initAnalysisExecutor();
    initCSVImporter();
    initResultsDetailsModal();
    initSurvivalPage();
  });

  /* ================================================================ */
  /*  SPA ROUTER                                                      */
  /* ================================================================ */

  /**
   * Set up client-side routing: intercept link clicks and browser
   * popstate events, then show/hide tabs without a full page reload.
   */
  function initSpaRouter() {
    /* Intercept sidebar / nav links with data-link attributes */
    document.querySelectorAll("a[data-link]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const href = this.getAttribute("href");
        history.pushState(null, "", href);
        navigate(href);
      });
    });
    /* Intercept "switch tab" buttons (e.g. dashboard ↔ results) */
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".switch-tab-btn");
      if (btn) {
        e.preventDefault();
        let path = btn.dataset.target === "results_list" ? "/results/" : "/";
        history.pushState(null, "", path);
        navigate(path);
      }
    });
    /* Handle browser back/forward */
    window.addEventListener("popstate", function () { navigate(window.location.pathname); });
    /* Initial navigation based on current URL */
    navigate(window.location.pathname);
  }

  /**
   * Show the SPA tab matching the given URL path and load its data.
   * @param {string} path – URL pathname (e.g. "/dashboard", "/analytics").
   */
  function navigate(path) {
    /* Normalise: strip trailing slash unless path is just "/" */
    const cleanPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    /* Hide all tabs and deactivate all nav links */
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
    } else if (cleanPath === "/survival" || cleanPath === "/survival/") {
      document.getElementById("tab-survival").classList.remove("d-none");
      activateNavLink("survival");
      loadSurvivalPage();
      loadLifecycleResults();
    } else if (cleanPath.startsWith("/results")) {
      document.getElementById("tab-results").classList.remove("d-none");
      activateNavLink("results_list");
      loadResultsData();
    } else {
      /* Fallback – show dashboard */
      document.getElementById("tab-dashboard").classList.remove("d-none");
      activateNavLink("dashboard");
      loadDashboardData();
    }
  }

  /**
   * Mark the sidebar nav link for a given page as active.
   * @param {string} v – The data-link value of the nav item.
   */
  function activateNavLink(v) {
    const el = document.querySelector('.sidebar-nav a[data-link="' + v + '"]');
    if (el) el.classList.add("active");
  }

  /* ================================================================ */
  /*  UTILITY HELPERS                                                 */
  /* ================================================================ */

  /**
   * Read the CSRF token from the page's <meta> tag.
   * Required for all POST requests to Django endpoints.
   * @returns {string} The CSRF token value, or empty string if not found.
   */
  function getCsrfToken() {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute("content") : "";
  }

  /**
   * Display a Bootstrap toast notification.
   * @param {string} msg  – Message text.
   * @param {string} type – One of "success", "error", "warning", or any
   *                        other value (fallback to dark).
   */
  function showToast(msg, type) {
    const el = document.getElementById("status-toast");
    const msgEl = document.getElementById("toast-message");
    if (!el || !msgEl) return;
    msgEl.textContent = msg;
    el.classList.remove("bg-success", "bg-danger", "bg-warning", "bg-info", "bg-dark");
    el.classList.add(type === "success" ? "bg-success" : type === "error" ? "bg-danger" : type === "warning" ? "bg-warning" : "bg-dark");
    new bootstrap.Toast(el, { delay: 5000 }).show();
  }

  /* ---------- Full-screen loading overlay ---------- */
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  /** Show the loading overlay with an optional custom message. */
  function showLoading(t) { if (overlay) { if (loadingText) loadingText.textContent = t || "Procesando..."; overlay.classList.remove("d-none"); } }
  /** Hide the loading overlay. */
  function hideLoading() { if (overlay) overlay.classList.add("d-none"); }
  /* Expose globally so Jinja templates / inline scripts can call them */
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;

  /* ================================================================ */
  /*  THEME (LIGHT / DARK MODE)                                       */
  /* ================================================================ */

  /**
   * Initialise the theme-toggle button and restore the user's saved
   * preference from localStorage.
   */
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
    /* Restore saved preference on page load */
    const saved = localStorage.getItem("netowl-theme");
    updateThemeUI(saved === "light");
    if (saved === "light") document.documentElement.classList.add("light-mode");
  }

  /**
   * Update UI elements to reflect the current theme.
   * @param {boolean} isLight – Whether light mode is active.
   */
  function updateThemeUI(isLight) {
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.querySelector("span").textContent = isLight ? "Modo Oscuro" : "Modo Claro";
      btn.querySelector("i").className = isLight ? "bi bi-sun-fill me-2" : "bi bi-moon-stars me-2";
    }
    /* Swap sidebar logo and favicon */
    const logo = document.getElementById("sidebar-logo");
    if (logo) logo.src = isLight ? "/static/img/logo_light.png" : "/static/img/logo_dark.png";
    const fav = document.getElementById("favicon-link");
    if (fav) fav.href = isLight ? "/static/img/favicon_light.png" : "/static/img/favicon_dark.png";
  }

  /* ================================================================ */
  /*  MONTH PICKER (month-select + year-select → hidden input)        */
  /* ================================================================ */

  /**
   * Initialise the month/year dropdown pair used for the "run analysis"
   * form. Populates options and synchronises their values into a hidden
   * ``YYYY-MM`` input.
   */
  function initMonthPicker() {
    const monthS = document.getElementById("month-select");
    const yearS = document.getElementById("year-select");
    const input = document.getElementById("month-input");
    if (!monthS || !yearS || !input) return;
    /* Populate month dropdown – Spanish locale */
    monthS.innerHTML = '<option value="">Mes</option>';
    for (let m = 1; m <= 12; m++) {
      const o = document.createElement("option");
      o.value = String(m).padStart(2, "0");
      o.textContent = new Date(0, m - 1).toLocaleString("es", { month: "long" });
      monthS.appendChild(o);
    }
    /* Populate year dropdown – ±5 years around current year */
    const now = new Date(), curY = now.getFullYear();
    yearS.innerHTML = '<option value="">Ano</option>';
    for (let y = curY - 5; y <= curY + 5; y++) {
      const o = document.createElement("option");
      o.value = y; o.textContent = y; yearS.appendChild(o);
    }
    /* Default to current month if no value is set */
    if (!input.value) {
      monthS.value = String(now.getMonth() + 1).padStart(2, "0");
      yearS.value = curY;
      input.value = curY + "-" + monthS.value;
    }
    /* Update hidden input whenever a dropdown changes */
    function upd() {
      if (monthS.value && yearS.value) input.value = yearS.value + "-" + monthS.value;
      else input.value = "";
    }
    monthS.addEventListener("change", upd);
    yearS.addEventListener("change", upd);
  }

  /* ================================================================ */
  /*  PERIOD LOADING (shared across tabs)                             */
  /* ================================================================ */

  /**
   * Fetch the list of available periods and populate the comparison
   * period dropdown (used in results/historical views).
   */
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

  /* ================================================================ */
  /*  ANALYTICS FILTER DROPDOWN                                       */
  /* ================================================================ */

  /**
   * Initialise the click-to-toggle behaviour of the analytics period
   * filter dropdown, including click-outside-to-close.
   */
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

  /**
   * Fetch available periods from the API and build a checkbox list
   * inside the analytics filter.  Auto-selects the current period (or
   * the first one if the current period has no data yet).
   * Reloads analytics data whenever a checkbox is toggled.
   */
  function loadAnalyticsPeriodsList() {
    fetch("/api/periods/").then(r => r.ok ? r.json() : []).then(d => {
      var container = document.getElementById("analytics-periods-checkboxes");
      if (!container) return;
      container.innerHTML = "";
      var periods = d.periods || [];
      var now = new Date();
      /* Detect current period by Year-Month substring (the DB may use any format) */
      var yearMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
      var existsCur = periods.some(function (p) { return p.indexOf(yearMonth) !== -1; });
      periods.forEach(function (p) {
        var div = document.createElement("div");
        div.className = "form-check";
        var cb = document.createElement("input");
        cb.type = "checkbox"; cb.className = "form-check-input"; cb.value = p; cb.id = "aperiod-" + p;
        /* Auto-select current month (substring match), or first period if current isn't available */
        if (p.indexOf(yearMonth) !== -1 || (!existsCur && p === periods[0])) cb.checked = true;
        var lb = document.createElement("label");
        lb.className = "form-check-label"; lb.htmlFor = "aperiod-" + p; lb.textContent = p;
        div.appendChild(cb); div.appendChild(lb); container.appendChild(div);
        cb.addEventListener("change", function () {
          /* Prevent unchecking the last remaining checkbox */
          var checked = document.querySelectorAll("#analytics-periods-checkboxes input:checked").length;
          if (checked === 0) { this.checked = true; return; }
          loadAnalyticsData();
          updateAnalyticsFilterLabel();
        });
      });
      /* Reset button: restore default selection */
      var resetBtn = document.getElementById("analytics-reset-btn");
      if (resetBtn) {
        resetBtn.addEventListener("click", function () {
          document.querySelectorAll("#analytics-periods-checkboxes input").forEach(function (cb) { cb.checked = cb.value.indexOf(yearMonth) !== -1 || (!existsCur && cb.value === periods[0]); });
          loadAnalyticsData();
          updateAnalyticsFilterLabel();
        });
      }
      if (periods.length) { updateAnalyticsFilterLabel(); loadAnalyticsData(); }
    }).catch(function () {});
  }

  /**
   * Update the filter button label to show how many periods are selected.
   */
  function updateAnalyticsFilterLabel() {
    var label = document.getElementById("analytics-filter-label");
    if (!label) return;
    var checked = document.querySelectorAll("#analytics-periods-checkboxes input:checked").length;
    label.textContent = checked + " periodo" + (checked !== 1 ? "s" : "") + " seleccionado" + (checked !== 1 ? "s" : "");
  }

  /**
   * Reload data for whichever tab is currently visible, so chart colours
   * can adapt to the new theme.
   */
  function refreshAllCharts() {
    if (!document.getElementById("tab-dashboard").classList.contains("d-none")) loadDashboardData();
    else if (!document.getElementById("tab-analytics").classList.contains("d-none")) loadAnalyticsData();
    else if (!document.getElementById("tab-survival").classList.contains("d-none")) {
      loadSurvivalPage();
      loadSurvivalEvolution();
    }
  }

  /* ================================================================ */
  /*  DASHBOARD – CHARTS, TABLE & COMPARATIVE INDICATOR               */
  /* ================================================================ */

  /**
   * Fetch dashboard data from the API and render all dashboard widgets.
   * Shows the latest 6 periods in the table.
   */
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

  /**
   * Render a large "average churn" figure at the top of the dashboard.
   * Colours: green (<2.5 %), yellow (≤3 %), red (>3 %).
   * @param {Array} periodos – Array of period objects from the API.
   */
  function renderChurnComparativo(periodos) {
    const el = document.getElementById("churn-comparativo-value");
    if (!el) return;
    const vals = periodos.map(function (p) { return p.churn_neto_pct || 0; });
    if (!vals.length) { el.textContent = "N/A"; return; }
    var avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var colorClass = avg < 2.5 ? "text-success" : avg <= 3 ? "text-warning" : "text-danger";
    el.textContent = avg.toFixed(2) + "%";
    el.className = "display-5 fw-bold " + colorClass;
  }

  /**
   * Render the dashboard summary table showing key metrics per period.
   * Each row includes a "details" button linking to the results modal.
   * @param {Array} periodos – Array of period objects (sliced to latest N).
   */
  function renderDashboardTable(periodos) {
    const tbody = document.getElementById("dashboard-table-tbody");
    if (!tbody) return;
    if (!periodos.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Sin datos</td></tr>';
      return;
    }
    let html = "";
    periodos.forEach(function (p) {
      var cn = p.churn_neto_pct || 0;
      var churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
      html += '<tr><td class="fw-medium">' + p.periodo_reporte + '</td><td class="text-end">' + (p.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (p.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (p.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">' + (p.churn_bruto_pct || 0).toFixed(2) + '%</td><td class="text-end">$' + (p.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + p.periodo_reporte + '"><i class="bi bi-eye"></i></button></td></tr>';
    });
    tbody.innerHTML = html;
  }

  /**
   * Create (or re-create) all dashboard charts.
   * Calls destroyDashboardCharts first to clean up previous instances.
   *
   * Charts rendered:
   *   1. Churn Neto/Bruto (lines + avg. bars) – target line at 3 %.
   *   2. Winback rate bar + trend line             – target line at 80 %.
   *   3. ARPU bar + trend line                     – target line at 25.
   *   4. Tasa Aporte Reactivación bar + trend line.
   *   5. Índice de Reemplazo line.
   *   6. Adiciones Netas & Brutas bars             – target line at 0.
   *   7. Cortes Automáticos vs Reactivaciones (filled lines).
   *
   * @param {Array} periodos – Array of period objects from the API.
   */
  function renderDashboardCharts(periodos) {
    destroyDashboardCharts();
    if (!periodos.length) return;
    const labels = periodos.map(p => p.periodo_reporte).reverse();
    /* Build map by periodo for quick lookup */
    const pdata = {};
    periodos.forEach(p => { pdata[p.periodo_reporte] = p; });

    function v(key) { return function(l) { var d = pdata[l]; return d ? d[key] || 0 : 0; }; }

    const isLight = document.documentElement.classList.contains("light-mode");
    const gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";

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
          /* Draw coloured zone rectangles behind the data */
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
          /* Draw dashed target line with label */
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

    /* -------- 1. Churn Neto / Bruto (lines + avg bars) -------- */
    var churnNeto = labels.map(v("churn_neto_pct"));
    var churnBruto = labels.map(v("churn_bruto_pct"));
    var churnAvg = labels.map(function(_, i) { return (churnNeto[i] + churnBruto[i]) / 2; });
    var lblColor = tickColor;
    var churnPlugin = makeThresholdPlugin("churnLine", null, { value: 3, color: "#ffffff", label: "Objetivo 3%" });
    function churnSeg(ctx) { if (!ctx || !ctx.p1 || !ctx.p1.parsed) return; var val = ctx.p1.parsed.y; return val < 2.5 ? "#22c55e" : val <= 3 ? "#eab308" : "#ef4444"; }
    function churnPt(v) { return v < 2.5 ? "#22c55e" : v <= 3 ? "#eab308" : "#ef4444"; }
    function churnBar(v) { return v < 2.5 ? "rgba(34,197,94,0.75)" : v <= 3 ? "rgba(234,179,8,0.75)" : "rgba(239,68,68,0.75)"; }
    var ctx1 = document.getElementById("churnLineChart");
    if (ctx1) {
      churnLineChart = new Chart(ctx1, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Churn Neto", data: churnNeto, type: "line", borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: churnNeto.map(churnPt) },
            { label: "Churn Bruto", data: churnBruto, type: "line", borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3, order: 0, segment: { borderColor: churnSeg }, pointBackgroundColor: churnBruto.map(churnPt) },
            { label: "Promedio", data: churnAvg, backgroundColor: churnAvg.map(churnBar), borderRadius: 3, order: 1, datalabels: { display: true, color: lblColor, anchor: "end", align: "end", font: { size: 14, weight: "bold" }, formatter: function (val) { return val.toFixed(1) + "%"; } } },
          ]
        },
        options: chartOpts(Object.assign(barOpts(gridColor, tickColor), { plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } } })),
        plugins: [churnPlugin]
      });
    }

    /* -------- 2. Winback – bars + trend line -------- */
    var winbackData = labels.map(v("tasa_winback_pct"));
    var winbackPlugin = makeThresholdPlugin("winbackLine", null, { value: 80, color: "#ffffff", label: "Obj. 80%" });
    var ctx2 = document.getElementById("winbackBarChart");
    if (ctx2) {
      winbackBarChart = new Chart(ctx2, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Tasa Winback", data: winbackData, backgroundColor: winbackData.map(function (v) { return (v || 0) < 80 ? "rgba(239,68,68,0.8)" : (v || 0) <= 90 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4, order: 1 },
            { label: "Tendencia", data: winbackData, type: "line", borderColor: "#fff", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fff", fill: false, order: 0 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [winbackPlugin]
      });
    }

    /* -------- 3. ARPU – bars + trend line -------- */
    var arpuData = labels.map(v("arpu"));
    var arpuPlugin = makeThresholdPlugin("arpuLine", null, { value: 25, color: "#ffffff", label: "Obj. 25" });
    var ctx3 = document.getElementById("arpuBarChart");
    if (ctx3) {
      arpuBarChart = new Chart(ctx3, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "ARPU", data: arpuData, backgroundColor: arpuData.map(function (v) { return (v || 0) < 25 ? "rgba(239,68,68,0.8)" : (v || 0) <= 30 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }), borderRadius: 4, order: 1 },
            { label: "Tendencia", data: arpuData, type: "line", borderColor: "#fff", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fff", fill: false, order: 0 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [arpuPlugin]
      });
    }

    /* -------- 4. Tasa Aporte Reactivación – bars + trend line -------- */
    var aporteData = labels.map(v("tasa_aporte_react_pct"));
    var ctx4 = document.getElementById("aporteReactBarChart");
    if (ctx4) {
      aporteReactBarChart = new Chart(ctx4, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Tasa Aporte React.", data: aporteData, backgroundColor: "rgba(37,99,235,0.8)", borderRadius: 4, order: 1 },
            { label: "Tendencia", data: aporteData, type: "line", borderColor: "#fbbf24", backgroundColor: "transparent", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#fbbf24", fill: false, order: 0 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor))
      });
    }

    /* -------- 5. Índice de Reemplazo – line -------- */
    var reempData = labels.map(v("indice_reemplazo_react_pct"));
    var ctx5 = document.getElementById("reemplazoLineChart");
    if (ctx5) {
      reemplazoLineChart = new Chart(ctx5, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            { label: "Indice Reemplazo", data: reempData, borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,0.05)", borderWidth: 2, tension: 0.35, pointRadius: 3 },
          ]
        },
        options: chartOpts(lineOpts(gridColor, tickColor))
      });
    }

    /* -------- 6. Adiciones Netas & Brutas – bars -------- */
    var adNetasData = labels.map(v("adiciones_netas"));
    var adBrutasData = labels.map(v("adiciones_brutas"));
    function adColors(v) { return (v || 0) < 0 ? "rgba(239,68,68,0.8)" : (v || 0) <= 1000 ? "rgba(234,179,8,0.8)" : "rgba(34,197,94,0.8)"; }
    var adicionesPlugin = makeThresholdPlugin("adicionesLine", null, { value: 0, color: "#ffffff", label: "Obj. 0" });
    var ctx6 = document.getElementById("adicionesBarChart");
    if (ctx6) {
      adicionesBarChart = new Chart(ctx6, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "Adiciones Netas", data: adNetasData, backgroundColor: adNetasData.map(adColors), borderRadius: 4 },
            { label: "Adiciones Brutas", data: adBrutasData, backgroundColor: adBrutasData.map(adColors), borderRadius: 4 },
          ]
        },
        options: chartOpts(barOpts(gridColor, tickColor)),
        plugins: [adicionesPlugin]
      });
    }

    /* -------- 7. Cortes vs Reactivaciones – filled lines -------- */
    var cortesData = labels.map(v("corte_impagado"));
    var reactData = labels.map(v("reactivaciones"));
    var ctx8 = document.getElementById("cortesReactChart");
    if (ctx8) {
      cortesReactChart = new Chart(ctx8, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            { label: "Cortes Automaticos", data: cortesData, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#ef4444", fill: true },
            { label: "Reactivaciones", data: reactData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.1)", borderWidth: 2, tension: 0.35, pointRadius: 4, pointBackgroundColor: "#22c55e", fill: true },
          ]
        },
        options: chartOpts(lineOpts(gridColor, tickColor))
      });
    }
  }

  /**
   * Destroy all existing dashboard chart instances to free memory
   * before re-rendering on data refresh or theme toggle.
   */
  function destroyDashboardCharts() {
    [churnLineChart, winbackBarChart, arpuBarChart, aporteReactBarChart, reemplazoLineChart, adicionesBarChart, cortesReactChart].forEach(c => { if (c) { c.destroy(); c = null; } });
    churnLineChart = winbackBarChart = arpuBarChart = aporteReactBarChart = reemplazoLineChart = adicionesBarChart = cortesReactChart = null;
  }

  /**
   * Merge common Chart.js options (responsive, animation) with
   * chart-type-specific options.
   * @param {Object} specific – Options specific to the chart type.
   * @returns {Object} Merged options object.
   */
  function chartOpts(specific) {
    return Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: "easeOutQuart" } }, specific || {});
  }

  /**
   * Return standard Chart.js options for a line chart (with grid and ticks).
   * @param {string} gridColor – CSS colour for grid lines.
   * @param {string} tickColor – CSS colour for axis tick labels.
   * @returns {Object} Options object.
   */
  function lineOpts(gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  }

  /**
   * Return standard Chart.js options for a bar chart.
   * Hides the x-axis grid lines.
   * @param {string} gridColor – CSS colour for y-axis grid lines.
   * @param {string} tickColor – CSS colour for axis tick labels.
   * @returns {Object} Options object.
   */
  function barOpts(gridColor, tickColor) {
    return {
      plugins: { legend: { position: "top", labels: { color: tickColor, font: { size: 10 } } } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } } }, x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 10 } } } }
    };
  }

  /* ================================================================ */
  /*  SURVIVAL PAGE – KAPLAN-MEIER                                    */
  /* ================================================================ */

  function initSurvivalPage() {
    document.querySelectorAll('input[name="kmTipoS"]').forEach(function (r) { r.addEventListener("change", loadSurvivalPage); });
    var dimSel = document.getElementById("survivalDim");
    if (dimSel) dimSel.addEventListener("change", loadSurvivalPage);
    loadSurvivalPage();
  }

  function loadSurvivalPage() {
    var dim = document.getElementById("survivalDim");
    var dimVal = dim ? dim.value : "";
    var url = "/api/survival/global/";
    if (dimVal) url += "?dim=" + encodeURIComponent(dimVal);
    fetch(url).then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (data) {
      renderKMSurvivalChartS(data);
      renderKMRiskTableS(data);
      renderKMStatsS(data);
    }).catch(function () { showToast("Error cargando supervivencia", "error"); });
  }

  function renderKMSurvivalChartS(data) {
    if (kmSurvivalChartS) { kmSurvivalChartS.destroy(); kmSurvivalChartS = null; }
    var ctx = document.getElementById("kmSurvivalChartS");
    if (!ctx) return;
    var tipo = document.querySelector('input[name="kmTipoS"]:checked');
    var sufijo = (tipo && tipo.value) || "activo";
    var emptyMsg = document.getElementById("kmSurvivalEmptyMsg");
    var curve = data["curva_" + sufijo] || [];
    if (!curve.length) {
      if (kmSurvivalChartS) { kmSurvivalChartS.destroy(); kmSurvivalChartS = null; }
      if (emptyMsg) emptyMsg.classList.remove("d-none");
      return;
    }
    if (emptyMsg) emptyMsg.classList.add("d-none");
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
    var dimCurves = data.curvas_dimension || {};
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
    kmSurvivalChartS = new Chart(ctx, {
      type: "line",
      data: { labels: curve.map(function (p) { return p.tiempo; }), datasets: datasets },
      options: chartOpts({
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
    // Precompute cumulative events
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
    // Row: Supervivencia
    html += '<tr><td class="fw-medium" style="color:var(--text-primary)">Supervivencia</td>';
    keyTimes.forEach(function (t) {
      var pt = t === 0 ? {sup: 1.0} : (lastAtOrBefore(curve, t) || {sup: curve[0].sup});
      html += '<td class="text-end" style="color:var(--text-primary)">' + (pt.sup * 100).toFixed(1) + '%</td>';
    });
    html += '</tr>';
    // Row: IC 95%
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
    // Row: Churnes acumulados
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

  /* ================================================================ */
  /*  ANALYTICS – METRIC CARDS + DIMENSION CHARTS                     */
  /* ================================================================ */

  /**
   * Fetch analytics data from the API, passing the selected periods as
   * a query parameter. Renders summary cards and dimension breakdowns.
   * @returns {Promise} Resolves when data is loaded and rendered.
   */
  function loadAnalyticsData() {
    var cbs = document.querySelectorAll("#analytics-periods-checkboxes input[type=checkbox]:checked");
    var vals = Array.from(cbs).map(function (cb) { return cb.value; }).filter(Boolean);
    var url = "/api/analytics-data/";
    if (vals.length) url += "?periods=" + encodeURIComponent(vals.join(","));
    return fetch(url)
      .then(r => { if (!r.ok) throw Error("Error"); return r.json(); })
      .then(data => {
        renderAnalyticsCards(data.periodos || []);
        renderDimensionCharts(data.dimensiones || [], data.periodos || []);
      })
      .catch(function () { showToast("Error cargando analytics", "error"); });
  }

  /**
   * Render a grid of KPI metric cards (churn, winback, ARPU, etc.)
   * showing the average value across the selected periods.
   * Each card is colour-coded based on pre-defined thresholds.
   * @param {Array} periodos – Array of period objects from the API.
   */
  function renderAnalyticsCards(periodos) {
    const container = document.getElementById("analytics-cards-container");
    if (!container) return;
    if (!periodos.length) { container.innerHTML = '<div class="col-12 text-center text-muted py-4">Sin datos</div>'; return; }

    /**
     * Compute the average of a dot-path metric across periods.
     * @param {string} path – Dot-delimited key, e.g. "churn_neto_pct".
     * @returns {number} Average value.
     */
    function avg(path) {
      const vals = [];
      periodos.forEach(function (p) {
        const v = path.split(".").reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, p);
        if (v !== undefined) vals.push(Number(v));
      });
      return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
    }

    /* Colour helper functions with business-logic thresholds */
    function colorChurn(v) { return v < 2.5 ? "text-success" : v <= 3 ? "text-warning" : "text-danger"; }
    function colorNuevos(v) { return v > 2500 ? "text-success" : v >= 2000 ? "text-warning" : "text-danger"; }
    function colorBajas(v) { return v < 500 ? "text-success" : v <= 1000 ? "text-warning" : "text-danger"; }
    function colorWinback(v) { return v >= 90 ? "text-success" : v >= 80 ? "text-warning" : "text-danger"; }
    function colorArpu(v) { return v >= 30 ? "text-success" : v >= 25 ? "text-warning" : "text-danger"; }
    function colorAdiciones(v) { return v > 500 ? "text-success" : v >= 1 ? "text-warning" : "text-danger"; }

    /* Define all 20 KPI cards */
    const cards = [
      { label: "Churn Neto", val: avg("churn_neto_pct"), fmt: v => v.toFixed(2) + "%", clr: colorChurn },
      { label: "Churn Bruto", val: avg("churn_bruto_pct"), fmt: v => v.toFixed(2) + "%", clr: colorChurn },
      { label: "Bajas Netas", val: avg("bajas_netas_balance"), fmt: v => Math.round(v).toLocaleString(), clr: colorBajas },
      { label: "Bajas Brutas", val: avg("bajas_brutas_auditoria"), fmt: v => Math.round(v).toLocaleString(), clr: colorBajas },
      { label: "Nuevos en el Mes", val: avg("nuevos_mes"), fmt: v => Math.round(v).toLocaleString(), clr: colorNuevos },
      { label: "Reactivaciones", val: avg("reactivaciones"), fmt: v => Math.round(v).toLocaleString(), clr: function () { return "text-success"; } },
      { label: "Tasa Winback", val: avg("tasa_winback_pct"), fmt: v => v.toFixed(2) + "%", clr: colorWinback },
      { label: "ARPU", val: avg("arpu"), fmt: v => "$" + v.toFixed(2), clr: colorArpu },
      { label: "Total Billing", val: avg("total_billing"), fmt: v => "$" + Math.round(v).toLocaleString(), clr: function () { return "text-success"; } },
      { label: "Tasa Aporte React.", val: avg("tasa_aporte_react_pct"), fmt: v => v.toFixed(2) + "%", clr: function () { return "text-success"; } },
      { label: "Indice Reemplazo", val: avg("indice_reemplazo_react_pct"), fmt: v => v.toFixed(2) + "%", clr: function () { return "text-success"; } },
      { label: "Adiciones Netas", val: avg("adiciones_netas"), fmt: v => Math.round(v).toLocaleString(), clr: colorAdiciones },
      { label: "Adiciones Brutas", val: avg("adiciones_brutas"), fmt: v => Math.round(v).toLocaleString(), clr: colorAdiciones },
      { label: "Corte Impago", val: avg("corte_impagado"), fmt: v => Math.round(v).toLocaleString(), clr: function () { return "text-success"; } },
    ];

    let html = "";
    cards.forEach(c => {
      const colorClass = c.clr(c.val);
      html += '<div class="col-xl-2 col-md-3 col-sm-4"><div class="metric-card"><div class="metric-label">' + c.label + '</div><div class="fs-3 fw-bold ' + colorClass + '">' + c.fmt(c.val) + '</div></div></div>';
    });
    container.innerHTML = html;
  }



  /**
   * Aggregate per-period dimension data into a single averaged dataset.
   * Groups items by dimension key (e.g. "zona") and value (e.g. "Norte"),
   * then averages all numeric metrics across the selected periods.
   *
   * @param {Array} dimensiones – Raw dimension array from API (one entry per period).
   * @returns {Object} Normalised structure: { dimKey: [ { valor, churn_neto_pct, ... } ] }.
   */
  function averageDimensionData(dimensiones) {
    var accum = {};
    dimensiones.forEach(function (period) {
      var dims = period.dimensiones || {};
      Object.keys(dims).forEach(function (dimKey) {
        if (!accum[dimKey]) accum[dimKey] = {};
        (dims[dimKey] || []).forEach(function (item) {
          var val = item.valor || "N/A";
          if (!accum[dimKey][val]) {
            accum[dimKey][val] = { sum: { churn_neto_pct: 0, churn_bruto_pct: 0, arpu: 0, tasa_winback_pct: 0, adiciones_netas: 0, adiciones_brutas: 0, tasa_aporte_react_pct: 0, corte_impagado: 0, nuevos: 0, activos_final: 0 }, count: 0 };
          }
          /* Accumulate sums for each metric */
          ["churn_neto_pct","churn_bruto_pct","arpu","tasa_winback_pct","adiciones_netas","adiciones_brutas","tasa_aporte_react_pct","corte_impagado","nuevos","activos_final"].forEach(function (m) {
            accum[dimKey][val].sum[m] += (item[m] || 0);
          });
          accum[dimKey][val].count++;
        });
      });
    });
    /* Convert accumulator sums to averages */
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

  /**
   * Render dimension breakdown charts (doughnut, pie, horizontal bar).
   * Creates one card per metric, each containing a chart per dimension.
   * Small-contribution items ( < 2.5 %) are grouped into "Otros".
   * Doughnut charts show a global average in the centre, switching to
   * the hovered segment's value on hover.
   *
   * @param {Array} dimensiones – Raw dimension data from API.
   * @param {Array} periodos    – Period list for computing global averages.
   */
  function renderDimensionCharts(dimensiones, periodos) {
    var container = document.getElementById("analytics-dimension-charts");
    if (!container) return;
    /* Destroy previous dimension chart instances */
    dimChartInstances.forEach(function (c) { c.destroy(); });
    dimChartInstances = [];
    if (!dimensiones || !dimensiones.length) { container.innerHTML = '<div class="text-center text-muted py-4">Sin datos de dimensiones</div>'; return; }

    var avgData = averageDimensionData(dimensiones);
    var dimKeys = Object.keys(avgData).filter(function (k) { return avgData[k].length > 0; });
    /* Human-readable labels for each dimension key */
    var dimLabels = { zona: "Zona", sucursal: "Sucursal", producto: "Producto", municipio: "Municipio", campana: "Campaña" };
    /* Define which metrics to chart and their type */
    var metrics = [
      { key: "churn_neto_pct", label: "Churn Neto", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "churn_bruto_pct", label: "Churn Bruto", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "arpu", label: "ARPU", chartType: "hbar", fmt: function (v) { return "$" + v.toFixed(2); } },
      { key: "tasa_winback_pct", label: "Tasa Winback", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "adiciones_netas", label: "Adiciones Netas", chartType: "bar", fmt: function (v) { return Math.round(v).toLocaleString(); } },
      { key: "adiciones_brutas", label: "Adiciones Brutas", chartType: "bar", fmt: function (v) { return Math.round(v).toLocaleString(); } },
      { key: "tasa_aporte_react_pct", label: "Aporte React.", chartType: "doughnut", fmt: function (v) { return v.toFixed(2) + "%"; } },
      { key: "corte_impagado", label: "Corte Impago", chartType: "hbar", fmt: function (v) { return Math.round(v).toLocaleString(); } },
    ];

    var isLight = document.documentElement.classList.contains("light-mode");
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    var bgColor = isLight ? "#fff" : "#1e293b";
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";

    var palette = ["#2563eb","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1","#84cc16","#06b6d4","#d946ef","#0d9488","#e11d48","#7c3aed","#65a30d","#0891b2","#c026d3","#dc2626","#ca8a04"];

    /**
     * Calculate the relative "weight" of a dimension item for chart sizing.
     * Different metrics use different formulas (raw value vs active-base-weighted).
     */
    function getWeight(item, metricKey) {
      if (metricKey === "adiciones_netas" || metricKey === "adiciones_brutas" || metricKey === "corte_impagado") return item[metricKey] || 0;
      if (metricKey === "arpu" || metricKey === "mediana_activo") return (item.activos_final || 0) * (item[metricKey] || 0);
      return (item.activos_final || 0) * (item[metricKey] || 0) / 100;
    }

    /**
     * Compute the global average for a metric across all selected periods.
     * Used as fallback centre value for doughnuts.
     */
    function getGlobalMetric(metricKey, fallbackItems) {
      var vals = [];
      periodos.forEach(function(p) {
        var v = p[metricKey];
        if (v !== undefined && v !== null) vals.push(Number(v));
      });
      if (vals.length) return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
      if (fallbackItems && fallbackItems.length) {
        var totalAct = 0, totalWeighted = 0;
        fallbackItems.forEach(function(i) {
          var af = i.activos_final || 0;
          totalAct += af;
          totalWeighted += af * (i[metricKey] || 0);
        });
        if (totalAct > 0) return totalWeighted / totalAct;
      }
      return 0;
    }

    /* Build the HTML grid: one card per metric, one column per dimension */
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

    /* Collect all dimension items for global metric fallback computation */
    var allItemsForFallback = Object.keys(avgData).reduce(function(acc, dk) {
      return acc.concat(avgData[dk]);
    }, []);

    /* Instantiate charts for each metric × dimension */
    metrics.forEach(function (metric) {
      var globalCenterVal = metric.fmt(getGlobalMetric(metric.key, allItemsForFallback));

      dimKeys.forEach(function (dimKey) {
        var items = avgData[dimKey];
        if (!items.length) return;

        var canvasId = "dimc-" + metric.key + "-" + dimKey;
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;

        /* ---------- DOUGHNUT / PIE ---------- */
        if (metric.chartType === "doughnut" || metric.chartType === "pie") {
          var totalWeight = 0;
          items.forEach(function(i) { i._w = getWeight(i, metric.key); totalWeight += i._w; });
          if (!totalWeight) return;

          /* Group small contributors (< 2.5 %) into "Otros" */
          var mainItems = [], othersW = 0, othersAct = 0, othersMetricSum = 0, othersCount = 0;
          items.forEach(function(i) {
            var pct = (i._w / totalWeight) * 100;
            if (pct < 2.5) {
              othersW += i._w;
              othersAct += (i.activos_final || 0);
              othersMetricSum += (i[metric.key] || 0) * (i.activos_final || 0);
              othersCount++;
            } else {
              mainItems.push(i);
            }
          });
          if (othersW > 0) {
            var o = { valor: "Otros", _w: othersCount > 0 ? othersW / othersCount : 0, activos_final: othersAct };
            o[metric.key] = othersAct > 0 ? othersMetricSum / othersAct : 0;
            mainItems.push(o);
          }
          mainItems.sort(function(a, b) { return b._w - a._w; });
          /* Ensure "Otros" always appears last */
          var otrosIdx = mainItems.findIndex(function(i) { return i.valor === "Otros"; });
          if (otrosIdx !== -1) {
            var otrosItem = mainItems.splice(otrosIdx, 1)[0];
            mainItems.push(otrosItem);
          }

          var labels = mainItems.map(function(i) { return i.valor || "N/A"; });
          var values = mainItems.map(function(i) { return i._w; });
          var colors = mainItems.map(function(_, i) { return palette[i % palette.length]; });

          var isPie = metric.chartType === "pie";

          /* Custom plugin to display the centre text on doughnut charts */
          var hoverPlugin = {
            id: "centerText",
            afterDraw: function(chart) {
              if (isPie) return;
              var w = chart.width, h = chart.height, ctx = chart.ctx;
              var active = chart.getActiveElements();
              var text = globalCenterVal;
              if (active.length) {
                var idx = active[0].index;
                var item = mainItems[idx];
                if (item) text = metric.fmt(item[metric.key] || 0);
              }
              ctx.save();
              ctx.font = "bold " + Math.round(h / 8) + "px sans-serif";
              ctx.textBaseline = "middle";
              ctx.textAlign = "center";
              ctx.fillStyle = tickColor;
              ctx.fillText(text, w / 2, h / 2);
              ctx.restore();
            }
          };

          var chart = new Chart(canvas, {
            type: isPie ? "pie" : "doughnut",
            data: {
              labels: labels,
              datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: bgColor,
                spacing: 8
              }]
            },
            options: {
              cutout: isPie ? undefined : "60%",
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 800, easing: "easeOutQuart", animateRotate: true },
              plugins: {
                legend: { display: false },
                datalabels: {
                  display: function(ctx) {
                    var idx = ctx.dataIndex;
                    return mainItems[idx] && mainItems[idx].valor !== "Otros";
                  },
                  color: "#fff",
                  font: { size: 10, weight: "bold" },
                  formatter: function(val, ctx) {
                    var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                    return (val / total * 100).toFixed(1) + "%";
                  }
                },
                tooltip: {
                  callbacks: {
                    label: function(ctx) {
                      var total = ctx.dataset.data.reduce(function(a, b) { return a + b; }, 0);
                      var contribPct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0.0";
                      var idx = ctx.dataIndex;
                      var item = mainItems[idx];
                      if (!item) return ctx.label;
                      return ctx.label + ": " + contribPct + "% del total — " + metric.fmt(item[metric.key] || 0) + " (" + Math.round(item.activos_final || 0).toLocaleString() + " act.)";
                    }
                  }
                }
              }
            },
            plugins: [hoverPlugin]
          });
          dimChartInstances.push(chart);

        /* ---------- HORIZONTAL BAR ---------- */
        } else if (metric.chartType === "hbar") {
          var total = items.reduce(function(s, i) { return s + (i[metric.key] || 0); }, 0);
          var main = [], othersSum = 0, othersCount = 0;
          items.forEach(function(i) {
            var v = i[metric.key] || 0;
            if (total > 0 && (v / total * 100) < 2.5) { othersSum += v; othersCount++; }
            else { main.push(i); }
          });
          if (othersCount > 0) { var o = { valor: "Otros" }; o[metric.key] = othersSum / othersCount; main.push(o); }
          main.sort(function(a, b) { return (b[metric.key] || 0) - (a[metric.key] || 0); });
          /* Move "Otros" to the end */
          var oIdx = main.findIndex(function(i) { return i.valor === "Otros"; });
          if (oIdx !== -1) { var oi = main.splice(oIdx, 1)[0]; main.push(oi); }
          var hlabels = main.map(function(i) { return i.valor || "N/A"; });
          var hvalues = main.map(function(i) { return i[metric.key] || 0; });
          var hcolors = main.map(function(_, i) { return palette[i % palette.length]; });

          dimChartInstances.push(new Chart(canvas, {
            type: "bar",
            data: { labels: hlabels, datasets: [{ data: hvalues, backgroundColor: hcolors, borderRadius: 3 }] },
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 800, easing: "easeOutQuart" },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(ctx) { return metric.fmt(ctx.parsed.x); } } }
              },
              scales: {
                y: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } },
                x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }
              }
            }
          }));

        /* ---------- VERTICAL BAR ---------- */
        } else if (metric.chartType === "bar") {
          var total = items.reduce(function(s, i) { return s + (i[metric.key] || 0); }, 0);
          var main = [], othersSum = 0, othersCount = 0;
          items.forEach(function(i) {
            var v = i[metric.key] || 0;
            if (total > 0 && (v / total * 100) < 2.5) { othersSum += v; othersCount++; }
            else { main.push(i); }
          });
          if (othersCount > 0) { var o = { valor: "Otros" }; o[metric.key] = othersSum / othersCount; main.push(o); }
          main.sort(function(a, b) { return (b[metric.key] || 0) - (a[metric.key] || 0); });
          var oIdx = main.findIndex(function(i) { return i.valor === "Otros"; });
          if (oIdx !== -1) { var oi = main.splice(oIdx, 1)[0]; main.push(oi); }
          var blabels = main.map(function(i) { return i.valor || "N/A"; });
          var bvalues = main.map(function(i) { return i[metric.key] || 0; });
          var bcolors = main.map(function(_, i) { return palette[i % palette.length]; });

          dimChartInstances.push(new Chart(canvas, {
            type: "bar",
            data: { labels: blabels, datasets: [{ data: bvalues, backgroundColor: bcolors, borderRadius: 3 }] },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 800, easing: "easeOutQuart" },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(ctx) { return metric.fmt(ctx.parsed.y); } } }
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 9 } } },
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } }
              }
            }
          }));

        }
      });
    });
  }

  /* ================================================================ */
  /*  RUN ANALYSIS (triggers backend ETL + churn computation)         */
  /* ================================================================ */

  /**
   * Initialise the "Run Analysis" form: POST the selected month to the
   * backend API, display live log output, and refresh the dashboard on
   * success.
   */
  function initAnalysisExecutor() {
    const form = document.getElementById("run-analysis-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const month = document.getElementById("month-input").value;
      if (!month) { showToast("Seleccione un mes valido", "warning"); return; }
      showLoading("Ejecutando analisis...");
      /* Show the terminal-style log container */
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
    /* Clear button for the terminal log */
    const clearBtn = document.getElementById("clear-console");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        const tl = document.getElementById("terminal-log");
        if (tl) tl.textContent = "Consola limpia.";
      });
    }
  }

  /* ================================================================ */
  /*  CSV IMPORTER (drag-&-drop + file upload)                        */
  /* ================================================================ */

  /**
   * Switch the import tab between "subscriptions" and "logs", showing
   * the relevant format-hint section.
   * @param {string} type – "subscriptions" or "logs".
   */
  function setImportType(type) {
    document.getElementById("type-" + type).checked = true;
    document.getElementById("format-sub-details").classList.toggle("d-none", type !== "subscriptions");
    document.getElementById("format-log-details").classList.toggle("d-none", type !== "logs");
  }

  /**
   * Initialise the CSV import UI:
   *   - Radio toggles for subscriptions / logs.
   *   - Drag-and-drop zone with visual feedback.
   *   - "Browse files" button.
   *   - Selected file display with remove action.
   *   - Upload form with progress bar.
   */
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
    /* "Browse" click triggers hidden file input */
    if (browseBtn && fileInput) browseBtn.addEventListener("click", function () { fileInput.click(); });
    if (fileInput) {
      fileInput.addEventListener("change", function () { if (this.files.length) handleFile(this.files[0]); });
    }
    if (removeBtn) removeBtn.addEventListener("click", clearFile);
    /* Drag-and-drop handlers */
    if (dropZone) {
      /* Prevent default browser behaviour for all drag/drop events */
      ["dragenter", "dragover", "dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
      /* Visual feedback on dragover */
      ["dragenter", "dragover"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.add("dragover"); }); });
      ["dragleave", "drop"].forEach(function (e) { dropZone.addEventListener(e, function () { dropZone.classList.remove("dragover"); }); });
      dropZone.addEventListener("drop", function (e) {
        var f = e.dataTransfer.files[0];
        if (f && f.name.endsWith(".csv")) { fileInput.files = e.dataTransfer.files; handleFile(f); }
        else showToast("Solo archivos CSV", "warning");
      });
    }
    /** Show the selected file name and enable the submit button. */
    function handleFile(f) {
      if (displayName && displayFile && submitBtn) {
        displayName.textContent = f.name + " (" + (f.size / 1024).toFixed(1) + " KB)";
        displayFile.classList.remove("d-none");
        submitBtn.removeAttribute("disabled");
      }
    }
    /** Clear the selected file and disable the submit button. */
    function clearFile() {
      if (fileInput) fileInput.value = "";
      if (displayFile && submitBtn) { displayFile.classList.add("d-none"); submitBtn.setAttribute("disabled", "true"); }
    }
    /* Upload form submission */
    document.getElementById("import-csv-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var file = fileInput.files[0];
      if (!file) return;
      showLoading("Cargando archivo...");
      var type = document.querySelector('input[name="import_type"]:checked').value;
      var endpoint = type === "subscriptions" ? "/api/import-subscriptions/" : "/api/import-logs/";
      var fd = new FormData();
      fd.append("csv_file", file);
      /* Show and animate a simulated progress bar */
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

  /* ================================================================ */
  /*  HISTORICAL RESULTS – TABLE, SEARCH & DETAIL MODAL                */
  /* ================================================================ */

  /**
   * Fetch all historical results from the API and render the table +
   * search filter.
   */
  function loadResultsData() {
    fetch("/api/results/").then(function (r) { if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      allHistoricalPeriods = d.periods || [];
      renderResultsTable(allHistoricalPeriods);
      setupSearchFilter();
    }).catch(function () { showToast("Error cargando historial", "error"); });
  }

  /**
   * Render the historical results table.  Each row shows period,
   * active counts, churn rates, ARPU, and a "view details" button.
   * @param {Array} periods – Array of result objects from the API.
   */
  function renderResultsTable(periods) {
    var tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;
    if (!periods.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Sin datos</td></tr>'; return; }
    var html = "";
    periods.forEach(function (r) {
      var cn = r.churn_neto_pct || 0;
      var churnClass = cn < 2.5 ? "text-success" : cn <= 3 ? "text-warning" : "text-danger";
      html += '<tr><td class="fw-semibold">' + r.periodo_reporte + '</td><td class="text-end">' + (r.activos_inicio || 0).toLocaleString() + '</td><td class="text-end">' + (r.activos_final || 0).toLocaleString() + '</td><td class="text-end">' + (r.nuevos_mes || 0).toLocaleString() + '</td><td class="text-end fw-semibold ' + churnClass + '">' + cn.toFixed(2) + '%</td><td class="text-end">$' + (r.arpu || 0).toFixed(2) + '</td><td class="text-center"><button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="' + r.periodo_reporte + '"><i class="bi bi-eye"></i></button></td></tr>';
    });
    tbody.innerHTML = html;
  }

  /**
   * Attach a live-search (filter-by-period) listener to the
   * results table search input.
   */
  function setupSearchFilter() {
    var input = document.getElementById("search-results-input");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = this.value.toLowerCase().trim();
      renderResultsTable(allHistoricalPeriods.filter(function (r) { return r.periodo_reporte.toLowerCase().includes(q); }));
    });
  }

  /**
   * Set up a global click delegate that opens the period detail modal
   * when any ``.view-details-btn`` is clicked (dashboard table + results table).
   */
  function initResultsDetailsModal() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".view-details-btn");
      if (btn && btn.dataset.periodo) openPeriodDetailsModal(btn.dataset.periodo);
    });
  }

  /**
   * Fetch the full detail for a single period and show it in a Bootstrap
   * modal with summary cards and dimension tables.
   * @param {string} periodo – Period identifier (e.g. "202501").
   */
  function openPeriodDetailsModal(periodo) {
    showLoading("Consultando " + periodo + "...");
    fetch("/api/results/" + periodo + "/").then(function (r) { hideLoading(); if (!r.ok) throw Error("Error"); return r.json(); }).then(function (d) {
      var el = document.getElementById("detailsModal");
      if (!el) return;
      document.getElementById("modal-period-title").textContent = d.periodo;
      renderModalSummary(d.summary || {}, d.tiempos || {});
      renderModalDimensions(d.dimensions || {});
      new bootstrap.Modal(el).show();
    }).catch(function () { hideLoading(); showToast("Error al obtener detalle", "error"); });
  }

  /**
    * Render the summary card inside the detail modal.
    * @param {Object} summary – Summary dict with all metrics.
    * @param {Object} tiempos – KM object {mediana_activo, ...}.
    */
  function renderModalSummary(summary, tiempos) {
    var c = document.getElementById("modal-summary-container");
    if (!c) return;
    if (!summary || !Object.keys(summary).length) { c.innerHTML = '<div class="col-12 text-center py-3" style="color:var(--text-secondary)">Sin resumen</div>'; return; }
    var f = function(v, d) { return (v || 0).toLocaleString(undefined, {minimumFractionDigits: d||0, maximumFractionDigits: d||0}); };
    var pct = function(v) { return f(v, 2) + "%"; };
    var usd = function(v) { return "$" + f(v, 2); };
    var intl = function(v) { return f(v, 0); };
    var s = summary;
    var html = '<div class="col-12"><div class="card border-1" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-body p-3"><table class="table table-sm mb-0 table-modal-sum" style="font-size:0.8rem"><tbody>';
    html += '<tr><td class="modal-label ps-0">Base Inicio</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.activos_inicio) + '</td><td class="modal-label ps-3">Base Final</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.activos_final) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Nuevos</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.nuevos_mes) + '</td><td class="modal-label ps-3">Bajas Netas</td><td class="text-end modal-value-danger">' + intl(s.bajas_netas_balance) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Bajas Brutas</td><td class="text-end modal-value-danger">' + intl(s.bajas_brutas_auditoria) + '</td><td class="modal-label ps-3">Churn Neto</td><td class="text-end modal-value-danger">' + pct(s.churn_neto_pct) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Churn Bruto</td><td class="text-end modal-value-danger">' + pct(s.churn_bruto_pct) + '</td><td class="modal-label ps-3">ARPU</td><td class="text-end modal-value-success">' + usd(s.arpu) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Total Billing</td><td class="text-end modal-value-accent">' + usd(s.total_billing) + '</td><td class="modal-label ps-3">Corte Impago</td><td class="text-end modal-value-warning">' + intl(s.corte_impagado) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Winback</td><td class="text-end modal-value-success">' + pct(s.tasa_winback_pct) + '</td><td class="modal-label ps-3">Reactivaciones</td><td class="text-end modal-value-success">' + intl(s.reactivaciones) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">React 6_churn</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_6_churn) + '</td><td class="modal-label ps-3">React 8_30days</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_8_30days) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">React 4_paused</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.react_4_paused) + '</td><td class="modal-label ps-3">Total Inactivos</td><td class="text-end" style="color:var(--text-primary)">' + intl(s.total_inactivos) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Aporte React.</td><td class="text-end modal-value-accent">' + pct(s.tasa_aporte_react_pct) + '</td><td class="modal-label ps-3">Indice Reemplazo</td><td class="text-end modal-value-accent">' + pct(s.indice_reemplazo_react_pct) + '</td></tr>';
    html += '<tr><td class="modal-label ps-0">Adic. Netas</td><td class="text-end modal-value-success">' + intl(s.adiciones_netas) + '</td><td class="modal-label ps-3">Adic. Brutas</td><td class="text-end modal-value-success">' + intl(s.adiciones_brutas) + '</td></tr>';
    html += '</tbody></table></div></div></div>';
    c.innerHTML = html;
  }

  /**
   * Render dimension breakdown tables inside the detail modal.
   * Each dimension key (zona, sucursal, etc.) gets a scrollable table
   * with sticky headers and a column per metric.
   * @param {Object} dimensions – Map of dimension key → array of items.
   */
  function renderModalDimensions(dimensions) {
    var c = document.getElementById("modal-dimensions-container");
    if (!c) return;
    if (!dimensions || !Object.keys(dimensions).length) { c.innerHTML = '<div class="col-12 text-center py-3" style="color:var(--text-secondary)">Sin dimensiones</div>'; return; }
    /* Human-readable labels for dimension keys */
    var nameMap = { "zona": "Zona Geografica", "sucursal": "Sucursal", "producto": "Producto / Plan", "municipio": "Municipio", "campana": "Campana" };
    var html = "";
    /* Define the 18 metric columns for the dimension tables */
    var cols = [
      { k: "activos_inicio", label: "Act.Ini", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "activos_final", label: "Act.Fin", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "nuevos", label: "Nuevos", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "bajas_netas", label: "Baj.Net", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "bajas_brutas", label: "Baj.Bru", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "churn_neto_pct", label: "Ch.Net%", fmt: function(v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "churn_bruto_pct", label: "Ch.Bru%", fmt: function(v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "reactivaciones", label: "React.", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "tasa_winback_pct", label: "Winback", fmt: function(v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "arpu", label: "ARPU", fmt: function(v) { return "$" + (v || 0).toFixed(2); } },
      { k: "total_billing", label: "Billing", fmt: function(v) { return "$" + Math.round(v || 0).toLocaleString(); } },
      { k: "tasa_aporte_react_pct", label: "Ap.Reac", fmt: function(v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "indice_reemplazo_react_pct", label: "Ind.Reem", fmt: function(v) { return (v || 0).toFixed(2) + "%"; } },
      { k: "adiciones_netas", label: "Ad.Net", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "adiciones_brutas", label: "Ad.Bru", fmt: function(v) { return (v || 0).toLocaleString(); } },
      { k: "corte_impagado", label: "Corte", fmt: function(v) { return (v || 0).toLocaleString(); } },
    ];
    Object.keys(dimensions).forEach(function (key) {
      var items = dimensions[key] || [];
      var title = nameMap[key] || key.toUpperCase();
      html += '<div class="col-12 mb-3"><div class="card" style="background-color:var(--surface-tertiary);border-color:var(--border-color)"><div class="card-header bg-transparent py-2"><span class="fw-bold" style="color:var(--text-primary)"><i class="bi bi-tag-fill me-2 modal-value-accent"></i>' + title + '</span></div><div class="card-body p-0"><div class="table-responsive" style="max-height:400px;overflow:auto"><table class="table table-sm table-hover align-middle mb-0 table-modal-dim" style="font-size:0.75rem;width:100%"><thead><tr>';
      /* Sticky header row with fixed "Valor" column on the left */
      html += '<th class="sticky-col sticky-header" style="left:0;min-width:120px">Valor</th>';
      cols.forEach(function(col) { html += '<th class="text-end sticky-header" style="min-width:75px">' + col.label + '</th>'; });
      html += '</tr></thead><tbody>';
      /* Sort rows by activos_final descending */
      items.sort(function(a, b) { return (b.activos_final || 0) - (a.activos_final || 0); });
      items.forEach(function (item) {
        var val = (!item.valor || item.valor === "None") ? "N/A" : item.valor;
        html += '<tr><td class="sticky-col fw-medium text-truncate" style="left:0;max-width:120px;color:var(--text-primary)" title="' + val + '">' + val + '</td>';
        cols.forEach(function(col) { html += '<td class="text-end" style="color:var(--text-primary)">' + col.fmt(item[col.k]) + '</td>'; });
        html += '</tr>';
      });
      html += '</tbody></table></div></div></div></div>';
    });
    c.innerHTML = html;
  }

  // --- Lifecycle Analysis ---
  var lifecycleCharts = { activo: null, reactivacion: null };
  window.runLifecycleAnalysis = function () {
    showLoading("Ejecutando analisis de ciclo de vida...");
    fetch("/api/lifecycle/run/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCsrfToken() },
    })
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        hideLoading();
        if (resp.status === "success") {
          loadLifecycleResults();
        } else {
          showToast("Error: " + (resp.message || "Desconocido"), "error");
        }
      })
      .catch(function () { hideLoading(); showToast("Error de conexion", "error"); });
  };
  function loadLifecycleResults() {
    fetch("/api/lifecycle/results/")
      .then(function (r) { return r.json(); })
      .then(function (resp) {
        if (resp.status === "success") {
          renderLifecycleResults(resp.data);
          loadSurvivalPage();
          showToast("Analisis de ciclo de vida completado", "success");
        } else {
          var el = document.getElementById("lifecycleEmptyMsg");
          if (el) el.classList.remove("d-none");
          var cont = document.getElementById("lifecycleResults");
          if (cont) cont.classList.add("d-none");
        }
      })
      .catch(function () {});
  }
  function renderLifecycleResults(data) {
    document.getElementById("lifecycleEmptyMsg").classList.add("d-none");
    document.getElementById("lifecycleResults").classList.remove("d-none");
    var isLight = document.documentElement.classList.contains("light-mode");
    var gridColor = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)";
    var tickColor = isLight ? "#64748b" : "#94a3b8";
    // Stats rows
    var statsHtml = "";
    function statBox(label, value, color, unit) {
      if (unit === undefined) unit = " d";
      if (value == null || (typeof value === "number" && isNaN(value))) value = "-";
      else value = String(Math.round(value)) + unit;
      return '<div class="col text-center px-2 py-2 border-end" style="border-color:' + gridColor + '"><div class="small text-secondary">' + label + '</div><div class="fw-bold fs-5" style="color:' + color + '">' + value + '</div></div>';
    }
    function sepRow() { return '</div></div><div class="col-12 mt-2"><div class="d-flex flex-wrap border rounded-3" style="border-color:' + gridColor + '">'; }
    // Row 1: Activo
    statsHtml += '<div class="col-12"><div class="d-flex flex-wrap border rounded-3" style="border-color:' + gridColor + '">';
    statsHtml += statBox("Mediana Activo", data.mediana_activo, "#2563eb");
    statsHtml += statBox("Promedio Activo", data.promedio_activo, "#3b82f6");
    statsHtml += statBox("P25 Activo", data.p25_activo, "#64748b");
    statsHtml += statBox("P75 Activo", data.p75_activo, "#94a3b8");
    statsHtml += statBox("Ciclos x Sub (prom)", data.ciclos_por_suscriptor && data.ciclos_por_suscriptor.promedio != null ? data.ciclos_por_suscriptor.promedio : "-", "#8b5cf6", "");
    statsHtml += statBox("Subs. Totales", data.suscriptores_totales, "#94a3b8", "");
    statsHtml += statBox("Nunca Inactivos", data.suscriptores_nunca_inactivos, "#94a3b8", "");
    // Row 2: Reactivacion
    statsHtml += sepRow();
    statsHtml += statBox("Mediana Reactivacion", data.mediana_reactivacion, "#10b981");
    statsHtml += statBox("Promedio Reactivacion", data.promedio_reactivacion, "#34d399");
    statsHtml += statBox("P25 Reactivacion", data.p25_reactivacion, "#64748b");
    statsHtml += statBox("P75 Reactivacion", data.p75_reactivacion, "#94a3b8");
    statsHtml += statBox("Total Reactivaciones", data.n_total_reactivacion, "#94a3b8", "");
    statsHtml += '</div></div>';
    document.getElementById("lifecycleStatsRow").innerHTML = statsHtml;
    // KM charts
    var opts = chartOpts({
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
      if (lifecycleCharts[canvasId.replace("lifecycleChart", "").toLowerCase()]) {
        lifecycleCharts[canvasId.replace("lifecycleChart", "").toLowerCase()].destroy();
      }
      var ctx = document.getElementById(canvasId);
      if (!ctx || !curve || !curve.length) return;
      var chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: curve.map(function (p) { return p.tiempo; }),
          datasets: [{ label: "Supervivencia", data: curve.map(function (p) { return p.sup; }), borderColor: color, backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, stepped: "before", fill: false, tension: 0 }],
        },
        options: opts,
      });
      lifecycleCharts[canvasId.replace("lifecycleChart", "").toLowerCase()] = chart;
    }
    drawLifecycleChart("lifecycleChartActivo", data.curva_activo, "#2563eb");
    drawLifecycleChart("lifecycleChartReactivacion", data.curva_reactivacion, "#10b981");
  }
})();
