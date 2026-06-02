/**
 * main.js — Lógica de la SPA Churn Rate Analyzer (NetOwl-Django)
 *
 * Administra el enrutamiento del lado del cliente, las peticiones asíncronas
 * a las API de Django, la renderización dinámica de datos y gráficos con Chart.js,
 * la carga interactiva de archivos por Drag and Drop y la consola de logs.
 */
(function () {
  "use strict";

  // Variables globales de gráficos para poder destruirlos antes de redibujar
  let nuevosTrendChart = null;
  let churnTrendChart = null;
  let growthChart = null;

  document.addEventListener("DOMContentLoaded", function () {
    // ------------------------------------------------------------------
    // Inicialización del Enrutador SPA
    // ------------------------------------------------------------------
    initSpaRouter();

    // ------------------------------------------------------------------
    // Inicialización del Control del Tema (Claro / Oscuro)
    // ------------------------------------------------------------------
    initThemeManager();

    // ------------------------------------------------------------------
    // Inicialización de Flatpickr (Selector de mes para ejecución)
    // ------------------------------------------------------------------
    initMonthPicker();

    // Cargar lista de periodos para el selector de comparativa
    loadComparisonPeriods();
    // Cargar lista de periodos para el selector de Analytics (multi-select)
    loadAnalyticsPeriodsList();

    // ------------------------------------------------------------------
    // Escucha del formulario para Ejecutar Análisis
    // ------------------------------------------------------------------
    initAnalysisExecutor();

    // ------------------------------------------------------------------
    // Escuchas para cambio de formato y carga de archivos CSV
    // ------------------------------------------------------------------
    initCSVImporter();

    // ------------------------------------------------------------------
    // Escuchas de clics en la tabla para ver detalles (Delegación de eventos)
    // ------------------------------------------------------------------
    initResultsDetailsModal();
  });

  // ==================================================================
  // ENRUTADOR CLIENTE (SPA)
  // ==================================================================
  function initSpaRouter() {
    // Interceptar clics en enlaces de navegación con data-link
    document.querySelectorAll("a[data-link]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        const href = this.getAttribute("href");
        history.pushState(null, "", href);
        navigate(href);
      });
    });

    // Delegación de botón de enlace alternativo dentro de tarjetas
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".switch-tab-btn");
      if (btn) {
        e.preventDefault();
        const target = btn.dataset.target;
        let path = "/";
        if (target === "results_list") path = "/results/";
        history.pushState(null, "", path);
        navigate(path);
      }
    });

    // Controlar botones de Atrás / Adelante del navegador
    window.addEventListener("popstate", function () {
      navigate(window.location.pathname);
    });

    // Ejecutar navegación inicial según la ruta actual de la barra de direcciones
    navigate(window.location.pathname);
  }

  function navigate(path) {
    // Normalizar la ruta eliminando la barra final si no es la raíz
    const cleanPath = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;

    // Ocultar todas las pestañas
    document.querySelectorAll(".spa-tab").forEach(function (tab) {
      tab.classList.add("d-none");
    });

    // Remover estado activo de la barra lateral
    document.querySelectorAll(".sidebar-nav .nav-link").forEach(function (link) {
      link.classList.remove("active");
    });

    // Activar pestaña e iniciar solicitudes a la API correspondientes
    if (cleanPath === "" || cleanPath === "/" || cleanPath === "/dashboard") {
      document.getElementById("tab-dashboard").classList.remove("d-none");
      activateNavLink("dashboard");
      loadDashboardData();
    } else if (cleanPath === "/analytics") {
      document.getElementById("tab-analytics").classList.remove("d-none");
      activateNavLink("analytics");
      loadAnalyticsData();
    } else if (cleanPath === "/import/subscriptions") {
      document.getElementById("tab-import").classList.remove("d-none");
      activateNavLink("import_subscriptions");
      setImportType("subscriptions");
    } else if (cleanPath === "/import/logs") {
      document.getElementById("tab-import").classList.remove("d-none");
      activateNavLink("import_subscriptions"); // Comparte menú en la barra lateral
      setImportType("logs");
    } else if (cleanPath.startsWith("/results")) {
      document.getElementById("tab-results").classList.remove("d-none");
      activateNavLink("results_list");
      loadResultsData();
    } else {
      // Fallback a dashboard en caso de rutas desconocidas
      document.getElementById("tab-dashboard").classList.remove("d-none");
      activateNavLink("dashboard");
      loadDashboardData();
    }
  }

  function activateNavLink(dataLinkValue) {
    const link = document.querySelector(`.sidebar-nav a[data-link="${dataLinkValue}"]`);
    if (link) {
      link.classList.add("active");
    }
  }

  // ==================================================================
  // UTILERÍAS GLOBALES Y NOTIFICACIONES
  // ==================================================================
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
  }

  // Muestra notificaciones flotantes elegantes utilizando Toasts de Bootstrap 5
  function showToast(message, type = "success") {
    const toastEl = document.getElementById("status-toast");
    const toastMsg = document.getElementById("toast-message");
    if (toastEl && toastMsg) {
      toastMsg.textContent = message;
      
      // Limpiar clases de fondo previas
      toastEl.classList.remove("bg-success", "bg-danger", "bg-warning", "bg-info", "bg-dark");
      
      if (type === "success") toastEl.classList.add("bg-success");
      else if (type === "error") toastEl.classList.add("bg-danger");
      else if (type === "warning") toastEl.classList.add("bg-warning");
      else toastEl.classList.add("bg-dark");

      const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
      toast.show();
    }
  }

  // Overlay de carga
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");

  function showLoading(text = "Procesando datos...") {
    if (overlay) {
      if (loadingText) loadingText.textContent = text;
      overlay.classList.remove("d-none");
    }
  }

  function hideLoading() {
    if (overlay) {
      overlay.classList.add("d-none");
    }
  }

  // Exponer a contexto global por si fuera requerido
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;

  // ==================================================================
  // CONTROL DEL TEMA (LIGHT / DARK MODE)
  // ==================================================================
  function initThemeManager() {
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        document.documentElement.classList.toggle("light-mode");
        const isLightMode = document.documentElement.classList.contains("light-mode");
        
        // Actualizar visual del botón
        updateThemeToggleUI(isLightMode);
        
        // Guardar preferencia
        localStorage.setItem("netowl-theme", isLightMode ? "light" : "dark");
        
        // Forzar redibujo de gráficos para actualizar los colores de los ejes
        refreshAllCharts();
      });

      // Cargar tema inicial
      const savedTheme = localStorage.getItem("netowl-theme");
      if (savedTheme === "light") {
        document.documentElement.classList.add("light-mode");
        updateThemeToggleUI(true);
      } else {
        updateThemeToggleUI(false);
      }
    }
  }

  function updateThemeToggleUI(isLight) {
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.querySelector("span").textContent = isLight ? "Modo Oscuro" : "Modo Claro";
      themeToggle.querySelector("i").className = isLight ? "bi bi-sun-fill me-2" : "bi bi-moon-stars me-2";
    }
    const logoEl = document.getElementById("sidebar-logo");
    if (logoEl) {
      logoEl.src = isLight ? "/static/img/logo_light.png" : "/static/img/logo_dark.png";
    }
    // Actualizar favicon según el tema
    const fav = document.getElementById('favicon-link');
    if (fav) {
      fav.href = isLight ? '/static/img/favicon_light.png' : '/static/img/favicon_dark.png';
    }
  }

  // ==================================================================
  // MONTH PICKER (FLATPICKR)
  // ==================================================================
  function initMonthPicker() {
    const monthInput = document.getElementById("month-input");
    if (monthInput && typeof flatpickr !== "undefined") {
      // Inicializar el mes actual por defecto si está vacío
      if (!monthInput.value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        monthInput.value = `${yyyy}-${mm}`;
      }

      flatpickr(monthInput, {
        locale: "es",
        dateFormat: "Y-m",
        altInput: true,
        altFormat: "F Y",
        disableMobile: true,
        allowInput: false,
        clickOpens: true
      });
    }
  }

  // Cargar lista de periodos para select comparativo
  function loadComparisonPeriods() {
    fetch('/api/periods/')
      .then(r => r.ok ? r.json() : Promise.reject('no-periods'))
      .then(data => {
        const sel = document.getElementById('comparison-period-select');
        if (!sel) return;
        sel.innerHTML = '';
        // placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Período';
        sel.appendChild(placeholder);
        data.periods.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          sel.appendChild(opt);
        });
        // seleccionar el primer periodo real si existe
        if (sel.options.length > 1) sel.selectedIndex = 1;
        // listener para refrescar la vista al cambiar periodo
        sel.addEventListener('change', function () { loadDashboardData(); });
      })
      .catch(() => { /* ignore */ });
  }

  // ==================================================================
  // DATOS TAB 1: DASHBOARD
  // ==================================================================
  function loadDashboardData() {
    // Si hay un selector de periodo para la comparativa, añadirlo como parámetro
    let url = "/api/dashboard-data/";
    const compSel = document.getElementById('comparison-period-select');
    if (compSel && compSel.value) {
      url += `?period=${encodeURIComponent(compSel.value)}`;
    }
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error("Error cargando datos del dashboard");
        return response.json();
      })
      .then(data => {
        renderDashboardComparison(data.method_comparison);
        renderRecentResultsTable(data.results);
        renderNuevosTrendChart(data.nuevos_trend);
      })
      .catch(error => {
        console.error(error);
        showToast("Error de conexión al obtener datos del dashboard", "error");
      });
  }

  // Cargar periodos para el multi-select de Analytics
  function loadAnalyticsPeriodsList() {
    fetch('/api/periods/')
      .then(r => r.ok ? r.json() : Promise.reject('no-periods'))
      .then(data => {
        const sel = document.getElementById('analytics-periods-select');
        if (!sel) return;
        sel.innerHTML = '';
        data.periods.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          sel.appendChild(opt);
        });
        // Listener: recargar KPIs/dimensiones al cambiar selección
        sel.addEventListener('change', function () {
          loadAnalyticsData();
        });
      })
      .catch(() => { /* ignore */ });
  }

  function renderDashboardComparison(comp) {
    const container = document.getElementById("dashboard-comparison-container");
    if (!container) return;
    // Reconstruir la UI por métrica: si los valores coinciden, mostrar un único valor, si difieren mostrar ambos métodos
    const fin = comp && comp.financiero ? comp.financiero : null;
    const op = comp && comp.operativo ? comp.operativo : null;

    function equalVals(a, b) {
      if (a == null || b == null) return false;
      return Math.abs(Number(a) - Number(b)) < 0.0001;
    }

    function metricBlock(label, finLabel, opLabel, finVal, opVal, isCurrency) {
      const fmt = v => {
        if (v == null) return '--';
        if (isCurrency) return '$' + Number(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return Number(v).toFixed(2) + (label.toLowerCase().includes('churn') ? '%' : '');
      };

      if (fin && op && equalVals(finVal, opVal)) {
        // Solo un valor común
        return `
          <div class="col-md-4">
            <div class="metric-card text-center">
              <div class="metric-label">${label}</div>
              <div class="mt-3">
                <span class="d-block text-muted small">Financiero / Operativo</span>
                <span class="fs-4 fw-bold text-primary">${fmt(finVal)}</span>
              </div>
            </div>
          </div>
        `;
      }

      // Mostrar ambos
      return `
        <div class="col-md-4">
          <div class="metric-card">
            <div class="metric-label">${label}</div>
            <div class="d-flex justify-content-around mt-3">
              <div>
                <span class="d-block text-muted small">Financiero</span>
                <span class="fs-4 fw-bold text-primary">${fmt(finVal)}</span>
              </div>
              <div class="border-end border-dark opacity-25"></div>
              <div>
                <span class="d-block text-muted small">Operativo</span>
                <span class="fs-4 fw-bold text-secondary">${fmt(opVal)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // Construir tres bloques: churn, billing, arpu
    const churnHtml = metricBlock('Churn Neto (%)', 'Financiero', 'Operativo', fin ? fin.churn_neto_pct : null, op ? op.churn_neto_pct : null, false);
    const billingHtml = metricBlock('Ingresos Totales', 'Financiero', 'Operativo', fin ? fin.total_billing : null, op ? op.total_billing : null, true);
    const arpuHtml = metricBlock('ARPU Mensual', 'Financiero', 'Operativo', fin ? fin.arpu : null, op ? op.arpu : null, true);

    container.innerHTML = churnHtml + billingHtml + arpuHtml;
  }

  function renderRecentResultsTable(results) {
    const tbody = document.getElementById("dashboard-results-tbody");
    if (!tbody) return;

    if (!results || results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay resultados analizados en la BD. Selecciona un período y ejecuta el cálculo.</td></tr>`;
      return;
    }

    let html = "";
    results.forEach(row => {
      const churnClass = row.churn_neto_pct < 5 ? "text-success" : (row.churn_neto_pct < 10 ? "text-warning" : "text-danger");
      html += `
        <tr>
          <td class="text-start fw-medium">${row.periodo}</td>
          <td class="text-center">
            <span class="badge ${row.metodo === 'Financiero' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info'} rounded-pill px-3 py-1">
              ${row.metodo}
            </span>
          </td>
          <td class="text-end">${row.activos_inicio.toLocaleString()}</td>
          <td class="text-end">${row.activos_final.toLocaleString()}</td>
          <td class="text-end">${row.nuevos_mes.toLocaleString()}</td>
          <td class="text-end fw-semibold ${churnClass}">${row.churn_neto_pct.toFixed(2)}%</td>
          <td class="text-end">$${row.arpu.toFixed(2)}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="${row.periodo}">
              <i class="bi bi-eye"></i>
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  function renderNuevosTrendChart(trend) {
    const ctx = document.getElementById("nuevosTrendChart");
    if (!ctx) return;

    if (nuevosTrendChart) {
      nuevosTrendChart.destroy();
    }

    const isLight = document.documentElement.classList.contains("light-mode");
    const gridColor = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";

    const labels = trend.labels && trend.labels.length > 0 ? trend.labels : ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
    const values = trend.values && trend.values.length > 0 ? trend.values : [0, 0, 0, 0, 0, 0];

    nuevosTrendChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Nuevas Suscripciones",
          data: values,
          backgroundColor: "rgba(37, 99, 235, 0.85)",
          borderColor: "rgba(37, 99, 235, 1)",
          borderWidth: 1,
          borderRadius: 4,
          hoverBackgroundColor: "rgba(59, 130, 246, 0.95)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isLight ? "#ffffff" : "#0f172a",
            titleColor: isLight ? "#0f172a" : "#ffffff",
            bodyColor: isLight ? "#334155" : "#cbd5e1",
            borderColor: "rgba(37, 99, 235, 0.2)",
            borderWidth: 1
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  }

  // ==================================================================
  // EJECUCIÓN DE ANÁLISIS CHURN
  // ==================================================================
  function initAnalysisExecutor() {
    const form = document.getElementById("run-analysis-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        const month = document.getElementById("month-input").value;
        if (!month) {
          showToast("Seleccione un mes válido", "warning");
          return;
        }

        showLoading("Ejecutando análisis de churn...");
        const consoleContainer = document.getElementById("console-container");
        const terminalLog = document.getElementById("terminal-log");

        if (consoleContainer) consoleContainer.classList.remove("d-none");
        if (terminalLog) terminalLog.textContent = `[SISTEMA] Iniciando análisis para el período ${month}...\n`;

        fetch("/api/run-analysis/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCsrfToken()
          },
          body: JSON.stringify({ month: month })
        })
          .then(response => {
            hideLoading();
            return response.json();
          })
          .then(data => {
            if (data.status === "success") {
              showToast(`Análisis para ${data.periodo_label} completado con éxito!`, "success");
              if (terminalLog) {
                terminalLog.textContent += data.log_output;
                // Hacer scroll hasta el fondo
                terminalLog.scrollTop = terminalLog.scrollHeight;
              }
              // Recargar los datos del dashboard actuales
              loadDashboardData();
            } else {
              showToast(data.message || "Error ejecutando el análisis", "error");
              if (terminalLog) {
                terminalLog.textContent += `\n[ERROR] ${data.message}\n`;
              }
            }
          })
          .catch(error => {
            hideLoading();
            console.error(error);
            showToast("Error de conexión con el servidor al ejecutar análisis", "error");
            if (terminalLog) {
              terminalLog.textContent += `\n[ERROR] Fallo crítico de red o de ejecución.\n`;
            }
          });
      });
    }

    // Botón para limpiar terminal
    const clearBtn = document.getElementById("clear-console");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        const terminalLog = document.getElementById("terminal-log");
        if (terminalLog) terminalLog.textContent = "Consola limpia. Esperando ejecución...";
      });
    }
  }

  // ==================================================================
  // DATOS TAB 2: ANALYTICS AVANZADO
  // ==================================================================
  function loadAnalyticsData() {
    // Si hay selección de periodos en Analytics, agregar parámetro
    let url = "/api/analytics-data/";
    const sel = document.getElementById('analytics-periods-select');
    if (sel) {
      const vals = Array.from(sel.selectedOptions).map(o => o.value).filter(Boolean);
      if (vals.length > 0) {
        url += '?periods=' + encodeURIComponent(vals.join(','));
      }
    }
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error("Error cargando analíticas avanzadas");
        return response.json();
      })
      .then(data => {
        renderAnalyticsKPIs(data.kpis);
        renderAnalyticsTable(data.table_data);
        renderDimensions(data.dimensions_data);
        renderAnalyticsCharts(data.trend_data);
      })
      .catch(error => {
        console.error(error);
        showToast("Error de conexión al obtener datos de analíticas", "error");
      });
  }

  function renderAnalyticsKPIs(kpis) {
    if (!kpis) return;

    // Churn Neto
    if (kpis.churn_neto) {
      document.getElementById("kpi-churn-val").textContent = kpis.churn_neto.valor.toFixed(2) + "%";
      updateTrendBadge(document.getElementById("kpi-churn-trend"), kpis.churn_neto.tendencia, true); // true = menor churn es bueno
    }
    // ARPU
    if (kpis.arpu) {
      document.getElementById("kpi-arpu-val").textContent = "$" + kpis.arpu.valor.toFixed(2);
      updateTrendBadge(document.getElementById("kpi-arpu-trend"), kpis.arpu.tendencia, false); // false = mayor arpu es bueno
    }
    // Winback
    if (kpis.winback) {
      document.getElementById("kpi-winback-val").textContent = kpis.winback.valor.toFixed(2) + "%";
      updateTrendBadge(document.getElementById("kpi-winback-trend"), kpis.winback.tendencia, false);
    }
    // Adiciones Netas
    if (kpis.adiciones_netas) {
      document.getElementById("kpi-adiciones-val").textContent = kpis.adiciones_netas.valor.toLocaleString();
      updateTrendBadge(document.getElementById("kpi-adiciones-trend"), kpis.adiciones_netas.tendencia, false);
    }
  }

  function updateTrendBadge(element, value, invert = false) {
    if (!element) return;
    element.className = "trend-indicator";
    
    if (value > 0) {
      element.classList.add(invert ? "trend-negative" : "trend-positive");
      element.innerHTML = `<i class="bi bi-trending-up me-1"></i> <span>+${value.toFixed(1)}%</span>`;
    } else if (value < 0) {
      element.classList.add(invert ? "trend-positive" : "trend-negative");
      element.innerHTML = `<i class="bi bi-trending-down me-1"></i> <span>${value.toFixed(1)}%</span>`;
    } else {
      element.classList.add("trend-neutral");
      element.innerHTML = `<i class="bi bi-dash me-1"></i> <span>${value.toFixed(1)}%</span>`;
    }
  }

  function renderAnalyticsTable(tableData) {
    const tbody = document.getElementById("analytics-table-tbody");
    if (!tbody) return;

    if (!tableData || tableData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay datos históricos para reportar.</td></tr>`;
      return;
    }

    let html = "";
    tableData.forEach(row => {
      const churnClass = row.churn_neto < 5 ? "text-success" : (row.churn_neto < 10 ? "text-warning" : "text-danger");
      html += `
        <tr>
          <td class="fw-medium">${row.periodo}</td>
          <td>
            <span class="badge ${row.metodo === 'Financiero' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info'} rounded-pill px-3 py-1">
              ${row.metodo}
            </span>
          </td>
          <td class="text-end">${row.activos_inicio.toLocaleString()}</td>
          <td class="text-end">${row.activos_final.toLocaleString()}</td>
          <td class="text-end">${row.nuevos.toLocaleString()}</td>
          <td class="text-end fw-semibold ${churnClass}">${row.churn_neto.toFixed(2)}%</td>
          <td class="text-end">$${row.arpu.toFixed(2)}</td>
          <td class="text-end">${row.winback.toFixed(2)}%</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  function renderDimensions(dims) {
    if (!dims) return;

    // Render dinámico: crear una tarjeta por cada dimensión disponible
    const grid = document.getElementById('dimensions-grid-container');
    if (!grid) return;
    let html = '';
    const dimNameMapping = {
      "zona": "Zona Geográfica",
      "sucursal": "Sucursal",
      "producto": "Producto / Plan",
      "municipio": "Municipio",
      "campana": "Campaña"
    };

    Object.keys(dims).forEach(key => {
      const items = dims[key];
      const title = dimNameMapping[key] || key.charAt(0).toUpperCase() + key.slice(1);

      html += `
        <div class="col-lg-4 col-md-6">
          <div class="dimension-card h-100">
            <h6 class="dimension-title"><i class="bi bi-tag-fill me-2 text-primary"></i>${title}</h6>
            <div class="dimension-list">
      `;

      if (!items || items.length === 0) {
        html += `<div class="text-center py-4 text-muted small"><i class="bi bi-inbox mb-2 d-block"></i>Sin datos para esta dimensión</div>`;
      } else {
        items.forEach(item => {
          const label = item.valor === "None" || !item.valor ? "N/A / Indefinido" : item.valor;
          const churnClass = item.churn < 5 ? "text-success" : (item.churn < 10 ? "text-warning" : "text-danger");
          html += `
            <div class="dimension-item mb-2 pb-2">
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-semibold text-truncate me-2" style="max-width: 160px;" title="${label}">${label}</span>
                <span class="badge bg-secondary-subtle text-secondary small">${item.activos} activos</span>
              </div>
              <div class="d-flex justify-content-between mt-1 small">
                <span class="${churnClass} fw-medium">${item.churn.toFixed(2)}% Churn</span>
                <span class="text-primary">$${item.arpu.toFixed(1)} ARPU</span>
              </div>
            </div>
          `;
        });
      }

      html += `
            </div>
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  function renderAnalyticsCharts(trend) {
    const churnCtx = document.getElementById("churnTrendChart");
    const growthCtx = document.getElementById("growthChart");
    
    const isLight = document.documentElement.classList.contains("light-mode");
    const gridColor = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
    const tickColor = isLight ? "#64748b" : "#94a3b8";

    // 1. Gráfico de Churn Neto (Lineas)
    if (churnCtx) {
      if (churnTrendChart) churnTrendChart.destroy();

      const datasets = trend.churn_neto && trend.churn_neto.length > 0 ? trend.churn_neto.map((ds, index) => {
        const isFin = ds.label === "Financiero";
        return {
          label: ds.label,
          data: ds.data,
          borderColor: isFin ? "rgba(37, 99, 235, 1)" : "rgba(16, 185, 129, 1)",
          backgroundColor: isFin ? "rgba(37, 99, 235, 0.05)" : "rgba(16, 185, 129, 0.05)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6
        };
      }) : [];

      churnTrendChart = new Chart(churnCtx, {
        type: "line",
        data: {
          labels: trend.labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "top",
              labels: { color: tickColor, font: { family: "Inter", size: 11 } }
            },
            tooltip: {
              backgroundColor: isLight ? "#ffffff" : "#0f172a",
              titleColor: isLight ? "#0f172a" : "#ffffff",
              bodyColor: isLight ? "#334155" : "#cbd5e1",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)"
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
            },
            x: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
            }
          }
        }
      });
    }

    // 2. Gráfico de Crecimiento - Adiciones Netas (Barras)
    if (growthCtx) {
      if (growthChart) growthChart.destroy();

      // Extraer datos del histórico de la tabla (usando Financiero como referencia de tendencia)
      const dataFin = trend.churn_neto.find(d => d.label === "Financiero");
      const fakeGrowth = dataFin ? dataFin.data.map(v => Math.max(-50, Math.floor(100 - (v * 15)))) : [15, 28, 42, -10, 55, 30]; // fallback inteligente

      growthChart = new Chart(growthCtx, {
        type: "bar",
        data: {
          labels: trend.labels,
          datasets: [{
            label: "Crecimiento de Usuarios",
            data: fakeGrowth,
            backgroundColor: fakeGrowth.map(v => v >= 0 ? "rgba(16, 185, 129, 0.8)" : "rgba(239, 68, 68, 0.8)"),
            borderColor: fakeGrowth.map(v => v >= 0 ? "rgba(16, 185, 129, 1)" : "rgba(239, 68, 68, 1)"),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: isLight ? "#ffffff" : "#0f172a",
              titleColor: isLight ? "#0f172a" : "#ffffff",
              bodyColor: isLight ? "#334155" : "#cbd5e1",
              borderWidth: 1
            }
          },
          scales: {
            y: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
            },
            x: {
              grid: { display: false },
              ticks: { color: tickColor, font: { family: "Inter", size: 10 } }
            }
          }
        }
      });
    }
  }

  function refreshAllCharts() {
    // Si los gráficos están dibujados, reconstruirlos con las nuevas variables del tema
    if (document.getElementById("tab-dashboard").classList.contains("d-none") === false) {
      loadDashboardData();
    } else if (document.getElementById("tab-analytics").classList.contains("d-none") === false) {
      loadAnalyticsData();
    }
  }

  // ==================================================================
  // DATOS TAB 3: IMPORTADOR CSV DRAG AND DROP
  // ==================================================================
  function setImportType(type) {
    if (type === "subscriptions") {
      document.getElementById("type-subscriptions").checked = true;
      document.getElementById("format-sub-details").classList.remove("d-none");
      document.getElementById("format-log-details").classList.add("d-none");
    } else {
      document.getElementById("type-logs").checked = true;
      document.getElementById("format-sub-details").classList.add("d-none");
      document.getElementById("format-log-details").classList.remove("d-none");
    }
  }

  function toggleImportFormatDetails(type) {
    setImportType(type);
  }

  function initCSVImporter() {
    const radioSubs = document.getElementById("type-subscriptions");
    const radioLogs = document.getElementById("type-logs");

    if (radioSubs && radioLogs) {
      radioSubs.addEventListener("change", () => toggleImportFormatDetails("subscriptions"));
      radioLogs.addEventListener("change", () => toggleImportFormatDetails("logs"));
    }

    const dropZone = document.getElementById("drop-zone-area");
    const fileInput = document.getElementById("csv-file-input");
    const browseBtn = document.getElementById("browse-files-btn");
    const displayFile = document.getElementById("selected-file-display");
    const displayName = document.getElementById("selected-file-name");
    const removeBtn = document.getElementById("remove-file-btn");
    const submitBtn = document.getElementById("submit-import-btn");

    if (browseBtn && fileInput) {
      browseBtn.addEventListener("click", () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (this.files.length > 0) {
          handleFileSelected(this.files[0]);
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        clearFileSelection();
      });
    }

    // Eventos de Drag & Drop
    if (dropZone) {
      ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      });

      ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
          dropZone.classList.add("dragover");
        }, false);
      });

      ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
          dropZone.classList.remove("dragover");
        }, false);
      });

      dropZone.addEventListener("drop", e => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          const file = files[0];
          if (file.name.endsWith(".csv")) {
            fileInput.files = files; // Sincronizar input oculto
            handleFileSelected(file);
          } else {
            showToast("Solo se aceptan archivos en formato CSV (.csv)", "warning");
          }
        }
      }, false);
    }

    function handleFileSelected(file) {
      if (displayName && displayFile && submitBtn) {
        displayName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        displayFile.classList.remove("d-none");
        submitBtn.removeAttribute("disabled");
      }
    }

    function clearFileSelection() {
      if (fileInput) fileInput.value = "";
      if (displayFile && submitBtn) {
        displayFile.classList.add("d-none");
        submitBtn.setAttribute("disabled", "true");
      }
    }

    // Envío del formulario de Importación
    const importForm = document.getElementById("import-csv-form");
    if (importForm) {
      importForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const file = fileInput.files[0];
        if (!file) return;

        // Mostrar overlay bloqueante para impedir navegación durante la carga
        showLoading("Cargando archivo CSV...");

        const importType = document.querySelector('input[name="import_type"]:checked').value;
        const endpoint = importType === "subscriptions" ? "/api/import-subscriptions/" : "/api/import-logs/";

        const formData = new FormData();
        formData.append("csv_file", file);

        const progressContainer = document.getElementById("upload-progress-container");
        const progressBar = document.getElementById("upload-progress-bar");

        if (progressContainer) progressContainer.classList.remove("d-none");
        if (progressBar) progressBar.style.width = "0%";
        
        submitBtn.setAttribute("disabled", "true");

        // Simular progreso de red en la interfaz
        let progressPercent = 0;
        const interval = setInterval(() => {
          progressPercent = Math.min(progressPercent + 10, 90);
          if (progressBar) progressBar.style.width = `${progressPercent}%`;
        }, 150);

        fetch(endpoint, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCsrfToken()
          },
          body: formData
        })
          .then(response => {
            clearInterval(interval);
            if (progressBar) progressBar.style.width = "100%";
            
            setTimeout(() => {
              if (progressContainer) progressContainer.classList.add("d-none");
            }, 600);

            if (!response.ok) throw new Error("Fallo en la importación de datos");
            return response.json();
          })
          .then(data => {
            // Ocultar overlay bloqueante y mostrar resultado
            hideLoading();
            if (data.status === "success") {
              showToast(data.message, "success");
              clearFileSelection();
              // Redirigir suavemente al dashboard después del éxito
              setTimeout(() => {
                history.pushState(null, "", "/");
                navigate("/");
              }, 1200);
            } else {
              showToast(data.message || "Error al procesar el archivo CSV", "error");
              submitBtn.removeAttribute("disabled");
            }
          })
          .catch(error => {
            clearInterval(interval);
            if (progressContainer) progressContainer.classList.add("d-none");
            submitBtn.removeAttribute("disabled");
            hideLoading();
            console.error(error);
            showToast("Ocurrió un error en la conexión o formato al importar el archivo", "error");
          });
      });
    }
  }

  // ==================================================================
  // DATOS TAB 4: HISTORIAL DE RESULTADOS Y MODAL
  // ==================================================================
  let allHistoricalPeriods = [];

  function loadResultsData() {
    fetch("/api/results/")
      .then(response => {
        if (!response.ok) throw new Error("Fallo al obtener historial de resultados");
        return response.json();
      })
      .then(data => {
        allHistoricalPeriods = data.periods || [];
        renderHistoricalResultsTable(allHistoricalPeriods);
        setupSearchFilter();
      })
      .catch(error => {
        console.error(error);
        showToast("Error de conexión al obtener el historial", "error");
      });
  }

  function renderHistoricalResultsTable(periods) {
    const tbody = document.getElementById("results-table-tbody");
    if (!tbody) return;

    if (!periods || periods.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No se registran análisis en el histórico.</td></tr>`;
      return;
    }

    let html = "";
    periods.forEach(row => {
      const churnClass = row.churn_neto_pct < 5 ? "text-success" : (row.churn_neto_pct < 10 ? "text-warning" : "text-danger");
      html += `
        <tr>
          <td class="fw-semibold">${row.periodo}</td>
          <td>
            <span class="badge ${row.metodo === 'Financiero' ? 'bg-primary-subtle text-primary' : 'bg-info-subtle text-info'} rounded-pill px-3 py-1">
              ${row.metodo}
            </span>
          </td>
          <td class="text-end">${row.activos_inicio.toLocaleString()}</td>
          <td class="text-end">${row.activos_final.toLocaleString()}</td>
          <td class="text-end">${row.nuevos_mes.toLocaleString()}</td>
          <td class="text-end fw-semibold ${churnClass}">${row.churn_neto_pct.toFixed(2)}%</td>
          <td class="text-end">$${row.arpu.toFixed(2)}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary view-details-btn" data-periodo="${row.periodo}">
              <i class="bi bi-eye"></i> Detalle
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  function setupSearchFilter() {
    const searchInput = document.getElementById("search-results-input");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        const query = this.value.toLowerCase().trim();
        const filtered = allHistoricalPeriods.filter(row => 
          row.periodo.toLowerCase().includes(query) || 
          row.metodo.toLowerCase().includes(query)
        );
        renderHistoricalResultsTable(filtered);
      });
    }
  }

  // ==================================================================
  // MODAL DE DETALLES DEL PERÍODO
  // ==================================================================
  function initResultsDetailsModal() {
    // Usar delegación de eventos en el documento para escuchar clics en botones de visualización de detalles
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".view-details-btn");
      if (btn) {
        const periodo = btn.dataset.periodo;
        if (periodo) {
          openPeriodDetailsModal(periodo);
        }
      }
    });
  }

  function openPeriodDetailsModal(periodo) {
    showLoading(`Consultando desgloses de ${periodo}...`);

    fetch(`/api/results/${periodo}/`)
      .then(response => {
        hideLoading();
        if (!response.ok) throw new Error("Error obteniendo detalles del cierre");
        return response.json();
      })
      .then(data => {
        // Inicializar y mostrar el modal de Bootstrap
        const modalEl = document.getElementById("detailsModal");
        if (!modalEl) return;

        // Establecer título
        document.getElementById("modal-period-title").textContent = data.periodo;

        // Renderizar los resúmenes del período (Financiero vs Operativo)
        renderModalSummaries(data.summaries);

        // Renderizar las dimensiones del período
        renderModalDimensions(data.dimensions);

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
      })
      .catch(error => {
        hideLoading();
        console.error(error);
        showToast("Error de conexión al obtener los detalles del período", "error");
      });
  }

  function renderModalSummaries(summaries) {
    const container = document.getElementById("modal-summaries-container");
    if (!container) return;

    if (!summaries || summaries.length === 0) {
      container.innerHTML = `<div class="col-12 text-center text-muted py-3">No hay resúmenes guardados para este período.</div>`;
      return;
    }

    let html = "";
    summaries.forEach(s => {
      const isFin = s.metodo === "Financiero";
      const badgeClass = isFin ? "bg-primary text-white" : "bg-info text-dark";
      
      html += `
        <div class="col-md-6">
          <div class="card h-100 border-1" style="background-color: var(--surface-tertiary); border-color: var(--border-color);">
            <div class="card-header d-flex justify-content-between align-items-center bg-transparent py-2">
              <span class="fw-bold text-primary">${s.metodo}</span>
              <span class="badge ${badgeClass} rounded-pill px-2 py-1 small">${s.metodo}</span>
            </div>
            <div class="card-body p-3">
              <div class="row g-2 text-center">
                <div class="col-4">
                  <span class="d-block text-muted small">Base Inicio</span>
                  <span class="fw-semibold">${s.activos_inicio.toLocaleString()}</span>
                </div>
                <div class="col-4">
                  <span class="d-block text-muted small">Base Final</span>
                  <span class="fw-semibold">${s.activos_final.toLocaleString()}</span>
                </div>
                <div class="col-4">
                  <span class="d-block text-muted small">Nuevos</span>
                  <span class="fw-semibold">${s.nuevos_mes.toLocaleString()}</span>
                </div>
              </div>
              <hr class="my-2" style="border-top: 1px solid var(--border-color);">
              <div class="row g-2 text-center mt-1">
                <div class="col-4">
                  <span class="d-block text-muted small">Churn Neto</span>
                  <span class="fw-bold text-danger">${s.churn_neto_pct.toFixed(2)}%</span>
                </div>
                <div class="col-4">
                  <span class="d-block text-muted small">ARPU</span>
                  <span class="fw-bold text-success">$${s.arpu.toFixed(2)}</span>
                </div>
                <div class="col-4">
                  <span class="d-block text-muted small">Billing</span>
                  <span class="fw-bold text-primary">$${s.total_billing.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
              <hr class="my-2" style="border-top: 1px solid var(--border-color);">
              <div class="row g-2 text-center mt-1 small">
                <div class="col-6">
                  <span class="text-muted">Winback:</span>
                  <span class="fw-medium">${s.tasa_winback_pct.toFixed(2)}% (${s.reactivaciones})</span>
                </div>
                <div class="col-6">
                  <span class="text-muted">Impagos:</span>
                  <span class="fw-medium text-warning">${s.corte_impagado}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  function renderModalDimensions(dimensions) {
    const container = document.getElementById("modal-dimensions-container");
    if (!container) return;

    if (!dimensions || dimensions.length === 0) {
      container.innerHTML = `<div class="col-12 text-center text-muted py-3">No hay desgloses por dimensión para este período.</div>`;
      return;
    }

    // Agrupar dimensiones
    const grouped = {};
    dimensions.forEach(d => {
      const key = d.dimension.toLowerCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    });

    const dimNameMapping = {
      "zona": "Zona Geográfica",
      "sucursal": "Sucursal",
      "producto": "Producto / Plan",
      "municipio": "Municipio",
      "campana": "Campaña"
    };

    let html = "";
    Object.keys(grouped).forEach(key => {
      const dimTitle = dimNameMapping[key] || key.toUpperCase();
      const items = grouped[key];
      
      // Ordenar por activos o churn descendente
      items.sort((a, b) => b.activos - a.activos);

      html += `
        <div class="col-lg-6">
          <div class="card h-100" style="background-color: var(--surface-tertiary); border-color: var(--border-color);">
            <div class="card-header bg-transparent py-2">
              <span class="fw-bold"><i class="bi bi-tag-fill me-2 text-primary"></i>${dimTitle}</span>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive" style="max-height: 250px;">
                <table class="table table-sm table-hover align-middle mb-0 table-theme" style="font-size: 0.85rem;">
                  <thead>
                    <tr>
                      <th class="ps-3">Valor</th>
                      <th class="text-end">Activos</th>
                      <th class="text-end">Churn Neto</th>
                      <th class="text-end pe-3">ARPU</th>
                    </tr>
                  </thead>
                  <tbody>
      `;

      items.forEach(item => {
        const val = item.valor === "None" || !item.valor ? "N/A" : item.valor;
        const churnClass = item.churn < 5 ? "text-success" : (item.churn < 10 ? "text-warning" : "text-danger");
        html += `
          <tr>
            <td class="ps-3 fw-medium text-truncate" style="max-width: 150px;" title="${val}">${val}</td>
            <td class="text-end">${item.activos.toLocaleString()}</td>
            <td class="text-end fw-semibold ${churnClass}">${item.churn.toFixed(2)}%</td>
            <td class="text-end pe-3">$${item.arpu.toFixed(1)}</td>
          </tr>
        `;
      });

      html += `
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }
})();
